// GET /functions/v1/crm-callback/:provider?code&state[&error]
// Auth: verify_jwt = false (the CRM redirects the browser here with no Supabase JWT).
// Validates the single-use state, exchanges the code SERVER-SIDE, stores encrypted tokens,
// loads identity + metadata, then redirects the browser back to the app. The card becomes
// 'test_required' here — only crm-test can flip it to 'connected'.

import { preflight, redirect, fail, safeReturnUrl } from '../_shared/http.ts';
import { enforceLimit, ipBucket, LIMITS } from '../_shared/ratelimit.ts';
import { store } from '../_shared/store.ts';
import { decryptJson, sha256b64url } from '../_shared/crypto.ts';
import { getProviderConfig, exchangeCode, callbackUrl, tokenExpiryIso, CrmProvider } from '../_shared/providers.ts';
import { hubspot } from '../_shared/hubspot.ts';

function appReturn(base: string | undefined, params: Record<string, string>): string {
  // deno-lint-ignore no-explicit-any
  const fallback = (globalThis as any).Deno?.env.get('PUBLIC_APP_URL') || '';
  // Re-validate even though crm-authorise already did: a row written by an older build (or a
  // direct DB write) must never turn this redirect into an open redirect.
  const target = safeReturnUrl(base) || fallback || '/';
  const sep = target.includes('?') ? '&' : '?';
  return target + sep + new URLSearchParams(params).toString();
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;

  // Public endpoint: throttle per IP so nobody can brute-force OAuth `state` values.
  const limited = await enforceLimit(ipBucket(req, 'crm-callback'), LIMITS.auth);
  if (limited) return limited;

  const url = new URL(req.url);
  const provider = url.pathname.split('/').pop() as CrmProvider;
  const code = url.searchParams.get('code') || undefined;
  const state = url.searchParams.get('state') || undefined;
  const oauthError = url.searchParams.get('error') || undefined;

  // deno-lint-ignore no-explicit-any
  const appUrl = (globalThis as any).Deno?.env.get('PUBLIC_APP_URL') || '';

  try {
    // Consent denied / missing params — still mark the session + audit so the app can explain.
    if (oauthError || !code || !state) {
      if (state) {
        const s = await store.findSessionByStateHash(await sha256b64url(state));
        if (s) {
          await store.errorSession(s.id, oauthError ? 'consent_denied' : 'missing_params', oauthError || 'code/state missing');
          await store.audit(s.workspace_id, provider, 'consent_denied', { error: oauthError });
        }
      }
      return redirect(appReturn(appUrl, { crm: provider, error: oauthError || 'consent_denied' }));
    }

    const session = await store.findSessionByStateHash(await sha256b64url(state));
    if (!session) return redirect(appReturn(appUrl, { crm: provider, error: 'invalid_state' }));
    if (new Date(session.expires_at) < new Date()) return redirect(appReturn(session.return_url, { crm: provider, error: 'expired_state' }));
    if (session.provider !== provider) return redirect(appReturn(session.return_url, { crm: provider, error: 'provider_mismatch' }));
    // Single-use: an atomic claim blocks replayed/concurrent callbacks.
    if (!(await store.claimSession(session.id))) return redirect(appReturn(session.return_url, { crm: provider, error: 'state_already_used' }));

    await store.audit(session.workspace_id, provider, 'code_received');

    const cfg = getProviderConfig(provider);
    const redirectUri = callbackUrl(provider);
    const verifier = session.pkce_verifier_ciphertext ? await decryptJson<string>(session.pkce_verifier_ciphertext) : undefined;

    let tokens;
    try {
      tokens = await exchangeCode(cfg, code, redirectUri, verifier);
    } catch (e) {
      await store.audit(session.workspace_id, provider, 'token_exchange_failed', { message: String(e) });
      await store.errorSession(session.id, 'token_exchange_failed', String(e));
      return redirect(appReturn(session.return_url, { crm: provider, error: 'token_exchange_failed' }));
    }
    await store.audit(session.workspace_id, provider, 'token_exchange_succeeded');

    // Identity + metadata (HubSpot is the reference connector; others load on first metadata call).
    let identity = { accountId: 'unknown', accountName: cfg.displayName, userId: undefined as string | undefined, userName: undefined as string | undefined };
    let metadata: Record<string, unknown> = {};
    if (provider === 'hubspot') {
      identity = await hubspot.getIdentity(tokens);
      try { metadata = await hubspot.loadMetadata(tokens); } catch { /* metadata is best-effort here */ }
    }

    // Re-authorisation reuses the existing vault row (never orphan credentials).
    const existing = await store.findConnectionByAccount(session.workspace_id, provider, identity.accountId);
    const credentialReference = await store.storeCredential(existing?.credential_reference || null, tokens);

    const conn = await store.upsertConnection({
      workspace_id: session.workspace_id,
      provider,
      status: 'test_required',                 // NOT 'connected' until a real test passes
      external_account_id: identity.accountId,
      external_account_name: identity.accountName,
      external_user_id: identity.userId,
      external_user_name: identity.userName,
      credential_reference: credentialReference,
      granted_scopes: (tokens.scope || '').split(' ').filter(Boolean),
      instance_url: tokens.instanceUrl,
      api_domain: tokens.apiDomain,
      token_expires_at: tokenExpiryIso(tokens),
      metadata,
      last_authorised_at: new Date().toISOString(),
    });
    await store.completeSession(session.id);
    await store.audit(session.workspace_id, provider, 'connection_authorised', { connection_id: conn.id });

    return redirect(appReturn(session.return_url, { crm: provider, connection: conn.id, status: 'test_required' }));
  } catch (e) {
    console.error('crm-callback error', e);
    return redirect(appReturn(appUrl, { crm: provider, error: 'callback_failed' }));
  }
});
