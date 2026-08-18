-- Contact-form alerts were sent synchronously and never queued.
--
-- When no email provider is configured — which is the state this project has been in all along —
-- contact-submit stored the enquiry, issued a reference, and gave up on the alert. Nothing
-- retried it. Only two cron jobs exist (events-consume, retention-sweep) and neither looks at
-- contact_submissions, so adding RESEND_API_KEY later would NOT have delivered any enquiry
-- captured before it. The rows sit at notification_status 'pending' indefinitely.
--
-- Nothing about that is visible from the outside. The visitor gets a reference number and a
-- confirmation, the row is present and correct, the dashboard shows it — and the owner is simply
-- never told. For a lead-generation product that is the exact failure the whole system exists to
-- prevent, and it was silently true of the three enquiries already captured.
--
-- The outbox already solves this for leads (lead.created → events-consume → email, retried with
-- backoff, deferred rather than dead-lettered while unconfigured). This puts contact submissions
-- on the same rails.
--
-- The synchronous send in contact-submit stays. When a provider IS configured the owner is
-- emailed immediately, and the queued event then re-reads the row, finds notification_status
-- 'sent', and acknowledges itself without sending a second copy. The queue is the safety net,
-- not the primary path.

-- =========================================================================================
-- 1. Emit contact.submitted alongside every real submission
-- =========================================================================================
create or replace function public.emit_contact_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  /* Honeypot rows are stored on purpose — browser autofill occasionally populates the hidden
     field, and binning a genuine enquiry over an autofill quirk is worse than storing a little
     spam. They are never alerted on, so they are never queued either. */
  if new.source = 'website_form_honeypot' then
    return new;
  end if;

  perform public.emit_event(
    'contact.submitted',
    'web',
    new.workspace_id,   -- null for the public marketing form; the column allows it
    /* Only the id and reference travel in the payload. The handler re-reads the row, which keeps
       personal data out of the event log AND means the handler always sees the current
       notification_status rather than a snapshot taken before the synchronous send finished. */
    jsonb_build_object('submission_id', new.id, 'reference', new.reference),
    new.correlation_id,
    null,
    -- One submission can only ever produce one alert event, however many times a retry runs.
    'contact.submitted:' || new.id::text,
    'system',
    null
  );
  return new;
end; $$;

drop trigger if exists contact_submissions_emit on public.contact_submissions;
create trigger contact_submissions_emit after insert on public.contact_submissions
  for each row execute function public.emit_contact_submitted();

-- =========================================================================================
-- 2. Backfill the enquiries that were captured before any of this existed
-- =========================================================================================
-- emit_event catches unique_violation on the idempotency key and returns the existing event,
-- so this block is safe to run more than once.
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, reference, correlation_id, workspace_id
      from public.contact_submissions
     where source is distinct from 'website_form_honeypot'
       and coalesce(notification_status, 'pending') <> 'sent'
     order by created_at
  loop
    perform public.emit_event(
      'contact.submitted', 'web', r.workspace_id,
      jsonb_build_object('submission_id', r.id, 'reference', r.reference),
      r.correlation_id, null,
      'contact.submitted:' || r.id::text, 'system', null);
    n := n + 1;
  end loop;
  raise notice 'queued % contact submission(s) for alerting', n;
end $$;
