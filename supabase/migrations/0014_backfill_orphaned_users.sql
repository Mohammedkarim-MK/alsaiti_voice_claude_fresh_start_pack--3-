-- Give a workspace to any account that does not have one.
--
-- on_auth_user_created → handle_new_user() builds profile + workspace + owner membership for every
-- new signup, and it works. But it only ever fires forward, so any account that existed before it
-- did has none of them. The live project has exactly one: founder+demo@alsaitigrowth.com, created
-- 5 July 2026 by the previous build tool, on the same day as the thirteen scaffolding tables 0000
-- removed. Signing in as it lands on a dashboard with no workspace behind it — every query returns
-- nothing, because is_member() is false for a user who is a member of nothing. It looks like the
-- product is broken rather than like the account is incomplete.
--
-- Written as a backfill over "users missing a workspace" rather than as a fix for that one row,
-- because the same hole opens any time an account is created by a route that bypasses the trigger:
-- the dashboard's Add User, a restore from backup, an admin API call during a future migration.
-- Idempotent — it does nothing on a healthy database.
--
-- Deliberately NOT deleting the legacy account. Removing someone's login is destructive and
-- irreversible, and whether that demo account is still wanted is the owner's call, not a
-- migration's. Repairing it costs an empty workspace; guessing wrong costs an account.

do $$
declare
  u record;
  ws uuid;
  n  int := 0;
begin
  for u in
    select au.id, au.email, au.raw_user_meta_data
      from auth.users au
     where not exists (
       select 1 from public.workspace_members m where m.user_id = au.id
     )
  loop
    -- profiles is keyed on the auth user id, so this is a no-op when the row already exists.
    insert into public.profiles (id, full_name)
    values (u.id, coalesce(u.raw_user_meta_data->>'full_name', ''))
    on conflict (id) do nothing;

    insert into public.workspaces (name, owner_id)
    values (coalesce(u.raw_user_meta_data->>'business_name', 'My workspace'), u.id)
    returning id into ws;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws, u.id, 'owner');

    n := n + 1;
    raise notice 'backfilled workspace for %', u.email;
  end loop;

  if n = 0 then
    raise notice 'no orphaned accounts — every user already has a workspace';
  end if;
end $$;
