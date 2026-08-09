-- ============================================================================
--  Alsaiti Growth - RUN THIS ONCE, IN ONE GO.
--  Supabase dashboard -> SQL Editor -> New query -> paste ALL of this -> Run.
--
--  This is every migration concatenated in order. It is safe to re-run: every
--  statement uses "if not exists" / "create or replace" / "drop policy if exists",
--  and 0000 drops a table only after checking at run time that it is empty.
--
--  GENERATED FILE - do not edit by hand. Edit the migration in
--  supabase/migrations/ and run:  node tools/build-sql-bundle.js
--
--  Migrations included:
--    0000_drop_lovable_scaffolding.sql
--    0001_foundation.sql
--    0002_integrations_telephony.sql
--    0003_rate_limiting.sql
--    0004_token_refresh_lock.sql
--    0005_contact_submissions.sql
--    0006_lead_safety.sql
--    0007_retention_roles_conversations.sql
--    0008_event_spine.sql
--    0009_platform_entities.sql
--    0010_lead_event_triggers.sql
--    0011_restore_foreign_keys.sql
--    0012_defer_event.sql
--    0013_scheduled_jobs.sql
-- ============================================================================


-- ==========================================================================
-- 0000_drop_lovable_scaffolding.sql
-- ==========================================================================

-- Remove the scaffolding the previous tool left behind.
--
-- The project was created on 5 July 2026 by an earlier build tool, which created thirteen tables
-- and then never used them: every one held zero rows and had never been sequentially scanned.
-- Four of them — leads, conversations, notifications, messages — share a name with tables this
-- schema needs, so `create table if not exists` silently skipped ours and the following
-- `alter`/`create index` statements failed against a table with entirely different columns.
--
-- Numbered 0000 so it runs before everything else. Dropping all thirteen rather than only the
-- four that collide: the other nine are unreferenced by any code here, and leaving them would
-- mislead the next person into thinking they mean something.
--
-- Verified empty before running (supabase inspect db table-stats, 9 August 2026):
--   leads 0 · chat_widgets 0 · conversations 0 · activity_logs 0 · voice_settings 0
--   business_members 0 · billing_plans 0 · businesses 0 · notifications 0 · messages 0
--   integrations 0 · phone_connections 0 · assistant_settings 0
--
-- CASCADE is required because they reference each other. It is safe here only because they are
-- empty; on a table with data this would be a destructive operation needing its own review.
--
-- Which is why the emptiness is re-checked at run time rather than trusted from the note above.
-- Four of these names — leads, conversations, notifications, messages — are also OUR table names,
-- created moments later by 0001 and 0007. An unguarded `drop table public.leads cascade` is
-- therefore harmless exactly once, on a freshly-scaffolded project, and catastrophic every time
-- after that: run it against a live database and every real lead is gone, with 0001 helpfully
-- recreating the table empty so nothing even looks broken. RUN_THIS_IN_SQL_EDITOR.sql tells its
-- reader the bundle is safe to re-run, and this file has to be able to keep that promise.
--
-- So: drop only what is genuinely still empty. On a live database every count is non-zero and
-- this whole migration becomes a no-op, which is the correct behaviour.

do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array[
    'activity_logs', 'messages', 'conversations', 'chat_widgets', 'notifications',
    'voice_settings', 'assistant_settings', 'phone_connections', 'integrations',
    'leads', 'business_members', 'billing_plans', 'businesses'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;                                   -- never existed, or already dropped
    end if;

    execute format('select count(*) from public.%I', t) into n;

    if n = 0 then
      execute format('drop table public.%I cascade', t);
      raise notice 'dropped empty scaffolding table public.%', t;
    else
      -- Deliberately not an exception: on a live database this is the expected path for all
      -- thirteen, and the migration must still succeed.
      raise notice 'KEPT public.% — it holds % row(s), so it is real data, not scaffolding', t, n;
    end if;
  end loop;
end $$;

-- Their helper functions and triggers go too, or they linger referencing tables that no longer
-- exist and confuse the next schema dump.
drop function if exists public.handle_new_user()      cascade;
drop function if exists public.update_updated_at()    cascade;
drop function if exists public.handle_updated_at()    cascade;


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

-- Every policy is dropped before it is created. PostgreSQL has no `create policy if not exists`,
-- so without this a second run of RUN_THIS_IN_SQL_EDITOR.sql aborts on the very first policy with
-- "policy already exists" — and because it aborts, every later statement in the bundle is skipped
-- too. That turned the bundle's "safe to re-run" header into a false promise, and it is the one
-- promise someone recovering a broken schema is relying on. Later migrations already did this;
-- 0001 and 0002 predate the convention.
drop policy if exists "profiles self" on public.profiles;
create policy "profiles self" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "workspaces read"   on public.workspaces;
drop policy if exists "workspaces insert" on public.workspaces;
drop policy if exists "workspaces update" on public.workspaces;
drop policy if exists "workspaces delete" on public.workspaces;
create policy "workspaces read"   on public.workspaces for select using (owner_id = auth.uid() or public.is_member(id));
create policy "workspaces insert" on public.workspaces for insert with check (owner_id = auth.uid());
create policy "workspaces update" on public.workspaces for update using (owner_id = auth.uid());
create policy "workspaces delete" on public.workspaces for delete using (owner_id = auth.uid());

drop policy if exists "members read"   on public.workspace_members;
drop policy if exists "members manage" on public.workspace_members;
create policy "members read"   on public.workspace_members for select using (public.is_member(workspace_id));
create policy "members manage" on public.workspace_members for all
  using      (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));

drop policy if exists "leads member access" on public.leads;
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
drop policy if exists "crm_connections member read" on public.crm_connections;
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
drop policy if exists "oauth_events member read" on public.provider_oauth_events;
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
drop policy if exists "crm_sync member read" on public.crm_sync_records;
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
drop policy if exists "tele_conn member read" on public.telephony_connections;
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
drop policy if exists "phone_numbers member read" on public.phone_numbers;
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
drop policy if exists "call_sessions member read" on public.call_sessions;
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
-- Built from gen_random_uuid(), which is core PostgreSQL since 13, rather than pgcrypto's
-- gen_random_bytes(). On Supabase pgcrypto installs into the `extensions` schema and is not on
-- the default search_path, so the pgcrypto version fails with "function does not exist" even
-- though the extension is enabled. Same 8 hex characters, no extension dependency.
update public.contact_submissions
   set reference = 'AG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
 where reference is null;

alter table public.contact_submissions
  alter column reference set default 'AG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

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


-- ==========================================================================
-- 0008_event_spine.sql
-- ==========================================================================

-- Production Blueprint v1.0 — Phase 1 spine.
--
-- §4.1 asks for "Supabase Queues/PGMQ or transactional outbox: guaranteed hand-off of call, lead,
-- email and integration jobs with replayability". §12.4 specifies the envelope every event must
-- carry. Neither existed: the app emitted two event names into browser memory and nothing else.
--
-- This is deliberately the FIRST thing built rather than another screen, because it is the only
-- part of the blueprint that cannot be retrofitted cheaply. Every later feature — n8n hand-off,
-- CRM sync, analytics, usage metering — is a consumer of this table. Get the envelope wrong now
-- and every consumer inherits the mistake.

