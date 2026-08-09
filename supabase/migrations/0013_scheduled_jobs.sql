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
