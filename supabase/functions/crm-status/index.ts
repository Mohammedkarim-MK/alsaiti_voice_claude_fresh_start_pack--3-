// GET /functions/v1/crm-status
// Auth: verify_jwt = true. Returns the caller's workspace CRM connections with TRUTHFUL states
// and safe fields only (never tokens or the credential reference). The vanilla-JS app reads this
// instead of embedding the supabase-js client.

import { preflight, json, fail } from '../_shared/http.ts';
import { enforceLimit, userBucket, LIMITS } from '../_shared/ratelimit.ts';
import { resolveWorkspace, serviceClient } from '../_shared/store.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'GET' && req.method !== 'POST') return fail('method_not_allowed', 405);

  try {
    const { userId, workspaceId } = await resolveWorkspace(req);
    const limited = await enforceLimit(userBucket(userId, 'crm-status'), LIMITS.read);
    if (limited) return limited;
    const sb = serviceClient();
    const { data, error } = await sb.from('crm_connections')
      .select('id, provider, status, external_account_name, granted_scopes, metadata, sync_enabled, last_tested_at, last_success_at, last_failure_at, last_error, updated_at')
      .eq('workspace_id', workspaceId).order('created_at', { ascending: false });
    if (error) throw error;
    return json({ ok: true, connections: data || [] });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (msg === 'unauthenticated') return fail('unauthenticated', 401);
    if (msg === 'no_workspace') return fail('no_workspace', 403);
    return fail('status_failed', 500, msg);
  }
});
