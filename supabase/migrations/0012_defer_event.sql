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
