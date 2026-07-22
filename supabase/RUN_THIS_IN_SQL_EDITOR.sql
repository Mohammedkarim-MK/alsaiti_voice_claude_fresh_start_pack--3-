-- ============================================================================
--  Alsaiti Growth — RUN THIS ONCE, IN ONE GO.
--  Supabase dashboard -> SQL Editor -> New query -> paste ALL of this -> Run.
--
--  This is migrations 0001-0004 concatenated in the correct order. It is safe to
--  re-run: every statement uses "if not exists" / "create or replace".
--
--  After it succeeds the Edge Functions get: RLS on every table, service-role-only
--  credential storage, rate limiting (rate_limit_hit) and the token-refresh lock
--  (try_lock_refresh). Without it those two degrade to "fail open" — you keep working
--  but lose the protection.
-- ============================================================================


-- ============================================================
-- 0001_foundation.sql
-- ============================================================
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

-- ============================================================
-- 0002_integrations_telephony.sql
-- ============================================================
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

-- ============================================================
-- 0003_rate_limiting.sql
-- ============================================================
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

-- ============================================================
-- 0004_token_refresh_lock.sql
-- ============================================================
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

-- ============================================================================
--  Done. Quick verification (should return 4 rows):
-- ============================================================================
select table_name from information_schema.tables
where table_schema='public'
  and table_name in ('workspaces','crm_connections','rate_limits','token_refresh_locks')
order by table_name;
