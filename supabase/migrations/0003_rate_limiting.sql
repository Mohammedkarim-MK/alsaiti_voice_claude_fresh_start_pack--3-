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
