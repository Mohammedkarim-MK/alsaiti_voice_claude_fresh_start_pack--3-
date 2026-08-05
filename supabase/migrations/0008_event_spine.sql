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
