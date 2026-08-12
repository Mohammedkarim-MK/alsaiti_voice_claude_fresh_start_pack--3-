-- The three things that were built in the database but had no way in: an admin view of
-- customers, usage against a plan limit, and inviting a colleague.
--
-- The governing rule for everything below: the platform administrator can see ACCOUNTS, never
-- CONTENT. Which businesses exist, what they pay, whether they are active — yes, that is what
-- running a subscription business requires. Their leads, calls, conversations and contacts — no,
-- not through any function here. tests/entitlements-live.js already proves the admin cannot read
-- a customer's leads, and nothing in this migration is allowed to weaken that: an admin who can
-- read customer data is a GDPR problem wearing a feature's clothes.

-- =====================================================================================
-- 1. Plans and their limits
-- =====================================================================================

-- Limits live in the database rather than in the browser because they decide what a customer is
-- owed. A limit that only exists in JavaScript is a number the customer can edit.
create table if not exists public.plans (
  code          text primary key,
  name          text not null,
  monthly_price numeric(10,2),
  currency      text not null default 'GBP',
  -- null for a key means "not metered on this plan"; 0 means "not available at all".
  limits        jsonb not null default '{}'::jsonb,
  sort_order    int not null default 0,
  active        boolean not null default true
);

insert into public.plans (code, name, monthly_price, limits, sort_order) values
  ('demo',    'Demo',     0,   '{"call_minutes":0,"leads":25,"members":1,"integrations":0}'::jsonb, 0),
  ('starter', 'Starter',  149, '{"call_minutes":300,"leads":500,"members":3,"integrations":1}'::jsonb, 1),
  ('growth',  'Growth',   349, '{"call_minutes":1000,"leads":5000,"members":10,"integrations":3}'::jsonb, 2),
  ('scale',   'Scale',    749, '{"call_minutes":3000,"leads":50000,"members":25,"integrations":10}'::jsonb, 3)
on conflict (code) do nothing;

alter table public.plans enable row level security;
drop policy if exists plans_read on public.plans;
-- Prices and limits are published on the pricing page anyway; there is nothing to hide, and the
-- app needs them to draw a usage bar.
create policy plans_read on public.plans for select to authenticated using (true);

create or replace function public.plan_limit(ws uuid, p_kind text)
returns numeric language sql stable security definer set search_path = public as $$
  select (p.limits ->> p_kind)::numeric
    from public.workspaces w
    left join public.plans p on p.code = coalesce(w.plan, 'demo')
   where w.id = ws;
$$;

-- =====================================================================================
-- 2. Usage against those limits
-- =====================================================================================

