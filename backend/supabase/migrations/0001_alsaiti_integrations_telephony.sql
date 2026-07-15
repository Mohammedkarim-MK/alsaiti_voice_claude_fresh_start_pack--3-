-- Alsaiti Voice — real integrations + Telnyx telephony schema
-- Source of truth = Supabase. Secrets live ONLY in the vault; these tables store
-- credential *references*, identity, status and audit — never tokens/keys/passwords.
-- Enable RLS on every business-owned table (policies below are a starting point).

-- ============================ OAuth authorisation ============================
create table if not exists oauth_authorisation_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  state_hash text not null unique,          -- hash of a random opaque state; exact-match on callback
  pkce_verifier_ciphertext text,            -- encrypted; only the challenge goes to the provider
  requested_scopes text[] not null default '{}',
  redirect_uri text not null,
  return_path text,
  status text not null default 'created',    -- created|authorising|callback_received|completed|error|expired
  expires_at timestamptz not null,
  completed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists idx_oauth_sessions_business on oauth_authorisation_sessions(business_id, created_at desc);

-- Non-secret audit trail of the OAuth lifecycle.
create table if not exists provider_oauth_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  connection_id uuid,
  provider text not null,
  event_type text not null,   -- authorisation_started|consent_granted|consent_denied|code_received|
                              -- token_exchange_succeeded|token_exchange_failed|token_refreshed|refresh_failed|
                              -- access_revoked|disconnected
  detail jsonb not null default '{}'::jsonb,   -- must contain NO tokens/secrets
  created_at timestamptz not null default now()
);
create index if not exists idx_oauth_events_business on provider_oauth_events(business_id, created_at desc);

-- ============================ CRM connections ============================
create table if not exists crm_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  provider text not null,
  -- Truthful states: not_connected|authorisation_required|authorising|callback_received|
  -- token_exchange_in_progress|account_selection_required|configuration_required|metadata_loading|
  -- test_required|connected|degraded|attention_required|authorisation_expired|paused|disconnecting|
  -- disconnected|error|demo
  status text not null default 'not_connected',
  external_account_id text,
  external_account_name text,
  external_user_id text,
  external_user_name text,
  credential_reference text,           -- e.g. vault://alsaiti/crm/<id> — NEVER a raw token
  token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  missing_scopes text[] not null default '{}',
  provider_region text,
  provider_environment text,           -- production|sandbox|developer
  instance_url text,                   -- Salesforce
  api_domain text,                     -- Zoho (per data centre)
  configuration jsonb not null default '{}'::jsonb,
  field_mapping jsonb not null default '{}'::jsonb,
  sync_settings jsonb not null default '{}'::jsonb,
  last_authorised_at timestamptz,
  last_refreshed_at timestamptz,
  last_tested_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id, provider, external_account_id)
);
create index if not exists idx_crm_conn_business on crm_connections(business_id, provider);
create index if not exists idx_crm_conn_status on crm_connections(business_id, status);

-- Records of REAL provider API test operations (proves a connection actually works).
create table if not exists integration_connection_tests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  connection_id uuid not null references crm_connections(id) on delete cascade,
  provider text not null,
  status text not null,                -- passed|failed
  operation text not null,             -- e.g. read_identity|load_pipelines|upsert_test_contact
  external_test_record_id text,
  safe_result jsonb,                   -- redacted, no secrets
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ============================ Telnyx telephony ============================
create table if not exists telephony_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  provider text not null default 'telnyx',
  connection_mode text not null,       -- alsaiti_managed|customer_oauth|customer_api_key|sip_byoc|call_forwarding
  status text not null default 'authorisation_required',  -- ...|verifying|configuration_required|active|degraded|
                                                          -- attention_required|suspended|disconnected|porting|error|demo
  credential_reference text,
  provider_account_id text,
  provider_managed_account_id text,
  external_account_name text,
  oauth_grant_id text,
  granted_scopes text[] not null default '{}',
  last_authorised_at timestamptz,
  last_verified_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists phone_numbers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  telephony_connection_id uuid references telephony_connections(id) on delete set null,
  provider text not null default 'telnyx',
  provider_number_id text,
  provider_number_order_id text,
  e164_number text not null,
  friendly_name text,
  country text,
  number_type text,
  capabilities jsonb not null default '{}'::jsonb,
  regulatory_status text,
  status text not null default 'draft', -- draft|number_order_pending|routing_required|test_required|active|
                                        -- degraded|attention_required|suspended|disconnected|porting|error|demo
  voice_application_id text,
  sip_connection_id text,
  assigned_assistant_id uuid,
  monthly_cost numeric,
  currency text,
  last_tested_at timestamptz,
  last_successful_call_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_number_id)
);

create table if not exists call_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  phone_number_id uuid references phone_numbers(id) on delete set null,
  assistant_id uuid,
  provider text not null default 'telnyx',
  provider_call_id text not null,
  provider_call_control_id text,
  direction text not null,             -- inbound|outbound
  from_number text,
  to_number text,
  status text not null,
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  transfer_status text,
  lead_id uuid references leads(id) on delete set null,
  conversation_id uuid,
  recording_status text,
  transcript_status text,
  summary text,
  outcome text,
  provider_cost numeric,
  currency text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_call_id)   -- exactly-once: one lead per call is enforced in the lead service
);
create index if not exists idx_calls_business on call_sessions(business_id, created_at desc);

-- Provider webhook events (Telnyx voice, CRM webhooks) — replay protection.
create table if not exists telephony_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'telnyx',
  provider_event_id text not null,
  business_id uuid references businesses(id) on delete cascade,
  signature_valid boolean not null default false,
  event_type text,
  payload_reference text,              -- pointer to stored raw payload; not secrets
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received',
  error text,
  unique(provider, provider_event_id)
);

-- ============================ RLS (starting point) ============================
alter table oauth_authorisation_sessions   enable row level security;
alter table provider_oauth_events           enable row level security;
alter table crm_connections                 enable row level security;
alter table integration_connection_tests    enable row level security;
alter table telephony_connections           enable row level security;
alter table phone_numbers                    enable row level security;
alter table call_sessions                    enable row level security;
alter table telephony_webhook_events         enable row level security;

-- Example: members of a business can read that business's connections.
-- Adjust to your business_members table + role model. Writes should go through the
-- service role from server code only.
-- create policy crm_conn_read on crm_connections for select
--   using (business_id in (select business_id from business_members where user_id = auth.uid()));
