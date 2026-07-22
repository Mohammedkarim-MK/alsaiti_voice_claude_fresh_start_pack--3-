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
