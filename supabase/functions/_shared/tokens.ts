// Return a valid access token for a connection, refreshing under expiry.
//
// Concurrency matters here: most providers invalidate the old refresh token when they issue a
// new one, so two simultaneous refreshes would leave one request writing already-revoked tokens
// and killing the connection. A short TTL lock (migration 0004) ensures exactly one refresh
// happens; everyone else waits briefly and re-reads what the winner stored.

import { store, serviceClient } from './store.ts';
import { getProviderConfig, refreshTokens, tokenExpiryIso, CrmProvider, TokenSet } from './providers.ts';

const LOCK_TTL_SECONDS = 30;
const WAIT_MS = 400;
const MAX_WAITS = 12; // ~4.8s, comfortably inside the TTL

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Conn { id: string; provider: string; credential_reference: string; token_expires_at?: string }

export async function getValidTokens(connection: Conn): Promise<TokenSet> {
  const tokens = await store.readCredential(connection.credential_reference);
  const expiresSoon = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime() - Date.now() < 60_000
    : false;
  if (!expiresSoon || !tokens.refreshToken) return tokens;

  const sb = serviceClient();
  let holdsLock = false;
  try {
    const { data, error } = await sb.rpc('try_lock_refresh', {
      p_connection: connection.id, p_ttl_seconds: LOCK_TTL_SECONDS,
    });
    // If the lock table/RPC is missing (migration not applied), fall through and refresh
    // unlocked rather than breaking the product — same behaviour as before, just unguarded.
    if (error) console.error('try_lock_refresh unavailable, refreshing without a lock:', error.message);
    else holdsLock = data === true;

    if (!error && !holdsLock) {
      // Another request is refreshing. Wait for it, then use ITS result.
      for (let i = 0; i < MAX_WAITS; i++) {
        await sleep(WAIT_MS);
        const fresh = await store.readCredential(connection.credential_reference);
        if (fresh.accessToken && fresh.accessToken !== tokens.accessToken) return fresh; // winner wrote
      }
      // Winner never finished (crash/timeout). Fall through and refresh ourselves — the lock
      // has a TTL precisely so a dead holder can't block refreshes forever.
      console.warn('refresh lock wait timed out; proceeding unlocked for', connection.id);
    }

    const cfg = getProviderConfig(connection.provider as CrmProvider);
    const refreshed = await refreshTokens(cfg, tokens.refreshToken);
    if (!refreshed.refreshToken) refreshed.refreshToken = tokens.refreshToken; // some providers omit it
    await store.storeCredential(connection.credential_reference, refreshed);
    await store.recordRefresh(connection.id, tokenExpiryIso(refreshed));
    return refreshed;
  } catch (e) {
    await store.setConnectionStatus(connection.id, 'attention_required', {
      last_error: { code: 'refresh_failed', message: String(e) },
    });
    throw e;
  } finally {
    if (holdsLock) {
      try { await sb.rpc('unlock_refresh', { p_connection: connection.id }); } catch { /* TTL will clear it */ }
    }
  }
}