-- =========================================================================================
-- 1. business_locations (§12.1)
-- =========================================================================================
-- §12.2: "Every tenant-owned record includes organisation_id; most operational records also
-- include location_id." A dental group with three practices needs per-site hours, numbers and
-- routing, and analytics has to slice by site.

create table if not exists public.business_locations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  is_primary   boolean not null default false,
  address_line text,
  city         text,
  postcode     text,
  country      text default 'GB',
  timezone     text not null default 'Europe/London',
  phone_e164   text,
  -- { mon: [["09:00","17:00"]], ... } — the shape voice-worker/src/qualify.js withinHours() reads.
  opening_hours jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists business_locations_ws_idx on public.business_locations (workspace_id);
-- Exactly one primary site per workspace, enforced by the database rather than by hope.
create unique index if not exists business_locations_one_primary
  on public.business_locations (workspace_id) where is_primary;

alter table public.business_locations enable row level security;
drop policy if exists business_locations_read on public.business_locations;
create policy business_locations_read on public.business_locations
  for select to authenticated using (public.is_member(workspace_id));
drop policy if exists business_locations_write on public.business_locations;
create policy business_locations_write on public.business_locations
  for all to authenticated using (public.can_admin(workspace_id)) with check (public.can_admin(workspace_id));

-- =========================================================================================
-- 2. contacts (§12.1, §5.4 identity resolution)
-- =========================================================================================
-- Today a lead carries its own name and phone inline, so the same person ringing three times is
-- three unrelated rows. §5.4 requires canonical identity with E.164 normalisation, exact-match
-- first, and NEVER silently merging.

create table if not exists public.contacts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  display_name  text,
  company       text,
  -- Normalised at write time. The partial unique indexes below are what make "have we spoken to
  -- this person before?" answerable without a fuzzy search on every call.
  phone_e164    text,
  email_norm    text,
  preferred_channel text check (preferred_channel in ('phone','email','sms','whatsapp')),
  timezone      text,
  -- Set when a human confirms a suggested merge. Never written automatically (§5.4).
  merged_into   uuid references public.contacts(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists contacts_ws_phone on public.contacts (workspace_id, phone_e164)
  where phone_e164 is not null and merged_into is null;
create unique index if not exists contacts_ws_email on public.contacts (workspace_id, email_norm)
  where email_norm is not null and merged_into is null;

alter table public.contacts enable row level security;
drop policy if exists contacts_read on public.contacts;
create policy contacts_read on public.contacts
  for select to authenticated using (public.is_member(workspace_id));
drop policy if exists contacts_write on public.contacts;
create policy contacts_write on public.contacts
  for all to authenticated using (public.can_write_leads(workspace_id)) with check (public.can_write_leads(workspace_id));

-- Attach existing operational records to a location and a contact. Nullable throughout: a lead
-- captured before its contact is resolved is still a lead, and losing it to a constraint would
-- defeat the entire point of the product.
alter table public.leads
  add column if not exists location_id uuid references public.business_locations(id) on delete set null,
  add column if not exists contact_id  uuid references public.contacts(id) on delete set null;
create index if not exists leads_contact_idx on public.leads (contact_id);

alter table public.call_sessions
  add column if not exists location_id uuid references public.business_locations(id) on delete set null,
  add column if not exists contact_id  uuid references public.contacts(id) on delete set null;

-- =========================================================================================
-- 3. call_events (§12.1, §10.7 call state machine)
-- =========================================================================================
-- §10.7 lists nine call states. call_sessions holds only the current one, so "why did this call
-- fail" is unanswerable after the fact. This is the append-only stream behind it.

create table if not exists public.call_events (
  id           bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  call_id      uuid not null references public.call_sessions(id) on delete cascade,
  state        text not null check (state in (
                 'created','ringing','answered','in_conversation','transferring',
                 'completed','post_processing','finalised','failed')),
  detail       jsonb not null default '{}'::jsonb,
  provider_event_id text,
  occurred_at  timestamptz not null default now()
);
create index if not exists call_events_call_idx on public.call_events (call_id, occurred_at);
-- Carrier retries are routine; the same provider event must not append twice.
create unique index if not exists call_events_provider_uq on public.call_events (provider_event_id)
  where provider_event_id is not null;

alter table public.call_events enable row level security;
drop policy if exists call_events_read on public.call_events;
create policy call_events_read on public.call_events
  for select to authenticated using (public.is_member(workspace_id));

-- =========================================================================================
-- 4. consent_events (§12.1, §13.3)
-- =========================================================================================
-- §13.3 requires a lawful basis per recording and a caller-facing AI disclosure. Consent stored
-- as a boolean on a row cannot answer "what exactly was this person told, and when" — which is
-- the only question that matters when someone asks.

create table if not exists public.consent_events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id   uuid references public.contacts(id) on delete set null,
  call_id      uuid references public.call_sessions(id) on delete set null,
  lead_id      uuid references public.leads(id) on delete set null,
  kind         text not null check (kind in (
                 'ai_disclosure','recording_notice','marketing_optin','marketing_optout',
                 'data_processing','suppression')),
  granted      boolean,
  -- The exact wording shown or spoken, kept verbatim. A version number alone is not evidence.
  notice_text  text,
  notice_version text,
  channel      text check (channel in ('voice','web','email','sms')),
  source_ip_hash text,
  occurred_at  timestamptz not null default now()
);
create index if not exists consent_events_ws_idx      on public.consent_events (workspace_id, occurred_at desc);
create index if not exists consent_events_contact_idx on public.consent_events (contact_id, occurred_at desc);

alter table public.consent_events enable row level security;
drop policy if exists consent_events_read on public.consent_events;
create policy consent_events_read on public.consent_events
  for select to authenticated using (public.is_member(workspace_id));

-- =========================================================================================
-- 5. platform_events — the transactional outbox (§4.1, §12.3, §12.4)
-- =========================================================================================
-- Written in the SAME transaction as the business change it describes. That is the whole point:
-- a lead and its lead.created event either both commit or neither does, so a consumer crash can
-- never lose the notification and a rollback can never emit a phantom one.

