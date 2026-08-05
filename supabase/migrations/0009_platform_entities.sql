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
