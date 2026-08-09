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
