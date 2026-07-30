-- ============================================================================
--  Alsaiti Growth - RUN THIS ONCE, IN ONE GO.
--  Supabase dashboard -> SQL Editor -> New query -> paste ALL of this -> Run.
--
--  This is every migration concatenated in order. It is safe to re-run: every
--  statement uses "if not exists" / "create or replace" / "drop policy if exists".
--
--  GENERATED FILE - do not edit by hand. Edit the migration in
--  supabase/migrations/ and regenerate, or the two will drift apart and whoever
--  runs this will get a schema that does not match the code.
--
--  Preferred path is `supabase db push`. This file exists for when the CLI is
--  not available.
--
--  Migrations included:
--    0001_foundation.sql
--    0002_integrations_telephony.sql
--    0003_rate_limiting.sql
--    0004_token_refresh_lock.sql
--    0005_contact_submissions.sql
--    0006_lead_safety.sql
--    0007_retention_roles_conversations.sql
-- ============================================================================



-- ==========================================================================
-- 0001_foundation.sql
-- ==========================================================================

-- Alsaiti Voice — Phase 1 foundation schema
-- Multi-tenant workspaces + team + leads, with Row-Level Security.
-- Apply by pasting into the Supabase SQL editor, or `supabase db push`.

create extension if not exists "pgcrypto";

-- One profile per auth user ------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  created_at timestamptz not null default now()
);

