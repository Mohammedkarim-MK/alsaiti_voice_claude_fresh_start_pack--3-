// POST /functions/v1/crm-test   { connectionId }
// Auth: verify_jwt = true. Runs a REAL provider round-trip (create + archive a test contact).
// Only a passing test flips the card to 'connected'; a failure sets 'attention_required'.

import { preflight, json, fail } from '../_shared/http.ts';
import { enforceLimit, userBucket, LIMITS } from '../_shared/ratelimit.ts';
import { resolveWorkspace, store } from '../_shared/store.ts';
import { getValidTokens } from '../_shared/tokens.ts';
import { hubspot } from '../_shared/hubspot.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  try {
    const { connectionId } = await req.json().catch(() => ({}));
    if (!connectionId) return fail('missing_connection', 400);

    const { userId, workspaceId } = await resolveWorkspace(req);
    const limited = await enforceLimit(userBucket(userId, 'crm-test'), LIMITS.test);
    if (limited) return limited;
    const conn = await store.getConnection(connectionId);
    if (!conn || conn.workspace_id !== workspaceId) return fail('connection_not_found', 404);
    if (!conn.credential_reference) return fail('not_authorised', 409);

    if (conn.provider !== 'hubspot') {
      // Other providers: authorisation is real, but the test connector isn't implemented yet.
      // Be truthful — do NOT claim 'connected'.
      await store.setConnectionStatus(conn.id, 'attention_required', { last_error: { code: 'test_not_implemented', message: `No live test for ${conn.provider} yet` } });
      return json({ ok: false, error: 'test_not_implemented', provider: conn.provider, status: 'attention_required' });
    }

    const tokens = await getValidTokens(conn);
    const result = await hubspot.runTest(tokens);
    const now = new Date().toISOString();
    if (result.ok) {
      await store.setConnectionStatus(conn.id, 'connected', { last_tested_at: now, last_success_at: now, last_error: null });
      await store.audit(workspaceId, conn.provider, 'test_passed', { operation: result.operation });
      return json({ ok: true, status: 'connected', operation: result.operation, testRecordId: result.externalTestRecordId });
    }
    await store.setConnectionStatus(conn.id, 'attention_required', { last_tested_at: now, last_failure_at: now, last_error: { code: 'test_failed', message: result.error } });
    await store.audit(workspaceId, conn.provider, 'test_failed', { error: result.error });
    return json({ ok: false, status: 'attention_required', error: result.error });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (msg === 'unauthenticated') return fail('unauthenticated', 401);
    return fail('test_failed', 500, msg);
  }
});
