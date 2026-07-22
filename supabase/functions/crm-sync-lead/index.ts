// POST /functions/v1/crm-sync-lead   { connectionId, lead:{name,email,phone,service,summary,source}, createDeal? }
// Auth: verify_jwt = true. Pushes a REAL lead from Alsaiti Voice into the connected CRM
// (HubSpot), stores the external record id(s) in crm_sync_records, and returns the real link.
// Only a genuinely 'connected' connection can sync; the result is truthful (synced / failed).

import { preflight, json, fail } from '../_shared/http.ts';
import { enforceLimit, userBucket, LIMITS } from '../_shared/ratelimit.ts';
import { resolveWorkspace, store, serviceClient } from '../_shared/store.ts';
import { getValidTokens } from '../_shared/tokens.ts';
import { hubspot } from '../_shared/hubspot.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  try {
    const body = await req.json().catch(() => ({}));
    const { connectionId, lead, createDeal } = body;
    if (!connectionId || !lead || typeof lead !== 'object') return fail('missing_params', 400);

    const { userId, workspaceId } = await resolveWorkspace(req);
    const limited = await enforceLimit(userBucket(userId, 'crm-sync-lead'), LIMITS.write);
    if (limited) return limited;
    const conn = await store.getConnection(connectionId);
    if (!conn || conn.workspace_id !== workspaceId) return fail('connection_not_found', 404);
    if (conn.status !== 'connected') return fail('connection_not_connected', 409); // truthful: no sync before a passing test
    if (conn.provider !== 'hubspot') return fail('sync_not_implemented_for_provider', 501);
    if (!conn.credential_reference) return fail('not_authorised', 409);

    const sb = serviceClient();
    const clientLeadId = String(lead.id || lead.clientLeadId || '');
    const tokens = await getValidTokens(conn);
    const result = await hubspot.syncLead(tokens, lead, { createDeal: !!createDeal });
    const now = new Date().toISOString();

    if (!result.ok) {
      await upsertSync(sb, workspaceId, conn.id, clientLeadId, 'failed', {}, { message: result.error }, now);
      await store.audit(workspaceId, conn.provider, 'lead_sync_failed', { error: result.error });
      return json({ ok: false, status: 'failed', error: result.error });
    }
    const externalIds = { clientLeadId, contactId: result.contactId, dealId: result.dealId, recordUrl: result.recordUrl };
    await upsertSync(sb, workspaceId, conn.id, clientLeadId, 'synced', externalIds, null, now);
    await store.audit(workspaceId, conn.provider, 'lead_synced', { contactId: result.contactId, dealId: result.dealId });
    return json({ ok: true, status: 'synced', operation: result.operation, contactId: result.contactId, dealId: result.dealId, recordUrl: result.recordUrl });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (msg === 'unauthenticated') return fail('unauthenticated', 401);
    return fail('sync_failed', 500, msg);
  }
});

// Keep one sync row per (connection, client lead) — update if it exists, else insert.
// deno-lint-ignore no-explicit-any
async function upsertSync(sb: any, workspaceId: string, connectionId: string, clientLeadId: string, status: string, externalIds: Record<string, unknown>, error: unknown, now: string) {
  const { data: existing } = await sb.from('crm_sync_records').select('id')
    .eq('connection_id', connectionId).eq('external_ids->>clientLeadId', clientLeadId).maybeSingle();
  if (existing) {
    await sb.from('crm_sync_records').update({ status, external_ids: externalIds, error, updated_at: now }).eq('id', existing.id);
  } else {
    await sb.from('crm_sync_records').insert({ workspace_id: workspaceId, connection_id: connectionId, status, external_ids: externalIds, error });
  }
}
