// POST /functions/v1/telnyx-verify
// Auth: verify_jwt = true. Real Telnyx account check (reads balance with TELNYX_API_KEY, which
// lives ONLY in the function env — never in the frontend). Records the telephony connection as
// 'connected' only when the key genuinely works.

import { preflight, json, fail } from '../_shared/http.ts';
import { resolveWorkspace, serviceClient } from '../_shared/store.ts';
import { telnyx } from '../_shared/telnyx.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  try {
    const { workspaceId } = await resolveWorkspace(req);
    const sb = serviceClient();
    const now = new Date().toISOString();

    // No-funds mode (Malik's plan): distinguish "no key" -> missing_credentials, "unfunded" ->
    // funding_required, "bad key" -> error, "funded + valid" -> connected. `state` drives the UI.
    let result;
    try {
      result = await telnyx.verifyConnection();
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      if (msg.startsWith('Missing')) {
        await sb.from('telephony_connections').upsert({ workspace_id: workspaceId, provider: 'telnyx', mode: 'api_key', status: 'needs_setup', last_error: { detail: 'missing_credentials' }, updated_at: now }, { onConflict: 'workspace_id,provider' });
        return json({ ok: false, state: 'missing_credentials', status: 'needs_setup', error: 'missing_credentials' });
      }
      throw e;
    }

    if (!result.ok) {
      await sb.from('telephony_connections').upsert({ workspace_id: workspaceId, provider: 'telnyx', mode: 'api_key', status: 'attention_required', last_verified_at: now, last_error: { detail: result.detail }, updated_at: now }, { onConflict: 'workspace_id,provider' });
      return json({ ok: false, state: 'error', status: 'attention_required', error: 'verification_failed', detail: result.detail });
    }

    const balance = parseFloat(String(result.balance ?? '0'));
    const funded = Number.isFinite(balance) && balance > 0;
    // A valid key with no balance can't order numbers or place calls — that's "funding required",
    // not "connected". Truthful: only a funded, valid account is 'connected'.
    const dbStatus = funded ? 'connected' : 'attention_required';
    const state = funded ? 'connected' : 'funding_required';
    await sb.from('telephony_connections').upsert({
      workspace_id: workspaceId, provider: 'telnyx', mode: 'api_key', status: dbStatus,
      external_account_name: 'Telnyx account',
      last_verified_at: now, last_error: funded ? null : { detail: 'funding_required' }, updated_at: now,
    }, { onConflict: 'workspace_id,provider' });

    return json({ ok: funded, state, status: dbStatus, balance: result.balance, currency: result.currency });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (msg === 'unauthenticated') return fail('unauthenticated', 401);
    return fail('verify_failed', 500, msg);
  }
});
