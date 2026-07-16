// POST /functions/v1/crm-metadata   { connectionId }
// Auth: verify_jwt = true. Loads/refreshes account pipelines, stages, owners and fields from
// the provider and caches them on the connection row. Returns the metadata to the app.

import { preflight, json, fail } from '../_shared/http.ts';
import { resolveWorkspace, store } from '../_shared/store.ts';
import { getValidTokens } from '../_shared/tokens.ts';
import { hubspot } from '../_shared/hubspot.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  try {
    const { connectionId } = await req.json().catch(() => ({}));
    if (!connectionId) return fail('missing_connection', 400);

    const { workspaceId } = await resolveWorkspace(req);
    const conn = await store.getConnection(connectionId);
    if (!conn || conn.workspace_id !== workspaceId) return fail('connection_not_found', 404);
    if (!conn.credential_reference) return fail('not_authorised', 409);

    if (conn.provider !== 'hubspot') {
      return json({ ok: true, provider: conn.provider, metadata: conn.metadata || {}, note: 'live metadata only implemented for HubSpot so far' });
    }

    const tokens = await getValidTokens(conn);
    const metadata = await hubspot.loadMetadata(tokens);
    await store.setConnectionStatus(conn.id, conn.status, { metadata });  // status unchanged; just cache metadata
    return json({ ok: true, provider: conn.provider, metadata });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (msg === 'unauthenticated') return fail('unauthenticated', 401);
    return fail('metadata_failed', 500, msg);
  }
});
