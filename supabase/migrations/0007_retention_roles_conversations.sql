-- Handoff §18 (retention), §7.1 (conversations/messages), §6.3 (roles).
--
-- The Privacy Policy published on the site now commits to specific retention periods. Until
-- this migration nothing enforced them, which made the policy a promise the system did not
-- keep. It also fills the two remaining §7.1 entity gaps and replaces the flat
-- owner/admin/agent model with the role matrix §6.3 actually asks for.

-- =========================================================================================
-- 1. Roles (§6.3)
-- =========================================================================================
-- Previously: owner | admin | agent, and every member had full access to every lead.
-- 'agent' is kept as a synonym for 'staff' so existing rows stay valid and nothing breaks.

alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner','admin','manager','staff','agent','readonly','demo'));

-- Which leads a staff member may see needs a real user reference; `assignee` is free text and
-- cannot be trusted for authorisation.
alter table public.leads
  add column if not exists assignee_id uuid references auth.users(id) on delete set null;
create index if not exists leads_assignee_idx on public.leads (assignee_id);

/* The caller's role in a workspace, or NULL if they are not a member.
   SECURITY DEFINER so it bypasses RLS on workspace_members and cannot recurse. */
create or replace function public.member_role(ws uuid)
returns text language sql stable security definer set search_path = public as $$
  select m.role from public.workspace_members m
   where m.workspace_id = ws and m.user_id = auth.uid()
   limit 1;
$$;

/* Owner/admin: settings, users, integrations, billing. */
create or replace function public.can_admin(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.member_role(ws) in ('owner','admin');
$$;

/* Anyone who may change a lead. Read-only and demo deliberately excluded. */
create or replace function public.can_write_leads(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.member_role(ws) in ('owner','admin','manager','staff','agent');
$$;

-- Replace the blanket "any member can do anything" policy with the §6.3 matrix.
drop policy if exists "leads member access" on public.leads;

/* Read: every member, except that staff see only their own or unassigned leads.
   Owner/admin/manager/read-only see the whole workspace. */
drop policy if exists leads_read on public.leads;
create policy leads_read on public.leads
  for select to authenticated using (
    public.is_member(workspace_id) and (
      public.member_role(workspace_id) not in ('staff','agent')
      or assignee_id is null
      or assignee_id = auth.uid()
    )
  );

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
  for insert to authenticated with check (public.can_write_leads(workspace_id));

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
  for update to authenticated
  using      (public.can_write_leads(workspace_id))
  with check (public.can_write_leads(workspace_id));

/* Deleting a lead destroys evidence of an enquiry, so it is an admin action only (§8.1). */
drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads
  for delete to authenticated using (public.can_admin(workspace_id));

-- =========================================================================================
-- 2. Conversations and messages (§7.1)
-- =========================================================================================

create table if not exists public.conversations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id      uuid references public.leads(id) on delete set null,
  channel      text not null check (channel in ('web_chat','voice','sms','whatsapp','email')),
  status       text not null default 'open' check (status in ('open','closed','abandoned')),
  subject      text,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  -- Consent captured for this conversation, where recording or transcription applies (§18).
  consent_text text,
  consent_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists conversations_ws_idx   on public.conversations (workspace_id, started_at desc);
create index if not exists conversations_lead_idx on public.conversations (lead_id);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  role            text not null check (role in ('caller','assistant','agent','system')),
  body            text,
  -- Latency and provider errors belong here, not in the message body.
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

/* Read-only to members; written by the service role. A transcript nobody can edit after the
   fact is worth more than one anybody can tidy up. */
drop policy if exists conversations_read on public.conversations;
create policy conversations_read on public.conversations
  for select to authenticated using (public.is_member(workspace_id));

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages
  for select to authenticated using (public.is_member(workspace_id));

-- =========================================================================================
-- 3. Correlation IDs (§17.1)
-- =========================================================================================
-- One id that follows a single enquiry from the browser, through the function logs, into the
-- row, and on to the CRM sync. Without it, "a customer says they submitted at 14:20" is not
-- something you can actually trace through three systems.

alter table public.contact_submissions add column if not exists correlation_id text;
create index if not exists contact_submissions_correlation_idx
  on public.contact_submissions (correlation_id) where correlation_id is not null;

alter table public.lead_activities add column if not exists correlation_id text;
alter table public.notifications   add column if not exists correlation_id text;

-- =========================================================================================
-- 4. Retention (§18)
-- =========================================================================================
-- These periods are the ones published in the Privacy Policy. If you change one, change the
-- other in the same commit — a policy the system does not honour is worse than no policy.

create or replace function public.retention_sweep()
returns table(scope text, deleted bigint)
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  -- Enquiries: 24 months. The policy says "from your last contact"; created_at is the only
  -- timestamp we hold, so it is the honest proxy.
  delete from public.contact_submissions where created_at < now() - interval '24 months';
  get diagnostics n = row_count; scope := 'contact_submissions'; deleted := n; return next;

  -- Abuse and rate-limit state: 30 days.
  delete from public.rate_limits where window_start < now() - interval '30 days';
  get diagnostics n = row_count; scope := 'rate_limits'; deleted := n; return next;

  -- Delivery history: 24 months, matching the enquiries it describes.
  delete from public.notifications where created_at < now() - interval '24 months';
  get diagnostics n = row_count; scope := 'notifications'; deleted := n; return next;

  -- Raw provider webhook payloads: 90 days. Useful for disputes, not needed forever.
  if to_regclass('public.telephony_webhook_events') is not null then
    delete from public.telephony_webhook_events where received_at < now() - interval '90 days';
    get diagnostics n = row_count; scope := 'telephony_webhook_events'; deleted := n; return next;
  end if;

  -- Short-lived OAuth state. Anything this old is dead by definition.
  if to_regclass('public.oauth_authorisation_sessions') is not null then
    delete from public.oauth_authorisation_sessions where created_at < now() - interval '7 days';
    get diagnostics n = row_count; scope := 'oauth_authorisation_sessions'; deleted := n; return next;
  end if;

  -- NOT swept here, deliberately:
  --   leads, lead_activities  — tied to account lifetime; removed by ON DELETE CASCADE when a
  --                             workspace goes, which is the "90 days after closure" path.
  --   audit_logs              — a security record that a retention job must not quietly erase.
  return;
end; $$;

revoke all on function public.retention_sweep() from anon, authenticated;

comment on function public.retention_sweep() is
  'Handoff §18. Enforces the retention periods published in the Privacy Policy. Schedule daily.';

-- Schedule it if pg_cron is available. If the extension is not enabled on this project the
-- DO block is skipped rather than failing the migration — but then NOTHING enforces retention,
-- so enable pg_cron or run retention_sweep() from an external scheduler. See OPERATIONS.md.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not enabled - retention_sweep() must be scheduled externally';
    return;
  end if;
  -- Re-running this migration must not stack duplicate jobs.
  if exists (select 1 from cron.job where jobname = 'alsaiti_retention_sweep') then
    perform cron.unschedule('alsaiti_retention_sweep');
  end if;
  -- 03:17 daily. An odd minute rather than :00, so it does not contend with everything else
  -- on the box that also runs on the hour.
  perform cron.schedule('alsaiti_retention_sweep', '17 3 * * *', 'select public.retention_sweep()');
end $$;
