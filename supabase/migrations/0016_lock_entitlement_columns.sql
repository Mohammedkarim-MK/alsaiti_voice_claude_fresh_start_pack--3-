-- Stop a customer selling themselves the product for nothing.
--
-- 0015 put subscription_status on public.workspaces and routed every legitimate change through
-- set_subscription(), which checks is_platform_admin(). Its comment claimed the column "is not
-- writable by any client policy at all". That was simply false, and tests/entitlement-live.js
-- proved it on the first run:
--
--     PATCH /rest/v1/workspaces?id=eq.<own-workspace>  {"subscription_status":"active"}
--     -> HTTP 204, and the customer now has every paid feature.
--
-- The hole is a policy written in 0001, long before there was anything to pay for:
--
--     create policy "workspaces update" on public.workspaces for update using (owner_id = auth.uid());
--
-- That is right for what it was written for — an owner renaming their own business. But an RLS
-- policy grants the whole ROW, not selected columns, so the moment a billing column joined that
-- table the same policy started granting it too. Adding a paid column to a table that already had
-- a permissive owner-update policy is the entire bug.
--
-- Two independent locks, because this one is worth paying for twice:
--
--   1. Column privileges. Postgres checks these BEFORE RLS, and RLS cannot override them. The
--      owner keeps exactly the three columns they have any business editing.
--   2. A trigger. If a later migration re-grants UPDATE on the table — `grant update on all tables
--      in schema public`, the kind of line that gets pasted in to fix an unrelated permission
--      error — lock 1 silently disappears and nothing complains. The trigger fails loudly instead.
--
-- set_subscription() is unaffected: SECURITY DEFINER runs as the owner of the function, which is
-- not subject to the grants revoked here.

-- =====================================================================================
-- 1. Column-level privileges
-- =====================================================================================

revoke update on public.workspaces from authenticated;

-- Everything a workspace owner legitimately edits about their own business, and nothing else.
-- Deliberately excluded: owner_id (transferring a workspace needs its own audited flow, not a
-- silent PATCH), and every entitlement column.
grant update (name, industry, timezone) on public.workspaces to authenticated;

-- =====================================================================================
-- 2. The trigger that survives a careless re-grant
-- =====================================================================================

create or replace function public.guard_entitlement_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The admin path, and the service role, are allowed through. auth.uid() is null for the
  -- service role, which is how a backend job or set_subscription() run by the platform passes.
  if auth.uid() is null or public.is_platform_admin() then
    return new;
  end if;

  if new.subscription_status is distinct from old.subscription_status
     or new.plan             is distinct from old.plan
     or new.trial_ends_at    is distinct from old.trial_ends_at
     or new.subscribed_at    is distinct from old.subscribed_at
     or new.cancelled_at     is distinct from old.cancelled_at
     or new.entitlement_note is distinct from old.entitlement_note
     or new.owner_id         is distinct from old.owner_id then
    raise exception
      'subscription and ownership are set by the platform administrator, not by the workspace'
      using errcode = '42501';
  end if;

  return new;
end; $$;

drop trigger if exists workspaces_guard_entitlement on public.workspaces;
create trigger workspaces_guard_entitlement
  before update on public.workspaces
  for each row execute function public.guard_entitlement_columns();

-- =====================================================================================
-- 3. Repair anything already self-granted
-- =====================================================================================

-- The hole was open between 0015 and this migration. On the live project that window contained
-- one test workspace, but a paid status that nobody in set_subscription's audit trail ever
-- granted is by definition not a real subscription — so reset any workspace claiming paid access
-- without a corresponding audit_logs entry. A genuine grant always writes one.
update public.workspaces w
   set subscription_status = 'demo',
       entitlement_note    = 'reset by 0016: no audited grant exists for this subscription'
 where w.subscription_status in ('active','trialing','past_due')
   and not exists (
     select 1 from public.audit_logs a
      where a.action = 'subscription.changed'
        and a.target_id = w.id::text
   );
