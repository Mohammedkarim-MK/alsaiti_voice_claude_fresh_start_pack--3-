// POST /functions/v1/crm-authorise   { provider, returnUrl }
// Auth: requires a signed-in Supabase user (verify_jwt = true).
// Creates a single-use OAuth session (state + optional PKCE) and returns the provider's REAL
// authorization URL. The browser then navigates there so the user approves inside the provider.

import { preflight, json, fail } from '../_shared/http.ts';
import { enforceLimit, userBucket, LIMITS } from '../_shared/ratelimit.ts';
import { resolveWorkspace, store } from '../_shared/store.ts';
import { encryptJson } from '../_shared/crypto.ts';
import { makeState, makePkce } from '../_shared/crypto.ts';
import { getProviderConfig, buildAuthorizeUrl, callbackUrl, CrmProvider } from '../_shared/providers.ts';

const SUPPORTED: CrmProvider[] = ['hubspot', 'pipedrive', 'highlevel', 'google_sheets', 'salesforce', 'zoho', 'dynamics'];

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  try {
    const { provider, returnUrl } = await req.json().catch(() => ({}));
    if (!SUPPORTED.includes(provider)) return fail('unsupported_provider', 400);

    const { userId, workspaceId } = await resolveWorkspace(req);
    const limited = await enforceLimit(userBucket(userId, 'crm-authorise'), LIMITS.auth);
    if (limited) return limited;
    const cfg = getProviderConfig(provider);          // throws if the provider's client env is missing
    const redirectUri = callbackUrl(provider);
    const { state, stateHash } = await makeState();
    const pkce = cfg.usePkce ? await makePkce() : null;

    await store.createSession({
      workspaceId, userId, provider, stateHash,
      pkceVerifierCiphertext: pkce ? await encryptJson(pkce.verifier) : undefined,
      requestedScopes: cfg.scopes, redirectUri, returnUrl,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    await store.audit(workspaceId, provider, 'authorisation_started');

    const authorizationUrl = buildAuthorizeUrl(cfg, state, redirectUri, pkce?.challenge);
    return json({ ok: true, authorizationUrl });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (msg === 'unauthenticated') return fail('unauthenticated', 401);
    if (msg === 'no_workspace') return fail('no_workspace', 403);
    if (msg.startsWith('Missing env')) return fail('provider_not_configured', 501, msg);
    return fail('authorise_failed', 500, msg);
  }
});
