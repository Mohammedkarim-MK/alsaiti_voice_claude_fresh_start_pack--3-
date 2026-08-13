-- Make the team list and the activity log answer the questions they exist to answer.
--
-- Two defects found by rendering the real screens with real data rather than by reading the code:
--
--   1. The team panel showed "60a4e3aa…" for each member. `profiles` is protected by
--      `for all using (id = auth.uid())` — correct for a profile, but it means a workspace owner
--      cannot read the name of anybody on their own team. So the Team screen listed a row of
--      truncated UUIDs and a Remove button beside each, which is the worst possible combination:
--      a destructive action next to an identifier the operator cannot resolve to a person.
--
--   2. audit_logs.actor_email was declared in 0006 and never written by anything. Every entry
--      therefore rendered as "system", including the ones a person did. The log's whole purpose
--      is answering "who did this", and it could not.

-- =====================================================================================
-- 1. Who is on my team
-- =====================================================================================

-- SECURITY DEFINER so it can read auth.users and profiles, with the membership check first.
-- Deliberately scoped to one workspace per call: there is no version of this that lists people
-- across workspaces, because the caller has no business seeing anyone outside their own.
create or replace function public.workspace_team(ws uuid)
returns table(user_id uuid, email text, full_name text, role text, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(ws) then
    -- Empty rather than an exception: a non-member asking is not an error worth surfacing,
    -- and an error message would confirm the workspace exists.
    return;
  end if;

  return query
    select m.user_id,
           u.email::text,
           coalesce(nullif(p.full_name, ''), split_part(u.email::text, '@', 1)) as full_name,
           m.role,
           m.created_at
      from public.workspace_members m
      join auth.users u on u.id = m.user_id
      left join public.profiles p on p.id = m.user_id
     where m.workspace_id = ws
     order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, u.email;
end; $$;
grant execute on function public.workspace_team(uuid) to authenticated;

-- =====================================================================================
-- 2. Who did this
-- =====================================================================================

-- A trigger rather than adding actor_email to a dozen insert statements. Every call site would
-- have to remember, and the one that forgets is the entry you most want to read six months later
-- during an incident. Doing it here means it cannot be forgotten, including by code not yet
-- written.
create or replace function public.fill_audit_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.actor_email is null and new.actor_id is not null then
    select u.email::text into new.actor_email from auth.users u where u.id = new.actor_id;
  end if;
  return new;
end; $$;

drop trigger if exists audit_logs_fill_actor on public.audit_logs;
create trigger audit_logs_fill_actor
  before insert on public.audit_logs
  for each row execute function public.fill_audit_actor();

-- Backfill what is already there, so the log is consistent rather than split into a period with
-- names and a period without.
update public.audit_logs a
   set actor_email = u.email::text
  from auth.users u
 where u.id = a.actor_id and a.actor_email is null;