-- Calendar month, not a rolling anniversary. Both are defensible; the calendar month is the one
-- a customer can check against their own records without doing arithmetic, and a usage figure a
-- customer cannot verify is a usage figure they will dispute.
create or replace function public.usage_summary(ws uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  period_start timestamptz := date_trunc('month', now());
  result jsonb := '{}'::jsonb;
  r record;
begin
  if not public.is_member(ws) then
    return '{}'::jsonb;                       -- not your workspace, not your numbers
  end if;

  for r in
    select k.kind,
           coalesce(sum(u.quantity), 0)          as used,
           public.plan_limit(ws, k.kind)         as lim
      from (values ('call_minutes'), ('leads'), ('members'), ('integrations')) as k(kind)
      left join public.usage_ledger u
             on u.workspace_id = ws
            and u.kind = k.kind
            and u.occurred_at >= period_start
     group by k.kind
  loop
    result := result || jsonb_build_object(r.kind, jsonb_build_object(
      'used',  r.used,
      'limit', r.lim,
      -- Percent is null when there is no limit, so the UI can tell "unmetered" apart from
      -- "0% used" instead of drawing an empty bar for both.
      'percent', case when r.lim is null or r.lim = 0 then null
                      else round(least(100, (r.used / r.lim) * 100), 1) end
    ));
  end loop;

  -- Counts that are a state of the world rather than a ledger entry, so they are counted live.
  result := result || jsonb_build_object(
    'leads', jsonb_build_object(
      'used',  (select count(*) from public.leads l where l.workspace_id = ws),
      'limit', public.plan_limit(ws, 'leads'),
      'percent', case when coalesce(public.plan_limit(ws, 'leads'), 0) = 0 then null
                 else round(least(100, ((select count(*) from public.leads l where l.workspace_id = ws)::numeric
                       / public.plan_limit(ws, 'leads')) * 100), 1) end),
    'members', jsonb_build_object(
      'used',  (select count(*) from public.workspace_members m where m.workspace_id = ws),
      'limit', public.plan_limit(ws, 'members'),
      'percent', case when coalesce(public.plan_limit(ws, 'members'), 0) = 0 then null
                 else round(least(100, ((select count(*) from public.workspace_members m where m.workspace_id = ws)::numeric
                       / public.plan_limit(ws, 'members')) * 100), 1) end)
  );

  return result || jsonb_build_object(
    'period_start', period_start,
    'plan',         (select coalesce(w.plan, 'demo') from public.workspaces w where w.id = ws),
    'status',       (select w.subscription_status from public.workspaces w where w.id = ws));
end; $$;
grant execute on function public.usage_summary(uuid) to authenticated;

-- =====================================================================================
-- 3. The admin's view of the business — accounts only
-- =====================================================================================

create or replace function public.admin_list_workspaces()
returns table(
  id uuid, name text, owner_email text, subscription_status text, plan text,
  trial_ends_at timestamptz, subscribed_at timestamptz, created_at timestamptz,
  member_count bigint, lead_count bigint, last_lead_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  -- Note what is returned and what is not. Counts and timestamps tell the operator whether an
  -- account is alive and worth invoicing. No lead name, phone, email or note is selected here,
  -- and none should ever be added: the moment this function returns customer content, running
  -- the business and reading the customers stop being separable.
  return query
    select w.id, w.name, u.email::text, w.subscription_status, w.plan,
           w.trial_ends_at, w.subscribed_at, w.created_at,
           (select count(*) from public.workspace_members m where m.workspace_id = w.id),
           (select count(*) from public.leads l where l.workspace_id = w.id),
           (select max(l.created_at) from public.leads l where l.workspace_id = w.id)
      from public.workspaces w
      left join auth.users u on u.id = w.owner_id
     order by w.created_at desc;
end; $$;
grant execute on function public.admin_list_workspaces() to authenticated;

-- =====================================================================================
-- 4. Invitations
-- =====================================================================================

create table if not exists public.workspace_invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email        text not null,
  role         text not null check (role in ('admin','manager','staff','agent','readonly')),
  -- Only the hash is stored. A leaked database backup then contains no usable invitation link,
  -- which is the same reason a password is never stored either.
  token_hash   text not null unique,
  invited_by   uuid references auth.users(id) on delete set null,
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id) on delete set null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists invitations_ws_idx on public.workspace_invitations (workspace_id, created_at desc);
-- One live invitation per address per workspace; re-inviting replaces rather than accumulates.
create unique index if not exists invitations_live_unique
  on public.workspace_invitations (workspace_id, lower(email))
  where accepted_at is null and revoked_at is null;

alter table public.workspace_invitations enable row level security;

drop policy if exists invitations_read on public.workspace_invitations;
-- Admins see who has been invited to their own workspace. The token hash is not useful to them
-- and not useful to an attacker either, which is the point of storing only the hash.
create policy invitations_read on public.workspace_invitations
  for select to authenticated using (public.can_admin(workspace_id));

-- No INSERT/UPDATE/DELETE policy: invitations are created and accepted through the functions
-- below, so the member-limit check and the role check cannot be bypassed by writing the row
-- directly.

create or replace function public.invite_member(
  p_workspace uuid, p_email text, p_role text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_token text;
  v_used  bigint;
  v_limit numeric;
begin
  if not public.can_admin(p_workspace) then
    raise exception 'only an owner or admin may invite people' using errcode = '42501';
  end if;
  if not public.has_feature(p_workspace, 'team') then
    raise exception 'inviting team members requires a subscription' using errcode = '42501';
  end if;
  if p_role not in ('admin','manager','staff','agent','readonly') then
    raise exception 'unknown role: %', p_role using errcode = '22023';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'that does not look like an email address' using errcode = '22023';
  end if;

  -- Seats are part of what the customer bought, so the limit is enforced here rather than by
  -- hiding the button. Pending invitations count: otherwise twenty pending invites all accept.
  select count(*) into v_used from (
    select user_id from public.workspace_members where workspace_id = p_workspace
    union all
    select id from public.workspace_invitations
     where workspace_id = p_workspace and accepted_at is null and revoked_at is null
           and expires_at > now()
  ) s;
  v_limit := public.plan_limit(p_workspace, 'members');
  if v_limit is not null and v_used >= v_limit then
    raise exception 'your plan includes % seats, and all of them are used or invited', v_limit
      using errcode = '22023';
  end if;

  -- Replace any live invitation for the same address rather than colliding on the unique index.
  update public.workspace_invitations
     set revoked_at = now()
   where workspace_id = p_workspace and lower(email) = lower(p_email)
     and accepted_at is null and revoked_at is null;

  -- Two v4 UUIDs: ~244 bits of randomness, and no dependency on pgcrypto being on the
  -- search_path (which is exactly what broke 0006 the first time).
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.workspace_invitations (workspace_id, email, role, token_hash, invited_by)
  values (p_workspace, lower(p_email), p_role,
          encode(sha256(v_token::bytea), 'hex'), auth.uid());

  insert into public.audit_logs (workspace_id, actor_id, action, target_table, meta)
  values (p_workspace, auth.uid(), 'member.invited', 'workspace_invitations',
          jsonb_build_object('email', lower(p_email), 'role', p_role));

  -- The plaintext token is returned exactly once, to be put in the invitation link. It is not
  -- recoverable afterwards, by us or by anyone with the database.
  return jsonb_build_object('ok', true, 'token', v_token, 'email', lower(p_email), 'role', p_role);
end; $$;
grant execute on function public.invite_member(uuid, text, text) to authenticated;

create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv public.workspace_invitations;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  select * into inv from public.workspace_invitations
   where token_hash = encode(sha256(p_token::bytea), 'hex');

  -- One message for every failure. Distinguishing "no such invitation" from "already used" or
  -- "expired" would let someone probe for valid tokens.
  if not found or inv.accepted_at is not null or inv.revoked_at is not null
     or inv.expires_at <= now() then
    raise exception 'that invitation is not valid any more' using errcode = '22023';
  end if;

  -- Bound to the address it was sent to, so forwarding the link to somebody else does not work.
  if lower(coalesce((auth.jwt() ->> 'email'), '')) <> lower(inv.email) then
    raise exception 'this invitation was sent to %, so sign in as that address', inv.email
      using errcode = '42501';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, auth.uid(), inv.role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;

  update public.workspace_invitations
     set accepted_at = now(), accepted_by = auth.uid()
   where id = inv.id;

  insert into public.audit_logs (workspace_id, actor_id, action, target_table, meta)
  values (inv.workspace_id, auth.uid(), 'member.joined', 'workspace_members',
          jsonb_build_object('email', inv.email, 'role', inv.role));

  return jsonb_build_object('ok', true, 'workspace_id', inv.workspace_id, 'role', inv.role);
end; $$;
grant execute on function public.accept_invitation(text) to authenticated;

create or replace function public.revoke_invitation(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv public.workspace_invitations;
begin
  select * into inv from public.workspace_invitations where id = p_id;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if not public.can_admin(inv.workspace_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  update public.workspace_invitations set revoked_at = now()
   where id = p_id and accepted_at is null;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.revoke_invitation(uuid) to authenticated;

-- Removing someone has to be possible too, or the only way to revoke access is to delete the
-- account. An owner cannot be removed: a workspace with no owner cannot be administered.
create or replace function public.remove_member(p_workspace uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.can_admin(p_workspace) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if exists (select 1 from public.workspace_members
              where workspace_id = p_workspace and user_id = p_user and role = 'owner') then
    raise exception 'the owner cannot be removed from their own workspace' using errcode = '22023';
  end if;
  delete from public.workspace_members where workspace_id = p_workspace and user_id = p_user;
  insert into public.audit_logs (workspace_id, actor_id, action, target_table, target_id)
  values (p_workspace, auth.uid(), 'member.removed', 'workspace_members', p_user::text);
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- 'team' joins the paid features. Demo accounts are one person evaluating the product.
-- has_feature already falls through to is_subscribed for anything not free, so no change is
-- needed there — this comment exists so the feature name is discoverable from this file.
