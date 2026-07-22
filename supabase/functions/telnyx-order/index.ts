// POST /functions/v1/telnyx-order   { phoneNumber, idempotencyKey? }
// Auth: verify_jwt = true. Orders a number via Telnyx with an Idempotency-Key so repeated
// clicks/retries never double-order. Records the number as 'test_pending' — it becomes 'active'
// ONLY after a real inbound test call is recorded by telnyx-webhook. Never 'active' on order.

import { preflight, json, fail } from '../_shared/http.ts';
import { enforceLimit, userBucket, LIMITS } from '../_shared/ratelimit.ts';
import { resolveWorkspace, serviceClient } from '../_shared/store.ts';
import { telnyx } from '../_shared/telnyx.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  try {
    const { userId, workspaceId } = await resolveWorkspace(req);
    const limited = await enforceLimit(userBucket(userId, 'telnyx-order'), LIMITS.order);
    if (limited) return limited;
    const body = await req.json().catch(() => ({}));
    const phoneNumber = body.phoneNumber;
    if (!phoneNumber || !/^\+?[0-9]{6,15}$/.test(String(phoneNumber).replace(/\s/g, ''))) return fail('invalid_number', 400);

    // Stable idempotency key: caller-supplied, else derived from workspace+number so a retry
    // of the SAME order reuses it rather than ordering twice.
    const idempotencyKey = body.idempotencyKey || `alsaiti-${workspaceId}-${String(phoneNumber).replace(/\D/g, '')}`;

    const order = await telnyx.orderNumber({ phoneNumber, idempotencyKey });
    const sb = serviceClient();
    const now = new Date().toISOString();
    const { data, error } = await sb.from('phone_numbers').upsert({
      workspace_id: workspaceId, provider: 'telnyx',
      provider_order_id: order.id,
      e164: order.phoneNumbers[0] || phoneNumber,
      status: 'test_pending',           // NOT active — awaits a real inbound test call
      updated_at: now,
    }, { onConflict: 'provider,provider_number_id' }).select('id').maybeSingle();
    if (error && error.code !== '23505') console.error('phone_numbers upsert', error);

    return json({ ok: true, order, status: 'test_pending', localId: data?.id, note: 'Number becomes Active only after a real inbound test call is recorded.' });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (msg === 'unauthenticated') return fail('unauthenticated', 401);
    if (msg.startsWith('Missing')) return fail('telnyx_not_configured', 501, msg);
    return fail('order_failed', 502, msg);
  }
});
