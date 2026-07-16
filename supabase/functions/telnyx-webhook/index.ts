// POST /functions/v1/telnyx-webhook
// Auth: verify_jwt = false (Telnyx signs with Ed25519, not a Supabase JWT). We verify the
// signature + freshness ourselves. No unverified event may update a call or number.
// On a verified inbound call event we record the call session and flip the number to 'active'
// (a number only goes Active after a REAL inbound test call is recorded).

import { preflight, json, fail } from '../_shared/http.ts';
import { serviceClient } from '../_shared/store.ts';
import { telnyx } from '../_shared/telnyx.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  const raw = await req.text();
  const signature = req.headers.get('telnyx-signature-ed25519') || '';
  const timestamp = req.headers.get('telnyx-timestamp') || '';

  const valid = await telnyx.verifyWebhook(raw, signature, timestamp);
  if (!valid) return fail('invalid_signature', 401);

  let event: Record<string, unknown>;
  try { event = JSON.parse(raw); } catch { return fail('bad_json', 400); }
  // deno-lint-ignore no-explicit-any
  const data: any = (event as any).data || {};
  const eventId = data.id || null;
  const eventType = data.event_type || data.record_type || 'unknown';
  const payload = data.payload || {};

  const sb = serviceClient();

  // Idempotent receipt: unique(provider, provider_event_id) drops duplicate deliveries.
  const { error: dupErr } = await sb.from('telephony_webhook_events').insert({
    provider: 'telnyx', provider_event_id: eventId, event_type: eventType, verified: true, payload: event,
  });
  if (dupErr && dupErr.code === '23505') return json({ ok: true, duplicate: true });

  try {
    // A real inbound call proves the number works → mark it Active + record the call session.
    if (typeof eventType === 'string' && eventType.startsWith('call.') && payload.direction === 'incoming') {
      const toE164 = payload.to;
      const { data: num } = await sb.from('phone_numbers').select('id, workspace_id, status').eq('e164', toE164).maybeSingle();
      if (num) {
        const now = new Date().toISOString();
        await sb.from('call_sessions').upsert({
          workspace_id: num.workspace_id, provider: 'telnyx',
          provider_call_id: payload.call_control_id || payload.call_session_id || eventId,
          direction: 'inbound', status: eventType, from_e164: payload.from, to_e164: toE164,
          started_at: now, updated_at: now,
        }, { onConflict: 'provider,provider_call_id' });
        if (num.status !== 'active') {
          await sb.from('phone_numbers').update({ status: 'active', last_inbound_call_at: now, last_tested_at: now, updated_at: now }).eq('id', num.id);
        }
      }
    }
    await sb.from('telephony_webhook_events').update({ processed_at: new Date().toISOString() }).eq('provider_event_id', eventId);
  } catch (e) {
    console.error('telnyx-webhook processing error', e);
    // Still 200 so Telnyx doesn't hammer retries; the event is stored for reprocessing.
  }

  return json({ ok: true });
});
