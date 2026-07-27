-- Handoff §5.3 + §7.1 — make a marketing enquiry provably safe, and add the audit/timeline
-- entities the handoff requires.
--
-- The rule this migration exists to enforce: the website must never say "Sent" unless a row
-- is committed here. Everything below supports that claim being checkable after the fact —
-- a quotable reference, an idempotency key so a retry cannot double-book, and a notification
-- status that is allowed to say "we saved it but the email has not gone out yet".

-- ---------------------------------------------------------------------------------------
-- 1. contact_submissions — the fields §5.3 requires
-- ---------------------------------------------------------------------------------------

alter table public.contact_submissions
  -- Short, human-quotable reference so support can trace a submission over the phone.
  add column if not exists reference text,
  -- Stable per submission attempt. A double-click or a retry reuses it, so FORM-02 holds.
  add column if not exists idempotency_key text,
  -- Truthful delivery state. 'pending' is the honest default: the row is safe, the email is not sent yet.
  add column if not exists notification_status text not null default 'pending',
  add column if not exists notified_at timestamptz,
  add column if not exists notification_provider_id text,
  add column if not exists notification_error text,
  add column if not exists notification_attempts int not null default 0,
  -- Consent wording captured at submission time, so we can prove what was agreed to and when.
  add column if not exists consent_text text,
  add column if not exists consent_version text,
  add column if not exists consent_at timestamptz,
  -- Salted hash only, and ONLY when a salt is configured. A bare SHA-256 of an IPv4 address is
  -- reversible in seconds by brute force, so storing one would be false anonymisation. If
  -- CONTACT_IP_HASH_SALT is unset the function writes NULL rather than something misleading.
  add column if not exists ip_hash text,
  -- Reserved for routing marketing enquiries into a tenant workspace later. NULL today means
  -- "the Alsaiti Growth system inbox", which is where these currently land.
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

do $$ begin
  alter table public.contact_submissions
    add constraint contact_submissions_notification_status_ck
    check (notification_status in ('pending','sent','retry_required','failed'));
exception when duplicate_object then null; end $$;

-- Backfill references for any row captured before this migration, so every submission is quotable.
update public.contact_submissions
   set reference = 'AG-' || upper(encode(gen_random_bytes(4), 'hex'))
 where reference is null;

alter table public.contact_submissions
  alter column reference set default 'AG-' || upper(encode(gen_random_bytes(4), 'hex'));

create unique index if not exists contact_submissions_reference_key
  on public.contact_submissions (reference);
-- Partial: rows predating this migration have no key, and NULLs must not collide.
create unique index if not exists contact_submissions_idem_key
  on public.contact_submissions (idempotency_key) where idempotency_key is not null;
-- Drives the "notifications are failing" dashboard warning in §5.4.
create index if not exists contact_submissions_notification_idx
  on public.contact_submissions (notification_status, created_at desc)
  where notification_status <> 'sent';

-- ---------------------------------------------------------------------------------------
-- 2. lead_activities — §7.1 immutable timeline
-- ---------------------------------------------------------------------------------------

create table if not exists public.lead_activities (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id      uuid references public.leads(id) on delete cascade,
  kind         text not null check (kind in (
                 'created','notified','assigned','synced','called','status_changed',
                 'note_added','exported','deleted','sync_failed')),
  detail       jsonb not null default '{}'::jsonb,
  actor_id     uuid references auth.users(id) on delete set null,
  actor_label  text,                       -- 'system', 'voice agent', or a display name
  created_at   timestamptz not null default now()
);
create index if not exists lead_activities_lead_idx on public.lead_activities (lead_id, created_at desc);
create index if not exists lead_activities_ws_idx   on public.lead_activities (workspace_id, created_at desc);

alter table public.lead_activities enable row level security;

-- Read-only to members. There is deliberately no INSERT/UPDATE/DELETE policy: the timeline is
-- written by the service role only, which is what makes it trustworthy as an audit record.
drop policy if exists lead_activities_read on public.lead_activities;
create policy lead_activities_read on public.lead_activities
  for select to authenticated using (public.is_member(workspace_id));

-- ---------------------------------------------------------------------------------------
-- 3. notifications — §7.1 delivery status and retry history
-- ---------------------------------------------------------------------------------------

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references public.workspaces(id) on delete cascade,  -- NULL = system/marketing
  channel       text not null default 'email' check (channel in ('email','in_app','sms')),
  category      text not null check (category in (
                  'new_lead','urgent_lead','failed_crm_sync','integration_expired',
                  'missed_call','user_invitation','system_incident','contact_form')),
  -- Recipient is stored so an admin can see who was told. Never the provider API key.
  recipient     text,
  subject       text,
  status        text not null default 'pending'
                  check (status in ('pending','sent','retry_required','failed')),
  provider      text,
  provider_id   text,
  attempts      int not null default 0,
  last_error    text,
  related_table text,
  related_id    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists notifications_ws_idx     on public.notifications (workspace_id, created_at desc);
create index if not exists notifications_status_idx on public.notifications (status, created_at desc)
  where status <> 'sent';

alter table public.notifications enable row level security;

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
  for select to authenticated using (workspace_id is not null and public.is_member(workspace_id));

-- ---------------------------------------------------------------------------------------
-- 4. audit_logs — §4.4 + §7.1 security and admin actions
-- ---------------------------------------------------------------------------------------

create table if not exists public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text,
  action       text not null,              -- 'integration.connected', 'lead.exported', 'user.invited', …
  target_table text,
  target_id    text,
  -- Metadata must never carry secret values. The application is responsible for redacting
  -- before it writes; this comment is the contract.
  meta         jsonb not null default '{}'::jsonb,
  ip_hash      text,
  created_at   timestamptz not null default now()
);
create index if not exists audit_logs_ws_idx     on public.audit_logs (workspace_id, created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action, created_at desc);

alter table public.audit_logs enable row level security;

-- Only workspace owners and admins may read the audit trail — an agent should not be able to
-- review the security log of the business they work for.
drop policy if exists audit_logs_read on public.audit_logs;
create policy audit_logs_read on public.audit_logs
  for select to authenticated using (
    workspace_id is not null and exists (
      select 1 from public.workspace_members m
       where m.workspace_id = audit_logs.workspace_id
         and m.user_id = auth.uid()
         and m.role in ('owner','admin')
    )
  );