create table if not exists public.platform_events (
  -- §12.4 envelope, in full.
  event_id        uuid primary key default gen_random_uuid(),
  event_type      text not null,
  occurred_at     timestamptz not null default now(),
  schema_version  int not null default 1,
  workspace_id    uuid references public.workspaces(id) on delete cascade,
  location_id     uuid references public.business_locations(id) on delete set null,
  source          text not null check (source in ('web','voice','telephony','email','crm','system','n8n')),
  -- correlation: everything belonging to one real-world interaction.
  -- causation: the single event that directly produced this one. Together they turn a flat log
  -- into a tree you can actually walk when something goes wrong three systems away.
  correlation_id  text,
  causation_id    uuid references public.platform_events(event_id) on delete set null,
  idempotency_key text,
  actor           text,
  payload         jsonb not null default '{}'::jsonb,
  signature       text,

  -- delivery state
  status          text not null default 'pending'
                    check (status in ('pending','processing','done','failed','dead')),
  attempts        int not null default 0,
  max_attempts    int not null default 8,
  next_attempt_at timestamptz not null default now(),
  claimed_at      timestamptz,
  claimed_by      text,
  completed_at    timestamptz,
  last_error      text
);

-- The same logical event must never be enqueued twice, however many times a carrier retries.
create unique index if not exists platform_events_idem
  on public.platform_events (idempotency_key) where idempotency_key is not null;
-- The claim query's index. Partial, so it stays small no matter how much history accumulates.
create index if not exists platform_events_claimable
  on public.platform_events (next_attempt_at, event_id) where status = 'pending';
create index if not exists platform_events_ws_idx on public.platform_events (workspace_id, occurred_at desc);
create index if not exists platform_events_corr_idx on public.platform_events (correlation_id)
  where correlation_id is not null;

alter table public.platform_events enable row level security;
-- Members may READ their own events, which is what powers a truthful activity timeline.
-- Nothing may write from a browser: events are facts the server observed, not claims a client makes.
drop policy if exists platform_events_read on public.platform_events;
create policy platform_events_read on public.platform_events
  for select to authenticated using (workspace_id is not null and public.is_member(workspace_id));

/* Enqueue. Call this inside the transaction that makes the change.
   Returns the existing event_id when the idempotency key has been seen, so a retried webhook is
   a no-op rather than a duplicate. */
