-- One platform owner, and a demo tier that unlocks when a customer subscribes.
--
-- Two separate ideas, deliberately not merged:
--
--   member_role (0007) answers "what may this person do INSIDE their own business?" — owner,
--   admin, manager, staff, agent, readonly, demo. Every customer has an owner of their own
--   workspace, and that is correct: they run their business, not ours.
--
--   This migration adds the two things that role cannot express:
--     1. platform_admins — who runs ALSAITI. Exactly one person. Not a workspace role, because
--        it is not scoped to a workspace; it is the operator of the whole product.
--     2. workspaces.subscription_status — has this customer PAID? A workspace owner with a
--        demo subscription is still an owner; they simply cannot use the paid features yet.
--
-- Conflating those two would mean either every customer gets platform powers, or the only way to
-- gate a paid feature is to demote a paying customer below owner in their own business.
--
-- Everything here is enforced in the database. Hiding a button in the browser is a courtesy to
-- the user, not a control: anyone can call PostgREST directly with their own access token, so a
-- gate that lives only in JavaScript is not a gate. The RLS policies below are the actual gate.

-- =====================================================================================
-- 1. The platform owner
-- =====================================================================================

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  granted_at timestamptz not null default now(),
  note       text,
  -- Always true. It exists only to carry the unique index below, which is what physically
  -- prevents a second row: a partial unique index on a constant column allows exactly one row
  -- in the whole table. "Only one admin" is then a schema guarantee rather than a convention
  -- somebody has to remember, including a future me adding a second admin "just for testing".
  singleton  boolean not null default true
);
create unique index if not exists platform_admins_only_one on public.platform_admins ((singleton));

alter table public.platform_admins enable row level security;

-- Deliberately no policy at all: RLS on with zero policies denies every client, including the
-- admin's own session. The table is readable only by the service role and by the SECURITY DEFINER
-- function below. If the admin could SELECT it, so could anyone who worked out the table name,
-- and "who runs this platform" is not something to hand out.

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;
grant execute on function public.is_platform_admin() to authenticated;

-- =====================================================================================
-- 2. Subscription state on the workspace
-- =====================================================================================

alter table public.workspaces
  -- 'demo' is the default on purpose. A brand-new signup is a prospect, not a customer, and the
  -- safe default for an unknown account is the least access, not the most.
  add column if not exists subscription_status text not null default 'demo',
  add column if not exists plan               text,
  add column if not exists trial_ends_at      timestamptz,
  add column if not exists subscribed_at      timestamptz,
  add column if not exists cancelled_at       timestamptz,
  -- Who last changed the entitlement, so an upgrade is always attributable to a person.
  add column if not exists entitlement_note   text;

do $$ begin
  alter table public.workspaces
    add constraint workspaces_subscription_status_ck
    check (subscription_status in ('demo','trialing','active','past_due','cancelled','suspended'));
exception when duplicate_object then null; end $$;

create index if not exists workspaces_subscription_idx
  on public.workspaces (subscription_status) where subscription_status <> 'active';

-- Paid access, in one place. 'trialing' counts as paid: a trial that cannot use the product is
-- not a trial. 'past_due' also counts — cutting a paying customer off the instant a card fails
-- loses their leads over a billing glitch. 'suspended' is the deliberate, manual off switch.
create or replace function public.is_subscribed(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspaces w
     where w.id = ws
       and (
         w.subscription_status in ('active','past_due')
         or (w.subscription_status = 'trialing'
             and (w.trial_ends_at is null or w.trial_ends_at > now()))
       )
  );
$$;
grant execute on function public.is_subscribed(uuid) to authenticated;

-- =====================================================================================
-- 3. The single gate every feature asks
-- =====================================================================================

