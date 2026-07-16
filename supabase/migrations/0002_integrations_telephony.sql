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