create or replace function public.emit_event(
  p_type text, p_source text, p_workspace uuid, p_payload jsonb default '{}'::jsonb,
  p_correlation text default null, p_causation uuid default null,
  p_idempotency text default null, p_actor text default null, p_location uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.platform_events
    (event_type, source, workspace_id, location_id, payload, correlation_id, causation_id,
     idempotency_key, actor)
  values (p_type, p_source, p_workspace, p_location, coalesce(p_payload,'{}'::jsonb),
          p_correlation, p_causation, p_idempotency, p_actor)
  returning event_id into v_id;
  return v_id;
exception when unique_violation then
  select event_id into v_id from public.platform_events where idempotency_key = p_idempotency;
  return v_id;
end; $$;

/* Claim a batch for processing.
   FOR UPDATE SKIP LOCKED is what lets several workers pull from one queue without any of them
   blocking or two of them taking the same row. Without SKIP LOCKED, a second worker waits behind
   the first and the queue serialises to one consumer. */
create or replace function public.claim_events(p_limit int default 20, p_worker text default 'worker')
returns setof public.platform_events language plpgsql security definer set search_path = public as $$
begin
  return query
  with picked as (
    select event_id from public.platform_events
     where status = 'pending' and next_attempt_at <= now()
     order by next_attempt_at, event_id
     limit greatest(1, least(p_limit, 200))
     for update skip locked
  )
  update public.platform_events e
     set status = 'processing', attempts = e.attempts + 1,
         claimed_at = now(), claimed_by = p_worker
    from picked
   where e.event_id = picked.event_id
  returning e.*;
end; $$;

create or replace function public.ack_event(p_event uuid)
returns void language sql security definer set search_path = public as $$
  update public.platform_events
     set status = 'done', completed_at = now(), last_error = null
   where event_id = p_event;
$$;

/* Fail with exponential backoff, then dead-letter.
   A validation or auth error will never succeed on retry (§8.3), so p_retryable = false sends it
   straight to 'dead' instead of burning eight attempts on a certainty. */
create or replace function public.fail_event(p_event uuid, p_error text, p_retryable boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare v_attempts int; v_max int;
begin
  select attempts, max_attempts into v_attempts, v_max
    from public.platform_events where event_id = p_event;
  if not found then return; end if;

  if not p_retryable or v_attempts >= v_max then
    update public.platform_events
       set status = 'dead', last_error = left(p_error, 1000), completed_at = now()
     where event_id = p_event;
  else
    -- 2s, 4s, 8s … capped at an hour, so a provider outage does not hammer a failing endpoint.
    update public.platform_events
       set status = 'pending', last_error = left(p_error, 1000),
           next_attempt_at = now() + least(interval '1 hour',
                                           (interval '1 second' * power(2, v_attempts)))
     where event_id = p_event;
  end if;
end; $$;

/* Recover events whose worker died mid-flight. Without this a crash strands rows in
   'processing' for ever and the queue silently drains to nothing. */
create or replace function public.requeue_stalled_events(p_older_than interval default interval '5 minutes')
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.platform_events
     set status = 'pending', next_attempt_at = now(), claimed_by = null, claimed_at = null,
         last_error = coalesce(last_error,'') || ' [requeued: worker did not acknowledge]'
   where status = 'processing' and claimed_at < now() - p_older_than;
  get diagnostics n = row_count;
  return n;
end; $$;

revoke all on function public.claim_events(int, text)   from anon, authenticated;
revoke all on function public.ack_event(uuid)           from anon, authenticated;
revoke all on function public.fail_event(uuid, text, boolean) from anon, authenticated;
revoke all on function public.requeue_stalled_events(interval) from anon, authenticated;
revoke all on function public.emit_event(text, text, uuid, jsonb, text, uuid, text, text, uuid) from anon, authenticated;

comment on table public.platform_events is
  'Blueprint §12.4 transactional outbox. Written in the same transaction as the business change '
  'it describes. Consumers claim with claim_events(), then ack_event() or fail_event().';

-- Dead events are the operational signal that something needs a human (§8.3 "create a visible
-- attention item"). Surfaced through health, not buried in a table.
create index if not exists platform_events_dead_idx
  on public.platform_events (occurred_at desc) where status = 'dead';

-- =========================================================================================
-- 6. retention for the new tables (§13.4)
-- =========================================================================================
create or replace function public.retention_sweep()
returns table(scope text, deleted bigint)
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  delete from public.contact_submissions where created_at < now() - interval '24 months';
  get diagnostics n = row_count; scope := 'contact_submissions'; deleted := n; return next;

  delete from public.rate_limits where window_start < now() - interval '30 days';
  get diagnostics n = row_count; scope := 'rate_limits'; deleted := n; return next;

  delete from public.notifications where created_at < now() - interval '24 months';
  get diagnostics n = row_count; scope := 'notifications'; deleted := n; return next;

  if to_regclass('public.telephony_webhook_events') is not null then
    delete from public.telephony_webhook_events where received_at < now() - interval '90 days';
    get diagnostics n = row_count; scope := 'telephony_webhook_events'; deleted := n; return next;
  end if;

  if to_regclass('public.oauth_authorisation_sessions') is not null then
    delete from public.oauth_authorisation_sessions where created_at < now() - interval '7 days';
    get diagnostics n = row_count; scope := 'oauth_authorisation_sessions'; deleted := n; return next;
  end if;

  -- Delivered events past their usefulness. 'dead' rows are KEPT: they are unresolved failures
  -- and deleting them would erase the evidence of what went wrong.
  delete from public.platform_events
   where status = 'done' and completed_at < now() - interval '90 days';
  get diagnostics n = row_count; scope := 'platform_events (done)'; deleted := n; return next;

  -- Call event streams follow the raw-webhook retention window.
  delete from public.call_events where occurred_at < now() - interval '90 days';
  get diagnostics n = row_count; scope := 'call_events'; deleted := n; return next;

  -- NOT swept, deliberately:
  --   consent_events — the record of what someone was told is the evidence, not the noise.
  --   audit_logs     — a security record a retention job must not quietly erase.
  --   leads, contacts, lead_activities — tied to account lifetime via ON DELETE CASCADE.
  return;
end; $$;

revoke all on function public.retention_sweep() from anon, authenticated;


-- ==========================================================================
-- 0009_platform_entities.sql
-- ==========================================================================

-- Production Blueprint v1.0 — the remaining §12.1 entities.
--
-- 0008 built the spine (outbox, envelope, locations, contacts, call/consent events). This adds
-- the tables the seven priority areas need: Assistant Studio, call routing, connector mappings,
-- email OAuth, richer leads, analytics facts, niche packs and usage metering.
--
-- Schema first, deliberately. §16.1 Phase 0 is "architecture lock", and the constraints below are
-- the part that is expensive to change later: which things are immutable, what may only exist
-- once, and what a status is allowed to claim.

-- =========================================================================================
-- 1. Assistants and versions — point 2, §9
-- =========================================================================================
-- §12.2: "Assistant versions are immutable after publish; new changes create a new version."
-- That is enforced by a trigger below, not by convention. A published version is the record of
-- what a business actually said to its callers; if it can be edited afterwards, no incident can
-- ever be investigated honestly.

create table if not exists public.assistants (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id  uuid references public.business_locations(id) on delete set null,
  name         text not null,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists assistants_ws_idx on public.assistants (workspace_id);
create unique index if not exists assistants_one_default
  on public.assistants (workspace_id) where is_default;

create table if not exists public.assistant_versions (
  id            uuid primary key default gen_random_uuid(),
  assistant_id  uuid not null references public.assistants(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  version       int not null,
  status        text not null default 'draft' check (status in ('draft','published','retired')),

  -- §9.3 structured prompt blocks. Kept as separate columns rather than one textarea so platform
  -- safety rules cannot be overwritten by a customer's custom instructions.
  greeting          text,
  ai_disclosure     text,
  languages         text[] default array['en'],
  voice_provider    text,
  voice_id          text,
  voice_rate        numeric(3,2) default 1.00 check (voice_rate between 0.50 and 2.00),
  tone              text,
  custom_instructions text,                    -- customer-authored; never overrides guardrails
  qualification     jsonb not null default '[]'::jsonb,   -- question builder output
  guardrails        jsonb not null default '{}'::jsonb,   -- forbidden claims, escalation topics
  tools             jsonb not null default '[]'::jsonb,   -- calendar, CRM, transfer, custom API
  booking_rules     jsonb not null default '{}'::jsonb,

  published_at  timestamptz,
  published_by  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index if not exists assistant_versions_seq on public.assistant_versions (assistant_id, version);
-- Exactly one live version per assistant. Two "published" rows would make "what is my receptionist
-- currently saying?" unanswerable.
create unique index if not exists assistant_versions_one_published
  on public.assistant_versions (assistant_id) where status = 'published';

/* Immutability. A published version may only change status (publish -> retired); every other
   column is frozen. Rollback therefore means publishing an earlier version, never editing this one. */
create or replace function public.freeze_published_assistant_version()
returns trigger language plpgsql as $$
begin
  if old.status = 'published' then
    if (new.greeting, new.ai_disclosure, new.languages, new.voice_provider, new.voice_id,
        new.voice_rate, new.tone, new.custom_instructions, new.qualification, new.guardrails,
        new.tools, new.booking_rules, new.version)
       is distinct from
       (old.greeting, old.ai_disclosure, old.languages, old.voice_provider, old.voice_id,
        old.voice_rate, old.tone, old.custom_instructions, old.qualification, old.guardrails,
        old.tools, old.booking_rules, old.version) then
      raise exception 'assistant_versions row % is published and immutable; create a new version', old.id
        using hint = 'Blueprint §12.2';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists assistant_versions_freeze on public.assistant_versions;
create trigger assistant_versions_freeze before update on public.assistant_versions
  for each row execute function public.freeze_published_assistant_version();

-- =========================================================================================
-- 2. Website knowledge — point 2, §9.2, §13.2
-- =========================================================================================
-- The blueprint is emphatic and correct: crawled text is untrusted DATA, never instructions, and
-- nothing reaches a live assistant without human approval. `approved` defaults to false for that
-- reason — the safe state is the default state.

create table if not exists public.knowledge_sources (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  kind          text not null check (kind in ('website','file','manual','faq')),
  url           text,
  status        text not null default 'pending'
                  check (status in ('pending','crawling','review_required','approved','failed')),
  pages_found   int default 0,
  last_crawled_at timestamptz,
  last_error    text,
  created_at    timestamptz not null default now()
);
create index if not exists knowledge_sources_ws_idx on public.knowledge_sources (workspace_id);

create table if not exists public.knowledge_documents (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_id    uuid references public.knowledge_sources(id) on delete cascade,
  source_url   text,                              -- §9.2: every fact keeps its provenance
  title        text,
  body         text,
  content_hash text,                              -- detects a changed page on recrawl
  confidence   numeric(4,3) check (confidence between 0 and 1),
  -- High-risk categories (§13.2) need a human even when confidence is high: prices, legal,
  -- medical and emergency guidance.
  risk_class   text default 'normal' check (risk_class in ('normal','price','legal','medical','emergency')),
  approved     boolean not null default false,
  approved_by  uuid references auth.users(id) on delete set null,
  approved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists knowledge_documents_ws_idx on public.knowledge_documents (workspace_id, approved);
create unique index if not exists knowledge_documents_hash
  on public.knowledge_documents (workspace_id, content_hash) where content_hash is not null;

-- =========================================================================================
-- 3. Routing rules — point 3, §10.3
-- =========================================================================================
-- The six modes the blueprint names, as data rather than as branches in code, so a customer can
-- change how their calls are handled without a deploy.

create table if not exists public.routing_rules (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  location_id   uuid references public.business_locations(id) on delete set null,
  phone_number_id uuid references public.phone_numbers(id) on delete cascade,
  assistant_id  uuid references public.assistants(id) on delete set null,
  mode          text not null check (mode in (
                  'ai_all_calls','ai_missed_only','ai_when_busy','ai_after_hours',
                  'ai_callback','ai_scheduled','ai_triage_then_human')),
  schedule      jsonb,                            -- { mon: [["09:00","17:00"]], ... }
  transfer_to_e164 text,
  transfer_timeout_s int default 25,
  -- §14.3: what happens when the agent runtime is unavailable. Configured BEFORE go-live, not
  -- after the first outage.
  fallback_action text default 'voicemail' check (fallback_action in ('voicemail','forward','busy')),
  fallback_to_e164 text,
  priority      int not null default 100,
  -- §10.4: a route may not claim to be live until a real inbound test call has reached the
  -- correct assistant. These two columns are what "Active" is allowed to mean.
  verified_at   timestamptz,
  verified_call_id uuid references public.call_sessions(id) on delete set null,
  is_active     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists routing_rules_ws_idx on public.routing_rules (workspace_id, priority);

/* A route cannot be marked active without the evidence that earns it. */
create or replace function public.guard_route_activation()
returns trigger language plpgsql as $$
begin
  if new.is_active and new.verified_call_id is null then
    raise exception 'routing rule % cannot be active without a verified inbound test call', new.id
      using hint = 'Blueprint §10.4 / §3.3: status must prove a real result';
  end if;
  return new;
end; $$;
drop trigger if exists routing_rules_guard on public.routing_rules;
create trigger routing_rules_guard before insert or update on public.routing_rules
  for each row execute function public.guard_route_activation();

-- =========================================================================================
-- 4. Connector mappings — point 4, §8.3
-- =========================================================================================
create table if not exists public.connector_mappings (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid references public.crm_connections(id) on delete cascade,
  provider      text not null,
  object_type   text not null,                    -- contact, deal, event, row
  version       int not null default 1,
  -- [{ source: 'lead.name', target: 'firstname', transform: 'split_first' }, ...]
  field_map     jsonb not null default '[]'::jsonb,
  conflict_strategy text default 'skip' check (conflict_strategy in ('skip','overwrite','newest','manual')),
  is_active     boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index if not exists connector_mappings_ver
  on public.connector_mappings (connection_id, object_type, version);

-- =========================================================================================
-- 5. Email connections — point 5, §11
-- =========================================================================================
-- Deliberately separate from crm_credentials: a mailbox has its own lifecycle (subscription
-- renewal, shared-mailbox identity) and its own failure mode — silence.

create table if not exists public.email_connections (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  provider       text not null check (provider in ('microsoft','google','smtp')),
  mailbox_address text not null,
  display_name   text,
  is_shared      boolean not null default false,
  scopes         text[],
  -- The token itself lives encrypted in crm_credentials; this is only the reference.
  credential_ref uuid references public.crm_credentials(id) on delete set null,
  token_expires_at timestamptz,
  -- §11.2: a mailbox is only Active when refresh, a test send AND the change subscription all
  -- succeed. Three separate facts, so a half-working connection cannot round up to "connected".
  refresh_ok     boolean not null default false,
  test_send_at   timestamptz,
  subscription_id text,
  subscription_expires_at timestamptz,
  status         text not null default 'draft' check (status in (
                   'draft','testing','active','degraded','action_required','disconnected')),
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists email_connections_mailbox
  on public.email_connections (workspace_id, mailbox_address);

-- =========================================================================================
-- 6. Richer leads — point 6, §5.2
-- =========================================================================================
alter table public.leads
  add column if not exists sentiment       text check (sentiment in ('positive','neutral','negative','mixed')),
  add column if not exists ai_confidence   numeric(4,3) check (ai_confidence between 0 and 1),
  add column if not exists estimated_value numeric(12,2),
  add column if not exists actual_value    numeric(12,2),
  add column if not exists outcome_reason  text,
  add column if not exists next_action_at  timestamptz,
  add column if not exists call_id         uuid references public.call_sessions(id) on delete set null,
  add column if not exists score_breakdown jsonb,   -- §5.3: the score must be explainable
  add column if not exists score_model     text;

-- §5.3 requires every score component stored, not just the total, so a customer can see why a
-- lead scored 72 and tune the weights for their niche.
comment on column public.leads.score_breakdown is
  'Blueprint §5.3: { intent, fit, urgency, contactability, engagement, value, risk } with the '
  'model version in score_model. Confidence is separate and must not be blended into quality.';

create table if not exists public.lead_fields (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id      uuid not null references public.leads(id) on delete cascade,
  field_key    text not null,
  field_label  text,
  value_text   text,
  value_number numeric,
  value_bool   boolean,
  value_date   timestamptz,
  -- Where the answer came from: the caller said it, the AI inferred it, or a human typed it.
  provenance   text check (provenance in ('caller','ai_inferred','human','integration')),
  confidence   numeric(4,3),
  created_at   timestamptz not null default now()
);
create unique index if not exists lead_fields_key on public.lead_fields (lead_id, field_key);

create table if not exists public.appointments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id  uuid references public.business_locations(id) on delete set null,
  lead_id      uuid references public.leads(id) on delete set null,
  contact_id   uuid references public.contacts(id) on delete set null,
  service      text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  status       text not null default 'requested' check (status in (
                 'requested','booked','confirmed','attended','no_show','cancelled','rescheduled')),
  staff_label  text,
  external_calendar_id text,
  external_event_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists appointments_ws_idx on public.appointments (workspace_id, starts_at);
create unique index if not exists appointments_external
  on public.appointments (external_calendar_id, external_event_id)
  where external_event_id is not null;

-- =========================================================================================
-- 7. Analytics facts — point 6, §7.2, §12.2
-- =========================================================================================
-- §12.2: "Analytics facts store numerator, denominator and completeness, not only a percentage."
-- A rate without its denominator is unauditable, and a rate computed from partial data without
-- saying so is a lie with a decimal point.

create table if not exists public.analytics_daily (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id  uuid references public.business_locations(id) on delete set null,
  assistant_id uuid references public.assistants(id) on delete set null,
  day          date not null,
  metric       text not null,
  numerator    numeric not null default 0,
  denominator  numeric,
  -- 0–1. How much of the day's expected source data was actually present when this was computed.
  completeness numeric(4,3) default 1.000 check (completeness between 0 and 1),
  computed_at  timestamptz not null default now()
);
create unique index if not exists analytics_daily_key
  on public.analytics_daily (workspace_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
                             coalesce(assistant_id, '00000000-0000-0000-0000-000000000000'::uuid), day, metric);
create index if not exists analytics_daily_day on public.analytics_daily (workspace_id, day desc);

-- =========================================================================================
-- 8. Niche packs — point 7, §6
-- =========================================================================================
-- One platform, configuration per industry. Packs are global templates; a workspace adopts one
-- and may override it, which is what stops this becoming nine applications.

create table if not exists public.niche_packs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  vocabulary  jsonb not null default '{}'::jsonb,   -- customer/patient/tenant, appointment/viewing
  services    jsonb not null default '[]'::jsonb,
  qualification jsonb not null default '[]'::jsonb,
  intents     jsonb not null default '[]'::jsonb,
  guardrails  jsonb not null default '{}'::jsonb,   -- required disclaimers, forbidden claims
  scoring_weights jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.workspace_niche (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  pack_id      uuid not null references public.niche_packs(id) on delete restrict,
  overrides    jsonb not null default '{}'::jsonb,
  adopted_at   timestamptz not null default now()
);

-- =========================================================================================
-- 9. Usage ledger — question 12, §12.1
-- =========================================================================================
-- "What are the estimated infrastructure and per-minute calling costs?" is unanswerable without
-- recording usage as it happens. Cost is stored per tenant AND per operation so a per-lead cost
-- can be computed rather than estimated.

create table if not exists public.usage_ledger (
  id           bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  occurred_at  timestamptz not null default now(),
  kind         text not null check (kind in (
                 'call_minutes','tts_characters','stt_minutes','llm_tokens','sms','email','storage_mb','connector_call')),
  quantity     numeric not null,
  unit_cost    numeric(12,6),
  currency     text default 'GBP',
  provider     text,
  call_id      uuid references public.call_sessions(id) on delete set null,
  lead_id      uuid references public.leads(id) on delete set null,
  event_id     uuid references public.platform_events(event_id) on delete set null
);
create index if not exists usage_ledger_ws_day on public.usage_ledger (workspace_id, occurred_at desc);

-- =========================================================================================
-- 10. RLS on everything added above
-- =========================================================================================
-- §13.1: tenant access enforced in the database, not in frontend filters.

-- Written out one statement per table on purpose. An earlier version of this section did the
-- same work in a DO loop with execute format(), which is shorter and completely opaque: the
-- repository's own RLS audit could not see it, and neither can a human reviewing the diff.
-- Security posture has to be greppable. Verbose beats clever here.

alter table public.assistants           enable row level security;
alter table public.assistant_versions   enable row level security;
alter table public.knowledge_sources    enable row level security;
alter table public.knowledge_documents  enable row level security;
alter table public.routing_rules        enable row level security;
alter table public.connector_mappings   enable row level security;
alter table public.email_connections    enable row level security;
alter table public.lead_fields          enable row level security;
alter table public.appointments         enable row level security;
alter table public.analytics_daily      enable row level security;
alter table public.workspace_niche      enable row level security;
alter table public.usage_ledger         enable row level security;

-- ---- read: any member of the workspace ----
drop policy if exists assistants_read on public.assistants;
create policy assistants_read on public.assistants
  for select to authenticated using (public.is_member(workspace_id));

drop policy if exists assistant_versions_read on public.assistant_versions;
create policy assistant_versions_read on public.assistant_versions
  for select to authenticated using (public.is_member(workspace_id));

drop policy if exists knowledge_sources_read on public.knowledge_sources;
create policy knowledge_sources_read on public.knowledge_sources
  for select to authenticated using (public.is_member(workspace_id));

drop policy if exists knowledge_documents_read on public.knowledge_documents;
create policy knowledge_documents_read on public.knowledge_documents
  for select to authenticated using (public.is_member(workspace_id));

drop policy if exists routing_rules_read on public.routing_rules;
create policy routing_rules_read on public.routing_rules
  for select to authenticated using (public.is_member(workspace_id));

drop policy if exists connector_mappings_read on public.connector_mappings;
create policy connector_mappings_read on public.connector_mappings
  for select to authenticated using (public.is_member(workspace_id));

drop policy if exists email_connections_read on public.email_connections;
create policy email_connections_read on public.email_connections
  for select to authenticated using (public.is_member(workspace_id));

drop policy if exists lead_fields_read on public.lead_fields;
create policy lead_fields_read on public.lead_fields
  for select to authenticated using (public.is_member(workspace_id));

drop policy if exists appointments_read on public.appointments;
create policy appointments_read on public.appointments
  for select to authenticated using (public.is_member(workspace_id));

drop policy if exists analytics_daily_read on public.analytics_daily;
create policy analytics_daily_read on public.analytics_daily
  for select to authenticated using (public.is_member(workspace_id));

drop policy if exists workspace_niche_read on public.workspace_niche;
create policy workspace_niche_read on public.workspace_niche
  for select to authenticated using (public.is_member(workspace_id));

drop policy if exists usage_ledger_read on public.usage_ledger;
create policy usage_ledger_read on public.usage_ledger
  for select to authenticated using (public.is_member(workspace_id));

-- ---- write: day-to-day lead work ----
drop policy if exists lead_fields_write on public.lead_fields;
create policy lead_fields_write on public.lead_fields
  for all to authenticated
  using (public.can_write_leads(workspace_id)) with check (public.can_write_leads(workspace_id));

drop policy if exists appointments_write on public.appointments;
create policy appointments_write on public.appointments
  for all to authenticated
  using (public.can_write_leads(workspace_id)) with check (public.can_write_leads(workspace_id));

-- ---- write: configuration, owner/admin only ----
-- Changing an assistant, a call route or a connector mapping alters how the business answers its
-- phone. That is not a task for an agent-level account.
drop policy if exists assistants_write on public.assistants;
create policy assistants_write on public.assistants
  for all to authenticated using (public.can_admin(workspace_id)) with check (public.can_admin(workspace_id));

drop policy if exists assistant_versions_write on public.assistant_versions;
create policy assistant_versions_write on public.assistant_versions
  for all to authenticated using (public.can_admin(workspace_id)) with check (public.can_admin(workspace_id));

drop policy if exists knowledge_sources_write on public.knowledge_sources;
create policy knowledge_sources_write on public.knowledge_sources
  for all to authenticated using (public.can_admin(workspace_id)) with check (public.can_admin(workspace_id));

drop policy if exists knowledge_documents_write on public.knowledge_documents;
create policy knowledge_documents_write on public.knowledge_documents
  for all to authenticated using (public.can_admin(workspace_id)) with check (public.can_admin(workspace_id));

drop policy if exists routing_rules_write on public.routing_rules;
create policy routing_rules_write on public.routing_rules
  for all to authenticated using (public.can_admin(workspace_id)) with check (public.can_admin(workspace_id));

drop policy if exists connector_mappings_write on public.connector_mappings;
create policy connector_mappings_write on public.connector_mappings
  for all to authenticated using (public.can_admin(workspace_id)) with check (public.can_admin(workspace_id));

drop policy if exists email_connections_write on public.email_connections;
create policy email_connections_write on public.email_connections
  for all to authenticated using (public.can_admin(workspace_id)) with check (public.can_admin(workspace_id));

-- analytics_daily and usage_ledger are computed by the server; nothing may write them from a
-- browser, so they get no write policy at all.

-- niche_packs are global templates, readable by any signed-in user, writable only by the service
-- role (no policy = no client writes).
alter table public.niche_packs enable row level security;
drop policy if exists niche_packs_read on public.niche_packs;
create policy niche_packs_read on public.niche_packs
  for select to authenticated using (is_published);


-- ==========================================================================
-- 0010_lead_event_triggers.sql
-- ==========================================================================

-- Make the outbox actually carry traffic.
--
-- 0008 built platform_events but nothing wrote to it, so it was a well-made pipe with no pump.
-- These triggers are the pump — and putting them in the database rather than in application code
-- is the entire point of a transactional outbox: the lead and its event are written by the same
-- statement, in the same transaction. There is no window in which one exists without the other,
-- and no code path that can forget to emit.
--
-- This also fixes a real defect. Until now the browser called notifyLead() after saving a lead,
-- fire-and-forget. Close the tab at the wrong moment and the business is never told about an
-- enquiry that was saved successfully. Whether a business hears about a lead is not a decision
-- that belongs to a web page.

-- =========================================================================================
-- 1. lead.created
-- =========================================================================================
create or replace function public.emit_lead_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.emit_event(
    'lead.created',
    -- Where it came from, in the vocabulary §12.4 expects.
    case new.source
      when 'Voice call'    then 'voice'
      when 'Website chat'  then 'web'
      when 'Contact form'  then 'web'
      when 'API'           then 'system'
      when 'CRM'           then 'crm'
      else 'system'
    end,
    new.workspace_id,
    jsonb_build_object(
      'lead_id',   new.id,
      'name',      new.name,
      'service',   new.service,
      'urgency',   new.urgency,
      'source',    new.source,
      'status',    new.status,
      'score',     new.score,
      'phone',     new.phone,
      'email',     new.email,
      'summary',   new.summary,
      'contact_id', new.contact_id,
      'call_id',   new.call_id
    ),
    -- correlation: the call this lead came from, so a transcript, a lead and a CRM sync can all
    -- be traced back to one real conversation.
    coalesce(new.call_id::text, new.id::text),
    null,
    -- One lead can only ever produce one lead.created, however many times a retry runs.
    'lead.created:' || new.id::text,
    'system',
    new.location_id
  );
  return new;
end; $$;

drop trigger if exists leads_emit_created on public.leads;
create trigger leads_emit_created after insert on public.leads
  for each row execute function public.emit_lead_created();

-- =========================================================================================
-- 2. lead.status_changed / lead.qualified
-- =========================================================================================
create or replace function public.emit_lead_status_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then return new; end if;

  perform public.emit_event(
    -- 'Qualified' is a distinct commercial moment, not just another status hop, and §12.3 lists
    -- it separately. Emitting both would double-notify, so pick one.
    case when new.status = 'Qualified' then 'lead.qualified' else 'lead.status_changed' end,
    'system', new.workspace_id,
    jsonb_build_object(
      'lead_id', new.id, 'name', new.name,
      'from_status', old.status, 'to_status', new.status,
      'urgency', new.urgency, 'score', new.score
    ),
    coalesce(new.call_id::text, new.id::text),
    null,
    -- Keyed on the transition, so re-running a migration or a retry cannot re-announce it — but a
    -- genuine later move back to the same status still emits, because updated_at differs.
    'lead.status:' || new.id::text || ':' || old.status || '>' || new.status || ':'
      || extract(epoch from now())::bigint::text,
    'system', new.location_id
  );
  return new;
end; $$;

drop trigger if exists leads_emit_status on public.leads;
create trigger leads_emit_status after update of status on public.leads
  for each row execute function public.emit_lead_status_changed();

-- =========================================================================================
-- 3. appointment lifecycle (§12.3)
-- =========================================================================================
create or replace function public.emit_appointment_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type text;
begin
  if tg_op = 'INSERT' then
    v_type := case when new.status = 'booked' then 'appointment.booked' else 'appointment.requested' end;
  elsif new.status is distinct from old.status then
    v_type := case new.status
                when 'booked'    then 'appointment.booked'
                when 'cancelled' then 'appointment.cancelled'
                else 'appointment.changed'
              end;
  else
    return new;
  end if;

  perform public.emit_event(
    v_type, 'system', new.workspace_id,
    jsonb_build_object('appointment_id', new.id, 'lead_id', new.lead_id,
                       'service', new.service, 'starts_at', new.starts_at, 'status', new.status),
    coalesce(new.lead_id::text, new.id::text), null,
    'appt:' || new.id::text || ':' || new.status,
    'system', new.location_id
  );
  return new;
end; $$;

drop trigger if exists appointments_emit on public.appointments;
create trigger appointments_emit after insert or update of status on public.appointments
  for each row execute function public.emit_appointment_event();

-- =========================================================================================
-- 4. queue depth, for the health endpoint
-- =========================================================================================
-- §14.2 wants dead-letter depth and processing lag monitored. Exposed as one cheap call so the
-- health check does not need four separate queries.
create or replace function public.event_queue_stats()
returns table(pending bigint, processing bigint, dead bigint, oldest_pending_seconds numeric)
language sql security definer set search_path = public as $$
  select
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'processing'),
    count(*) filter (where status = 'dead'),
    -- FILTER attaches to an AGGREGATE, so it belongs on min(), not on the extract() wrapping it.
    -- Written the other way round it is a syntax error, not a subtle one.
    coalesce(extract(epoch from now() -
             min(occurred_at) filter (where status = 'pending' and next_attempt_at <= now())), 0)::numeric
  from public.platform_events;
$$;
revoke all on function public.event_queue_stats() from anon;


-- ==========================================================================
-- 0011_restore_foreign_keys.sql
-- ==========================================================================

-- Re-assert the foreign keys that point at public.leads and public.conversations.
--
-- Why this is needed at all, and why it is not redundant with the CREATE TABLE statements that
-- declare the same constraints:
--
-- `drop table public.leads cascade` does not only drop leads. It silently drops every foreign key
-- on OTHER tables that referenced it — lead_activities.lead_id, appointments.lead_id, and six more
-- — while leaving those tables themselves perfectly intact. Re-running the schema afterwards does
-- not put them back, because every table here is created with `create table if not exists`: the
-- surviving table already exists, so the whole statement is skipped, and the constraint declared
-- inside it never runs. The tables come back looking correct and the referential integrity does
-- not, which is the worst combination — nothing errors, and orphaned rows quietly become possible.
--
-- So the bundle could restore a dropped table but not a schema that had ever had a table dropped
-- out from under it. This migration closes that gap: it compares the foreign keys that SHOULD
-- exist against pg_constraint and adds only the ones that are actually missing. Safe to run on a
-- healthy database, where it does nothing at all.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- child table,        column,    parent table,     on delete
      ('crm_sync_records',   'lead_id', 'leads',          'cascade'),
      ('call_sessions',      'lead_id', 'leads',          'set null'),
      ('lead_activities',    'lead_id', 'leads',          'cascade'),
      ('conversations',      'lead_id', 'leads',          'set null'),
      ('consent_events',     'lead_id', 'leads',          'set null'),
      ('lead_fields',        'lead_id', 'leads',          'cascade'),
      ('appointments',       'lead_id', 'leads',          'set null'),
      ('usage_ledger',       'lead_id', 'leads',          'set null'),
      ('messages',           'conversation_id', 'conversations', 'cascade')
    ) as t(child, col, parent, on_delete)
  loop
    -- Skip anything not present on this database rather than failing: a partially-built schema
    -- should still get whatever repairs it can.
    if to_regclass('public.' || r.child) is null or to_regclass('public.' || r.parent) is null then
      continue;
    end if;

    -- Match on the referencing column and the referenced table, not on a constraint name.
    -- PostgreSQL generates these names, and a name-based check would re-add a duplicate
    -- constraint whenever the generated name differed.
    if exists (
      select 1
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype   = 'f'
         and c.conrelid  = ('public.' || r.child)::regclass
         and c.confrelid = ('public.' || r.parent)::regclass
         and a.attname   = r.col
    ) then
      continue;
    end if;

    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.%I(id) on delete %s',
      r.child, r.child || '_' || r.col || '_fkey', r.col, r.parent, r.on_delete
    );
    raise notice 'restored missing foreign key public.%.% -> public.%', r.child, r.col, r.parent;
  end loop;
end $$;


-- ==========================================================================
-- 0012_defer_event.sql
-- ==========================================================================

-- Distinguish "this event can never succeed" from "nothing can succeed until someone finishes
-- configuring the system". The outbox already had the first; it was treating the second as the
-- first, and that quietly destroys leads.
--
-- What went wrong: events-consume classified a missing RESEND_API_KEY, and a missing
-- LEAD_NOTIFICATION_TO, as Permanent. Permanent means dead-letter on attempt one, no retry. So
-- every lead that arrived between going live and the email provider being finished was marked
-- dead and never announced — and it looked deliberate in the logs, which is worse than a crash.
-- Verified against the live queue: two probe events, attempts = 1, status = dead, error
-- 'no_email_provider', with the API key simply not set yet.
--
-- Retryable was not the fix either. claim_events increments attempts on every claim, and
-- fail_event dead-letters once attempts reaches max_attempts, so a config fault would still
-- exhaust its budget and dead-letter within a few hours — before DNS verification typically
-- completes. Same data loss, slower.
--
-- Hence a third outcome: defer. The event returns to pending, keeps its full attempt budget, and
-- waits. It cannot be lost by the clock. The risk of deferring forever is that a genuine
-- misconfiguration hides in the queue, and that is already covered — event_queue_stats() reports
-- oldest_pending_seconds and the health endpoint degrades past ten minutes, so a stuck queue
-- surfaces as a visible alert instead of a silent backlog.

create or replace function public.defer_event(
  p_event       uuid,
  p_reason      text,
  p_retry_after interval default interval '5 minutes'
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.platform_events
     set status          = 'pending',
         -- Give back the attempt that claim_events took. The event was never really tried:
         -- the handler could not start, so charging it an attempt is charging it for our
         -- own missing configuration.
         attempts        = greatest(0, attempts - 1),
         last_error      = left('deferred: ' || p_reason, 1000),
         next_attempt_at = now() + p_retry_after,
         claimed_by      = null,
         claimed_at      = null
   where event_id = p_event
     and status = 'processing';
end; $$;

revoke all on function public.defer_event(uuid, text, interval) from anon, authenticated;

comment on function public.defer_event(uuid, text, interval) is
  'Return an event to the queue without consuming an attempt, for failures caused by incomplete '
  'configuration rather than by the event itself. Use Permanent for events that can never '
  'succeed, retryable for transient provider faults, and this for "not set up yet".';


-- ==========================================================================
-- 0013_scheduled_jobs.sql
-- ==========================================================================

-- Schedule the two jobs the platform needs running on its own: draining the outbox, and expiring
-- data past its retention window.
--
-- Both already existed as callable things nobody was calling. The outbox consumer was deployed but
-- only ever ran when someone poked it by hand, which means a lead alert went out when an operator
-- happened to be looking — that is not a notification system. retention_sweep() was written for
-- §18 and likewise never fired, so "we delete data after N days" was a claim in a privacy policy
-- with nothing behind it.
--
-- Delivered as a function rather than as bare cron.schedule calls because the consumer needs a
-- secret, and a secret must not sit in a migration file that lives in git. The caller passes the
-- base URL and the shared secret at run time:
--
--   select public.schedule_platform_jobs('https://<ref>.supabase.co', '<EVENTS_CONSUMER_SECRET>');
--
-- Re-running it is safe: each job is unscheduled first, so this also serves as the way to rotate
-- the secret. Requires pg_cron and pg_net, which on Supabase are enabled from
-- Database → Extensions, or with `create extension if not exists`.

create or replace function public.schedule_platform_jobs(
  p_base_url text,
  p_secret   text
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_out text := '';
begin
  /* Check pg_proc rather than to_regproc. to_regproc returns NULL for an AMBIGUOUS name as well
     as for a missing one, and cron.schedule has two overloads — schedule(name, sched, cmd) and
     schedule(sched, cmd) — so the to_regproc form reported pg_cron as not installed on a database
     where it was installed and working. A precondition check that fails when the precondition is
     met is worse than no check. */
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'cron' and p.proname = 'schedule') then
    raise exception 'pg_cron is not installed. Enable it under Database → Extensions first.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'net' and p.proname = 'http_post') then
    raise exception 'pg_net is not installed. Enable it under Database → Extensions first.';
  end if;
  if coalesce(p_secret, '') = '' then
    -- Refuse rather than schedule a job that will be rejected 1,440 times a day.
    raise exception 'p_secret is empty. The consumer requires EVENTS_CONSUMER_SECRET.';
  end if;

  -- Drain the outbox every minute. The consumer claims a bounded batch and returns, so a minute
  -- is a delivery latency target, not a rate limit — an empty queue costs one cheap round trip.
  perform cron.unschedule('events-consume')
    where exists (select 1 from cron.job where jobname = 'events-consume');

  perform cron.schedule('events-consume', '* * * * *', format($job$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-consumer-secret', %L),
      body    := '{}'::jsonb
    );
  $job$, rtrim(p_base_url, '/') || '/functions/v1/events-consume', p_secret));
  v_out := v_out || 'events-consume: every minute' || E'\n';

  -- Retention at 03:15 UTC — outside UK business hours in either direction, so a long delete
  -- never overlaps the traffic it would slow down.
  perform cron.unschedule('retention-sweep')
    where exists (select 1 from cron.job where jobname = 'retention-sweep');

  perform cron.schedule('retention-sweep', '15 3 * * *', 'select public.retention_sweep();');
  v_out := v_out || 'retention-sweep: 03:15 UTC daily';

  return v_out;
end; $$;

-- The secret is an argument, so this must never be callable by a client role.
revoke all on function public.schedule_platform_jobs(text, text) from anon, authenticated;