-- One function, so a new paid feature is one line here rather than a new bespoke policy that
-- might get the tenant check subtly wrong. Note the ordering: membership is checked FIRST and
-- always. A platform admin may bypass the SUBSCRIPTION, never the tenancy — see below.
create or replace function public.has_feature(ws uuid, feature text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  -- Not your workspace, not your data. This is the check that must never be bypassable.
  if not public.is_member(ws) then
    return false;
  end if;

  -- Free for everyone, including demo accounts: without these there is nothing to evaluate.
  if feature in ('view_dashboard','view_sample_leads','edit_profile','view_pricing') then
    return true;
  end if;

  -- The platform owner needs paid features inside their OWN workspace to build and support the
  -- product. They still had to pass is_member above, so this unlocks the paywall, not the tenant
  -- boundary — an admin still cannot read a customer's leads through this function.
  if public.is_platform_admin() then
    return true;
  end if;

  return public.is_subscribed(ws);
end; $$;
grant execute on function public.has_feature(uuid, text) to authenticated;

-- =====================================================================================
-- 4. Enforce it where the money is
-- =====================================================================================

-- Demo accounts may read their sample data and may not connect anything real. Integrations are
-- the line that matters: a real CRM connection, a real phone number or a real mailbox all cost
-- money to run and all touch a third party's data.
drop policy if exists "crm_connections member read" on public.crm_connections;
create policy "crm_connections member read" on public.crm_connections
  for select to authenticated using (public.is_member(workspace_id));

drop policy if exists crm_connections_write on public.crm_connections;
create policy crm_connections_write on public.crm_connections
  for all to authenticated
  using      (public.has_feature(workspace_id, 'integrations') and public.can_admin(workspace_id))
  with check (public.has_feature(workspace_id, 'integrations') and public.can_admin(workspace_id));

drop policy if exists telephony_connections_write on public.telephony_connections;
create policy telephony_connections_write on public.telephony_connections
  for all to authenticated
  using      (public.has_feature(workspace_id, 'telephony') and public.can_admin(workspace_id))
  with check (public.has_feature(workspace_id, 'telephony') and public.can_admin(workspace_id));

drop policy if exists email_connections_write on public.email_connections;
create policy email_connections_write on public.email_connections
  for all to authenticated
  using      (public.has_feature(workspace_id, 'email_inbox') and public.can_admin(workspace_id))
  with check (public.has_feature(workspace_id, 'email_inbox') and public.can_admin(workspace_id));

-- Publishing an assistant is what puts it in front of real callers, so it is a paid action.
-- Editing a draft is not: let a demo user build one and see the value before paying.
drop policy if exists assistants_write on public.assistants;
create policy assistants_write on public.assistants
  for all to authenticated
  using      (public.has_feature(workspace_id, 'assistants') and public.can_admin(workspace_id))
  with check (public.has_feature(workspace_id, 'assistants') and public.can_admin(workspace_id));

-- =====================================================================================
-- 5. Granting a subscription — the only supported route
-- =====================================================================================

-- SECURITY DEFINER with an explicit admin check inside, rather than an RLS policy on workspaces.
-- A customer legitimately owns their workspace row and can rename it; if entitlement lived in an
-- ordinary UPDATE policy, an owner could simply PATCH subscription_status='active' and grant
-- themselves the product for free. Routing it through a function makes the admin check
-- unavoidable, because the column is not writable by any client policy at all.
create or replace function public.set_subscription(
  p_workspace uuid,
  p_status    text,
  p_plan      text default null,
  p_note      text default null,
  p_trial_ends timestamptz default null
) returns public.workspaces language plpgsql security definer set search_path = public as $$
declare w public.workspaces;
begin
  if not public.is_platform_admin() then
    raise exception 'only the platform administrator may change a subscription'
      using errcode = '42501';
  end if;
  if p_status not in ('demo','trialing','active','past_due','cancelled','suspended') then
    raise exception 'unknown subscription status: %', p_status using errcode = '22023';
  end if;

  update public.workspaces
     set subscription_status = p_status,
         plan             = coalesce(p_plan, plan),
         trial_ends_at    = case when p_status = 'trialing' then p_trial_ends else trial_ends_at end,
         subscribed_at    = case when p_status = 'active' and subscribed_at is null
                                 then now() else subscribed_at end,
         cancelled_at     = case when p_status = 'cancelled' then now() else null end,
         entitlement_note = p_note
   where id = p_workspace
  returning * into w;

  if not found then
    raise exception 'workspace % not found', p_workspace using errcode = 'P0002';
  end if;

  -- Entitlement changes are money changes. They belong in the audit trail permanently.
  insert into public.audit_logs (workspace_id, actor_id, action, target_table, target_id, meta)
  values (p_workspace, auth.uid(), 'subscription.changed', 'workspaces', p_workspace::text,
          jsonb_build_object('status', p_status, 'plan', p_plan, 'note', p_note));

  return w;
end; $$;

revoke all on function public.set_subscription(uuid, text, text, text, timestamptz) from anon;
grant execute on function public.set_subscription(uuid, text, text, text, timestamptz) to authenticated;

-- =====================================================================================
-- 6. Read-only view of what the signed-in user is entitled to
-- =====================================================================================

-- So the browser can grey out what is locked without inventing its own copy of these rules and
-- drifting from them. It is a convenience for the UI; the policies above remain the enforcement.
create or replace function public.my_entitlements(ws uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.is_member(ws) then '{}'::jsonb else jsonb_build_object(
    'is_platform_admin', public.is_platform_admin(),
    'subscribed',        public.is_subscribed(ws),
    'status',            (select subscription_status from public.workspaces where id = ws),
    'plan',              (select plan from public.workspaces where id = ws),
    'trial_ends_at',     (select trial_ends_at from public.workspaces where id = ws),
    'features',          jsonb_build_object(
        'integrations', public.has_feature(ws, 'integrations'),
        'telephony',    public.has_feature(ws, 'telephony'),
        'email_inbox',  public.has_feature(ws, 'email_inbox'),
        'assistants',   public.has_feature(ws, 'assistants'),
        'exports',      public.has_feature(ws, 'exports'),
        'api_access',   public.has_feature(ws, 'api_access')
    )) end;
$$;
grant execute on function public.my_entitlements(uuid) to authenticated;
