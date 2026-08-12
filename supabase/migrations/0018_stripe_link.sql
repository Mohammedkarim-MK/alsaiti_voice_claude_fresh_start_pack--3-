-- Link a workspace to its Stripe customer, and give the webhook a way to act.
--
-- set_subscription() checks is_platform_admin(), which is right for a human clicking a button
-- and wrong for a webhook: Stripe has no session and auth.uid() is null for the service role, so
-- the webhook would be refused by the very function it needs. Rather than weaken that check —
-- the check that stops customers upgrading themselves — the webhook gets its own entry point
-- that is not reachable by any client role at all.

alter table public.workspaces
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text;

-- Partial unique: one workspace per Stripe customer, but many workspaces legitimately have none.
create unique index if not exists workspaces_stripe_customer_key
  on public.workspaces (stripe_customer_id) where stripe_customer_id is not null;

-- These join the columns 0016 locked. The owner must not be able to point their workspace at
-- somebody else's Stripe customer and inherit their subscription.
create or replace function public.guard_entitlement_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_platform_admin() then
    return new;
  end if;

  if new.subscription_status is distinct from old.subscription_status
     or new.plan                   is distinct from old.plan
     or new.trial_ends_at          is distinct from old.trial_ends_at
     or new.subscribed_at          is distinct from old.subscribed_at
     or new.cancelled_at           is distinct from old.cancelled_at
     or new.entitlement_note       is distinct from old.entitlement_note
     or new.stripe_customer_id     is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.owner_id               is distinct from old.owner_id then
    raise exception
      'subscription and ownership are set by the platform administrator, not by the workspace'
      using errcode = '42501';
  end if;

  return new;
end; $$;

-- Column privileges are the first lock; re-assert them so the new columns are covered too.
revoke update on public.workspaces from authenticated;
grant update (name, industry, timezone) on public.workspaces to authenticated;

-- =====================================================================================
-- The webhook's entry point
-- =====================================================================================

create or replace function public.apply_stripe_subscription(
  p_customer_id     text,
  p_subscription_id text,
  p_status          text,
  p_plan            text default null,
  p_period_end      timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare w public.workspaces;
begin
  -- Reachable only by the service role. A signed-in user calling this would be trying to grant
  -- themselves a subscription by naming a Stripe customer, which is exactly what 0016 stopped.
  if auth.uid() is not null then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  select * into w from public.workspaces where stripe_customer_id = p_customer_id;
  if not found then
    -- Not an error worth failing the webhook over: Stripe legitimately sends events for
    -- customers created before checkout completed, and a 500 makes Stripe retry for days.
    return jsonb_build_object('ok', false, 'reason', 'no workspace for that stripe customer');
  end if;

  update public.workspaces
     set subscription_status     = p_status,
         plan                    = coalesce(p_plan, plan),
         stripe_subscription_id  = coalesce(p_subscription_id, stripe_subscription_id),
         subscribed_at           = case when p_status = 'active' and subscribed_at is null
                                        then now() else subscribed_at end,
         cancelled_at            = case when p_status = 'cancelled' then now() else null end,
         trial_ends_at           = case when p_status = 'trialing' then p_period_end else trial_ends_at end,
         entitlement_note        = 'stripe: ' || p_status
   where id = w.id;

  insert into public.audit_logs (workspace_id, actor_id, action, target_table, target_id, meta)
  values (w.id, null, 'subscription.changed', 'workspaces', w.id::text,
          jsonb_build_object('status', p_status, 'plan', p_plan, 'source', 'stripe',
                             'stripe_subscription_id', p_subscription_id));

  return jsonb_build_object('ok', true, 'workspace_id', w.id, 'status', p_status);
end; $$;

revoke all on function public.apply_stripe_subscription(text, text, text, text, timestamptz)
  from anon, authenticated;

-- Letting the administrator attach a Stripe customer to a workspace from the console, without
-- opening the column to the workspace owner.
create or replace function public.admin_link_stripe(p_workspace uuid, p_customer_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  update public.workspaces set stripe_customer_id = nullif(trim(p_customer_id), '')
   where id = p_workspace;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.admin_link_stripe(uuid, text) to authenticated;
