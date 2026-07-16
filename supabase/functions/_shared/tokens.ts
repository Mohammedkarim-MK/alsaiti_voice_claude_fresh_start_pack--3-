// Return a valid access token for a connection, refreshing under expiry and persisting the
// new expiry. A distributed lock (e.g. Postgres advisory lock / Redis) SHOULD wrap the refresh
// in production so concurrent refreshes don't invalidate each other.

import { store } from './store.ts';
import { getProviderConfig, refreshTokens, tokenExpiryIso, CrmProvider, TokenSet } from './providers.ts';

export async function getValidTokens(connection: { id: string; provider: string; credential_reference: string; token_expires_at?: string }): Promise<TokenSet> {
  const tokens = await store.readCredential(connection.credential_reference);
  const expiresSoon = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime() - Date.now() < 60_000
    : false;
  if (!expiresSoon || !tokens.refreshToken) return tokens;

  const cfg = getProviderConfig(connection.provider as CrmProvider);
  try {
    const refreshed = await refreshTokens(cfg, tokens.refreshToken);
    if (!refreshed.refreshToken) refreshed.refreshToken = tokens.refreshToken; // some providers omit it on refresh
    await store.storeCredential(connection.credential_reference, refreshed);
    await store.recordRefresh(connection.id, tokenExpiryIso(refreshed));
    return refreshed;
  } catch (e) {
    await store.setConnectionStatus(connection.id, 'attention_required', { last_error: { code: 'refresh_failed', message: String(e) } });
    throw e;
  }
}
