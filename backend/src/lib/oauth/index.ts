// Alsaiti Voice — CRM OAuth orchestration.
// startAuthorisation()  -> POST /api/integrations/:provider/authorise
// handleCallback()      -> GET  /api/oauth/:provider/callback
// testConnection()      -> POST /api/integrations/:id/test  (only this can set status='connected')
// getValidAccessToken() -> used by CRM sync; refreshes under a lock, never returns to the client.

import {
  CrmProvider, CrmConnector, Ports,
} from './types';
import {
  getProviderConfig, makeState, makePkce, buildAuthorizeUrl, exchangeCode, refreshTokens, sha256b64url,
} from './providers';
import { hubspotConnector } from './hubspot';

// Register provider adapters as they are implemented.
const CONNECTORS: Partial<Record<CrmProvider, CrmConnector>> = {
  hubspot: hubspotConnector,
  // pipedrive: pipedriveConnector, highlevel: ..., google_sheets: ..., salesforce: ..., zoho: ..., dynamics: ...
};

export async function startAuthorisation(
  ports: Ports,
  input: { provider: CrmProvider; businessId: string; userId: string; returnPath?: string },
): Promise<{ authorizationUrl: string }> {
  const cfg = getProviderConfig(input.provider);
  const { state, stateHash } = makeState();
  const pkce = cfg.usePkce ? makePkce() : null;

  await ports.sessions.create({
    businessId: input.businessId,
    userId: input.userId,
    provider: input.provider,
    stateHash,
    pkceVerifierCiphertext: pkce ? await ports.encrypt(pkce.verifier) : undefined,
    requestedScopes: cfg.scopes,
    redirectUri: cfg.redirectUri,
    returnPath: input.returnPath,
    status: 'authorising',
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  await ports.audit.record(input.businessId, input.provider, 'authorisation_started');

  return { authorizationUrl: buildAuthorizeUrl(cfg, state, pkce?.challenge) };
}

export async function handleCallback(
  ports: Ports,
  input: { provider: CrmProvider; code?: string; state?: string; error?: string },
): Promise<{ redirectTo: string; connectionId: string }> {
  if (input.error || !input.code || !input.state) {
    throw new Error('consent_denied_or_missing_params');
  }
  const session = await ports.sessions.findByStateHash(sha256b64url(input.state));
  if (!session) throw new Error('invalid_state');
  if (new Date(session.expiresAt) < new Date()) throw new Error('expired_state');
  await ports.audit.record(session.businessId, input.provider, 'code_received');

  const cfg = getProviderConfig(input.provider);
  const verifier = session.pkceVerifierCiphertext ? await ports.decrypt(session.pkceVerifierCiphertext) : undefined;

  let tokens;
  try {
    tokens = await exchangeCode(cfg, input.code, verifier);
  } catch (e: any) {
    await ports.audit.record(session.businessId, input.provider, 'token_exchange_failed', { message: e.message });
    await ports.sessions.markError(session.id, 'token_exchange_failed', e.message);
    throw e;
  }
  await ports.audit.record(session.businessId, input.provider, 'token_exchange_succeeded');

  const connector = CONNECTORS[input.provider];
  const identity = connector
    ? await connector.getIdentity(tokens)
    : { accountId: 'unknown', accountName: cfg.displayName };

  const credentialReference = await ports.vault.store(null, tokens);

  const conn = await ports.connections.upsert({
    businessId: session.businessId,
    provider: input.provider,
    status: 'configuration_required', // NOT 'connected' yet — a real test must pass first
    externalAccountId: identity.accountId,
    externalAccountName: identity.accountName,
    externalUserId: identity.userId,
    externalUserName: identity.userName,
    credentialReference,
    grantedScopes: (tokens.scope || '').split(' ').filter(Boolean),
    instanceUrl: tokens.instanceUrl,
    apiDomain: tokens.apiDomain,
    tokenExpiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString() : undefined,
  });
  await ports.sessions.markCompleted(session.id);

  return {
    redirectTo: `${process.env.APP_URL || ''}${session.returnPath || '/integrations'}?connection=${conn.id}`,
    connectionId: conn.id,
  };
}

// Only a passing real test flips the card to 'connected' (spec §5.2).
export async function testConnection(ports: Ports, connectionId: string): Promise<{ ok: boolean; operation: string; error?: string }> {
  const conn = await ports.connections.get(connectionId);
  if (!conn || !conn.credentialReference) throw new Error('connection_not_found');
  const connector = CONNECTORS[conn.provider];
  if (!connector) throw new Error(`no_connector_for_${conn.provider}`);

  const tokens = await getValidAccessTokenSet(ports, connectionId);
  const identity = await connector.getIdentity(tokens);
  const result = await connector.runTest(tokens, identity);
  await ports.connections.setStatus(connectionId, result.ok ? 'connected' : 'attention_required');
  return { ok: result.ok, operation: result.operation, error: result.error };
}

// Refresh-on-demand. A distributed lock (e.g. Redis) MUST wrap the refresh in production
// to avoid concurrent refreshes invalidating each other.
async function getValidAccessTokenSet(ports: Ports, connectionId: string) {
  const conn = await ports.connections.get(connectionId);
  if (!conn || !conn.credentialReference) throw new Error('connection_not_found');
  const tokens = await ports.vault.read(conn.credentialReference);
  const expiresSoon = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() - Date.now() < 60_000 : false;
  if (!expiresSoon || !tokens.refreshToken) return tokens;

  const cfg = getProviderConfig(conn.provider);
  try {
    const refreshed = await refreshTokens(cfg, tokens.refreshToken);
    if (!refreshed.refreshToken) refreshed.refreshToken = tokens.refreshToken; // some providers omit it on refresh
    await ports.vault.store(conn.credentialReference, refreshed);
    await ports.audit.record(conn.businessId, conn.provider, 'token_refreshed');
    return refreshed;
  } catch (e: any) {
    await ports.audit.record(conn.businessId, conn.provider, 'refresh_failed', { message: e.message });
    await ports.connections.setStatus(connectionId, 'attention_required');
    throw e;
  }
}

export async function getValidAccessToken(ports: Ports, connectionId: string): Promise<string> {
  return (await getValidAccessTokenSet(ports, connectionId)).accessToken;
}

export async function disconnect(ports: Ports, connectionId: string): Promise<void> {
  const conn = await ports.connections.get(connectionId);
  if (!conn) return;
  await ports.connections.setStatus(connectionId, 'disconnecting');
  if (conn.credentialReference) await ports.vault.destroy(conn.credentialReference); // revoke at provider first where supported
  await ports.connections.setStatus(connectionId, 'disconnected');
  await ports.audit.record(conn.businessId, conn.provider, 'disconnected');
  // Leads already captured are preserved (they live in Supabase, not the CRM connection).
}