-- A workspace = a business account ----------------------------------------
create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  industry   text,
  timezone   text default 'Europe/London',
  owner_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Team membership ----------------------------------------------------------
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'agent' check (role in ('owner','admin','agent')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Leads (statuses & sources exactly per the product spec) ------------------
create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  service      text,
  phone        text,
  email        text,
  urgency      text default 'Medium'        check (urgency in ('High','Medium','Low')),
  source       text default 'Manual import' check (source  in ('Voice call','Website chat','Contact form','Manual import','API','CRM')),
  status       text default 'New'           check (status  in ('New','Contacted','Qualified','Booked','Won','Lost','Spam')),
  score        int  default 50              check (score between 0 and 100),
  summary      text,
  notes        text,
  assignee     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists leads_workspace_created_idx on public.leads (workspace_id, created_at desc);

-- Membership check (SECURITY DEFINER so it bypasses RLS and avoids recursion)
create or replace function public.is_member(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

-- Row-Level Security -------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.workspaces         enable row level security;
alter table public.workspace_members  enable row level security;
alter table public.leads              enable row level security;

create policy "profiles self" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "workspaces read"   on public.workspaces for select using (owner_id = auth.uid() or public.is_member(id));
create policy "workspaces insert" on public.workspaces for insert with check (owner_id = auth.uid());
create policy "workspaces update" on public.workspaces for update using (owner_id = auth.uid());
create policy "workspaces delete" on public.workspaces for delete using (owner_id = auth.uid());

create policy "members read"   on public.workspace_members for select using (public.is_member(workspace_id));
create policy "members manage" on public.workspace_members for all
  using      (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));

create policy "leads member access" on public.leads
  for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

-- keep leads.updated_at fresh ---------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

-- On signup: create the profile + first workspace + owner membership -------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  insert into public.profiles (id, full_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  insert into public.workspaces (name, owner_id)
    values (coalesce(new.raw_user_meta_data->>'business_name','My workspace'), new.id)
    returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role)
    values (ws, new.id, 'owner');
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();


-- ==========================================================================
-- 0002_integrations_telephony.sql
-- ==========================================================================

-- Alsaiti Voice — Phase 2: CRM integrations + telephony + OAuth, on the Phase-1 foundation.
-- Pairs with the Supabase Edge Functions in supabase/functions/. Apply AFTER 0001_foundation.sql
-- (paste into the Supabase SQL editor, or `supabase db push`).
--
-- Security model:
--   * Members of a workspace may READ their own connections / numbers / call sessions / logs.
--   * NOTHING that holds a secret is client-readable. Tokens live ONLY in crm_credentials /
--     telephony_credentials as AES-256-GCM ciphertext, written by the service role (Edge Functions).
--   * A CRM shows 'connected' only after a real API test passes; a number shows 'active' only
--     after a real inbound test call is recorded. Those transitions happen server-side.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Encrypted credential blobs (service-role ONLY — never exposed to anon/authenticated)
-- ---------------------------------------------------------------------------
create table if not exists public.crm_credentials (
  id         uuid primary key default gen_random_uuid(),
  ciphertext text not null,                 -- "iv.ct" base64 (AES-256-GCM of the TokenSet JSON)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.crm_credentials enable row level security;
revoke all on public.crm_credentials from anon, authenticated;

create table if not exists public.telephony_credentials (
  id         uuid primary key default gen_random_uuid(),
  ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.telephony_credentials enable row level security;
revoke all on public.telephony_credentials from anon, authenticated;

-- ---------------------------------------------------------------------------
-- OAuth authorisation sessions (state is a secret — service-role only)
-- ---------------------------------------------------------------------------
create table if not exists public.oauth_authorisation_sessions (
  id                        uuid primary key default gen_random_uuid(),
  workspace_id              uuid not null references public.workspaces(id) on delete cascade,
  user_id                   uuid references auth.users(id) on delete set null,
  provider                  text not null,
  state_hash                text not null unique,   -- sha256(random state); exact-match on callback
  pkce_verifier_ciphertext  text,
  requested_scopes          text[] not null default '{}',
  redirect_uri              text not null,          -- the Edge Function callback URL
  return_url                text,                   -- where to send the browser after callback
  status                    text not null default 'authorising'
                              check (status in ('authorising','callback_received','completed','error')),
  error_code                text,
  error_message             text,
  expires_at                timestamptz not null,
  completed_at              timestamptz,
  created_at                timestamptz not null default now()
);
create index if not exists oauth_sessions_ws_idx on public.oauth_authorisation_sessions (workspace_id, created_at desc);
alter table public.oauth_authorisation_sessions enable row level security;
revoke all on public.oauth_authorisation_sessions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- CRM connections (members may READ; only the service role writes)
-- ---------------------------------------------------------------------------
create table if not exists public.crm_connections (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references public.workspaces(id) on delete cascade,
  provider               text not null,
  -- Truthful states only. 'demo' is a labelled simulation; everything else is real.
  status                 text not null default 'needs_setup'
                           check (status in ('demo','needs_setup','authorising','test_required',
                                             'connected','attention_required','error','disconnected')),
  external_account_id    text,
  external_account_name  text,
  external_user_id       text,
  external_user_name     text,
  credential_reference   text,                 -- e.g. crmcred://<uuid> — never a raw token
  token_expires_at       timestamptz,
  granted_scopes         text[] not null default '{}',
  instance_url           text,                 -- Salesforce
  api_domain             text,                 -- Zoho / Pipedrive
  metadata               jsonb not null default '{}',   -- pipelines / stages / owners / fields
  sync_enabled           boolean not null default true,
  last_authorised_at     timestamptz,
  last_refreshed_at      timestamptz,
  last_tested_at         timestamptz,
  last_success_at        timestamptz,
  last_failure_at        timestamptz,
  last_error             jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (workspace_id, provider, external_account_id)
);
create index if not exists crm_conn_ws_idx on public.crm_connections (workspace_id, created_at desc);
alter table public.crm_connections enable row level security;
create policy "crm_connections member read" on public.crm_connections
  for select using (public.is_member(workspace_id));
-- No insert/update/delete policy → only the service role (Edge Functions) may write.

-- Audit trail of every OAuth event (members may read their own; service role writes)
create table if not exists public.provider_oauth_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references public.workspaces(id) on delete cascade,
  provider      text not null,
  event_type    text not null,
  detail        jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists oauth_events_ws_idx on public.provider_oauth_events (workspace_id, created_at desc);
alter table public.provider_oauth_events enable row level security;
create policy "oauth_events member read" on public.provider_oauth_events
  for select using (public.is_member(workspace_id));

-- Per-lead CRM sync status (members read; service role writes)
create table if not exists public.crm_sync_records (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  connection_id  uuid not null references public.crm_connections(id) on delete cascade,
  lead_id        uuid references public.leads(id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending','synced','failed')),
  external_ids   jsonb not null default '{}',
  last_event_id  text,
  error          jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (connection_id, lead_id)
);
create index if not exists crm_sync_ws_idx on public.crm_sync_records (workspace_id, updated_at desc);
alter table public.crm_sync_records enable row level security;
create policy "crm_sync member read" on public.crm_sync_records
  for select using (public.is_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Telephony — Telnyx-first (provider column keeps Twilio/SIP addable later)
-- ---------------------------------------------------------------------------
create table if not exists public.telephony_connections (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  provider              text not null default 'telnyx',
  mode                  text not null default 'api_key'
                          check (mode in ('api_key','managed','oauth')),
  status                text not null default 'needs_setup'
                          check (status in ('demo','needs_setup','verifying','connected','attention_required','error','disconnected')),
  credential_reference  text,
  external_account_id   text,
  external_account_name text,
  last_verified_at      timestamptz,
  last_error            jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (workspace_id, provider)
);
alter table public.telephony_connections enable row level security;
create policy "tele_conn member read" on public.telephony_connections
  for select using (public.is_member(workspace_id));

create table if not exists public.phone_numbers (
  id                       uuid primary key default gen_random_uuid(),
  workspace_id             uuid not null references public.workspaces(id) on delete cascade,
  provider                 text not null default 'telnyx',
  provider_number_id       text,
  provider_order_id        text,
  e164                     text not null,
  country                  text,
  number_type              text,
  capabilities             text[] not null default '{}',
  -- 'active' ONLY after a real inbound test call is recorded (see call_sessions).
  status                   text not null default 'ordering'
                             check (status in ('demo','searching','ordering','ordered','configuring','test_pending','active','attention_required','error','released')),
  voice_application_id     text,
  monthly_cost             text,
  currency                 text,
  last_tested_at           timestamptz,
  last_inbound_call_at     timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (provider, provider_number_id)
);
create index if not exists phone_numbers_ws_idx on public.phone_numbers (workspace_id, created_at desc);
alter table public.phone_numbers enable row level security;
create policy "phone_numbers member read" on public.phone_numbers
  for select using (public.is_member(workspace_id));

create table if not exists public.call_sessions (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  provider           text not null default 'telnyx',
  provider_call_id   text,
  direction          text check (direction in ('inbound','outbound')),
  status             text,
  from_e164          text,
  to_e164            text,
  started_at         timestamptz,
  answered_at        timestamptz,
  ended_at           timestamptz,
  lead_id            uuid references public.leads(id) on delete set null,
  transcript         jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (provider, provider_call_id)   -- exactly-once: one lead per call, enforced in the lead service
);
create index if not exists call_sessions_ws_idx on public.call_sessions (workspace_id, created_at desc);
alter table public.call_sessions enable row level security;
create policy "call_sessions member read" on public.call_sessions
  for select using (public.is_member(workspace_id));

create table if not exists public.telephony_webhook_events (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null default 'telnyx',
  provider_event_id  text,
  event_type         text,
  verified           boolean not null default false,
  payload            jsonb,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  unique (provider, provider_event_id)
);
alter table public.telephony_webhook_events enable row level security;
revoke all on public.telephony_webhook_events from anon, authenticated;  -- service role only

-- keep updated_at fresh on the new tables
drop trigger if exists crm_conn_touch on public.crm_connections;
create trigger crm_conn_touch before update on public.crm_connections
  for each row execute function public.touch_updated_at();
drop trigger if exists phone_numbers_touch on public.phone_numbers;
create trigger phone_numbers_touch before update on public.phone_numbers
  for each row execute function public.touch_updated_at();
drop trigger if exists call_sessions_touch on public.call_sessions;
create trigger call_sessions_touch before update on public.call_sessions
  for each row execute function public.touch_updated_at();


-- ==========================================================================
-- 0003_rate_limiting.sql
-- ==========================================================================

-- Alsaiti Voice — Phase 3: rate limiting for the Edge Functions.
-- No Redis needed: a single atomic Postgres function does check-and-increment in one
-- statement, so concurrent requests can't race past the limit.
--
-- Buckets are opaque strings, e.g.  user:<uuid>:crm-authorise  or  ip:1.2.3.4:telnyx-webhook
-- Rows are self-expiring (the window resets in-place), and a cleanup helper prunes stale ones.

create table if not exists public.rate_limits (
  bucket       text primary key,
  hits         integer     not null default 0,
  window_start timestamptz not null default now()
);

-- Service-role only: clients must never read or forge rate-limit state.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

-- Atomic check-and-increment.
--   returns allowed=false once hits exceed p_limit inside the rolling window.
--   retry_after = seconds until the current window resets.
create or replace function public.rate_limit_hit(
  p_bucket text,
  p_limit  integer,
  p_window_seconds integer
)
returns table(allowed boolean, remaining integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
  v_start timestamptz;
begin
  -- Single statement: insert the bucket, or reset/increment it if it already exists.
  insert into public.rate_limits as rl (bucket, hits, window_start)
  values (p_bucket, 1, now())
  on conflict (bucket) do update
    set hits = case
                 when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
                 else rl.hits + 1
               end,
        window_start = case
                 when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
                 else rl.window_start
               end
  returning rl.hits, rl.window_start into v_hits, v_start;

  return query select
    (v_hits <= p_limit),
    greatest(0, p_limit - v_hits),
    greatest(0, ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - now())))::integer);
end;
$$;

-- Only the service role may call it (Edge Functions); never expose to the browser.
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;

-- Housekeeping: drop windows older than a day. Call from a cron job, or ignore —
-- the table stays tiny because buckets are reused in place.
create or replace function public.rate_limit_cleanup()
returns void language sql security definer set search_path = public as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
$$;
revoke all on function public.rate_limit_cleanup() from public, anon, authenticated;


-- ==========================================================================
-- 0004_token_refresh_lock.sql
-- ==========================================================================

-- Alsaiti Voice — Phase 4: distributed lock for OAuth token refresh.
--
-- Problem: two requests can notice an expiring token at the same moment and BOTH call the
-- provider's refresh endpoint. Most providers (HubSpot included) invalidate the previous
-- refresh token when a new one is issued, so the slower response overwrites the newer tokens
-- with ones the provider has already revoked — the connection dies until the user re-authorises.
--
-- Fix: a short TTL lock. Only one request refreshes; the others wait and re-read the result.
-- TTL-based (not pg_advisory_lock) because Edge Functions run on a pooled connection where a
-- session-scoped lock may outlive or escape its request.

create table if not exists public.token_refresh_locks (
  connection_id uuid        primary key,
  locked_until  timestamptz not null
);

alter table public.token_refresh_locks enable row level security;
revoke all on public.token_refresh_locks from anon, authenticated;   -- service role only

-- Atomically acquire the lock. Returns true ONLY to the caller that took it.
-- The `where` on the conflict branch means a live lock is never stolen: the update is skipped,
-- RETURNING yields no row, and the caller gets false.
create or replace function public.try_lock_refresh(
  p_connection uuid,
  p_ttl_seconds integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_acquired boolean;
begin
  insert into public.token_refresh_locks as l (connection_id, locked_until)
  values (p_connection, v_now + make_interval(secs => p_ttl_seconds))
  on conflict (connection_id) do update
     set locked_until = v_now + make_interval(secs => p_ttl_seconds)
     where l.locked_until < v_now          -- only take over an EXPIRED lock
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

-- Release early so waiters don't sit out the full TTL.
create or replace function public.unlock_refresh(p_connection uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.token_refresh_locks where connection_id = p_connection;
$$;

revoke all on function public.try_lock_refresh(uuid, integer) from public, anon, authenticated;
revoke all on function public.unlock_refresh(uuid) from public, anon, authenticated;


-- ==========================================================================
-- 0005_contact_submissions.sql
-- ==========================================================================

-- Website contact-form submissions — captured server-side so marketing enquiries are never lost.
-- Writes happen only via the contact-submit Edge Function (service role, bypasses RLS).
-- Any signed-in user may READ them (single-tenant demo: the owner reviews enquiries).

create table if not exists public.contact_submissions (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text,
  last_name  text,
  business   text,
  email      text,
  phone      text,
  whatsapp   text,
  industry   text,
  system     text,
  message    text,
  source     text not null default 'website_form',
  user_agent text
);

alter table public.contact_submissions enable row level security;

-- No INSERT/UPDATE/DELETE policy → only the service role (the Edge Function) can write. Locked down.
drop policy if exists contact_submissions_read on public.contact_submissions;
create policy contact_submissions_read on public.contact_submissions
  for select to authenticated using (true);

create index if not exists contact_submissions_created_idx on public.contact_submissions (created_at desc);


-- ==========================================================================
-- 0006_lead_safety.sql
-- ==========================================================================

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


-- ==========================================================================
-- 0007_retention_roles_conversations.sql
-- ==========================================================================

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
