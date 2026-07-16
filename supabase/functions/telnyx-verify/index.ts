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

    let result;
    try {
      result = await telnyx.verifyConnection();
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      if (msg.startsWith('Missing')) {
        await sb.from('telephony_connections').upsert({ workspace_id: workspaceId, provider: 'telnyx', mode: 'api_key', status: 'needs_setup', updated_at: now }, { onConflict: 'workspace_id,provider' });
        return json({ ok: false, status: 'needs_setup', error: 'telnyx_not_configured' });
      }
      throw e;
    }

    const status = result.ok ? 'connected' : 'attention_required';
    await sb.from('telephony_connections').upsert({
      workspace_id: workspaceId, provider: 'telnyx', mode: 'api_key', status,
      external_account_name: result.ok ? 'Telnyx account' : null,
      last_verified_at: now, last_error: result.ok ? null : { detail: result.detail }, updated_at: now,
    }, { onConflict: 'workspace_id,provider' });

    return json({ ok: result.ok, status, balance: result.balance, currency: result.currency, detail: result.detail });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (msg === 'unauthenticated') return fail('unauthenticated', 401);
    return fail('verify_failed', 500, msg);
  }
});
