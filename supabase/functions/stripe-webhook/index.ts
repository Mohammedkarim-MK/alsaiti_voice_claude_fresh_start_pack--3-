// POST /functions/v1/stripe-webhook — turn a Stripe payment into access.
//
// AUTH: verify_jwt = false. Stripe has no user session; the proof of authenticity is the
// Stripe-Signature header, verified below. Without STRIPE_WEBHOOK_SECRET this function refuses
// to run at all rather than defaulting to trusting whatever arrives — an unverified webhook
// endpoint is a public API for granting yourself a subscription.
//
// Deliberately NOT using set_subscription(): that checks is_platform_admin(), which is the check
// that stops customers upgrading themselves, and weakening it so a webhook can pass would undo
// the whole point. The webhook calls apply_stripe_subscription(), which is revoked from every
// client role and refuses any caller that has a user session.

import { preflight, json, fail } from '../_shared/http.ts';
import { serviceClient } from '../_shared/store.ts';
import { correlationId, logger } from '../_shared/log.ts';

function env(k: string): string | undefined {
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).Deno?.env.get(k) || undefined;
}

/** Constant-time compare. A byte-by-byte early return leaks the signature through timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify Stripe's signature scheme by hand rather than pulling in the SDK: the whole algorithm is
 * an HMAC over "timestamp.body", and a webhook verifier is exactly the code you want to be able
 * to read in full.
 */
async function verify(body: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.trim().split('=') as [string, string]),
  );
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;

  // Reject anything older than five minutes, so a captured request cannot be replayed later.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(expected, v1);
}

/** Stripe's vocabulary is not ours; map it once, here, rather than in three places. */
function mapStatus(stripeStatus: string): string | null {
  switch (stripeStatus) {
    case 'active':              return 'active';
    case 'trialing':            return 'trialing';
    case 'past_due':            return 'past_due';
    case 'unpaid':              return 'suspended';
    case 'canceled':            return 'cancelled';
    case 'incomplete_expired':  return 'cancelled';
    // 'incomplete' means checkout has not finished. Granting access on it would hand the product
    // to anyone who starts a checkout and abandons it.
    case 'incomplete':          return null;
    case 'paused':              return 'suspended';
    default:                    return null;
  }
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  const cid = correlationId(req);
  const log = logger('stripe-webhook', cid);

  const secret = env('STRIPE_WEBHOOK_SECRET');
  if (!secret) {
    log.error('not_configured', { error_code: 'no_webhook_secret' });
    return fail('stripe_not_configured', 503);
  }

  const sigHeader = req.headers.get('stripe-signature');
  const body = await req.text();
  if (!sigHeader || !(await verify(body, sigHeader, secret))) {
    log.warn('bad_signature', { error_code: 'signature_invalid' });
    return fail('invalid_signature', 401);
  }

  let event: Record<string, unknown>;
  try { event = JSON.parse(body); } catch { return fail('invalid_json', 400); }

  const type = String(event.type || '');
  const obj = ((event.data as Record<string, unknown>)?.object || {}) as Record<string, unknown>;
  const sb = serviceClient();

  try {
    if (type.startsWith('customer.subscription.')) {
      const stripeStatus = String(obj.status || '');
      const status = type === 'customer.subscription.deleted' ? 'cancelled' : mapStatus(stripeStatus);
      if (!status) {
        // Acknowledge so Stripe stops retrying, but say plainly that nothing was granted.
        log.info('ignored_status', { type, stripe_status: stripeStatus });
        return json({ received: true, applied: false, reason: 'status not actionable' });
      }

      // The plan is whatever nickname the price carries in Stripe. If it does not match a row in
      // public.plans, apply_stripe_subscription leaves the existing plan alone rather than
      // setting a plan with no limits attached to it.
      const items = (obj.items as Record<string, unknown>)?.data as Array<Record<string, unknown>> | undefined;
      const price = items?.[0]?.price as Record<string, unknown> | undefined;
      const plan = (price?.nickname as string) || (price?.lookup_key as string) || null;

      const { data, error } = await sb.rpc('apply_stripe_subscription', {
        p_customer_id: String(obj.customer || ''),
        p_subscription_id: String(obj.id || ''),
        p_status: status,
        p_plan: plan,
        p_period_end: obj.trial_end ? new Date(Number(obj.trial_end) * 1000).toISOString() : null,
      });
      if (error) throw new Error(error.message);

      log.info('applied', { type, status, matched: (data as Record<string, unknown>)?.ok });
      return json({ received: true, applied: (data as Record<string, unknown>)?.ok ?? false });
    }

    if (type === 'invoice.payment_failed') {
      // Deliberately past_due and not suspended. Cutting a paying customer off the moment a card
      // expires loses their leads over a banking glitch; Stripe will send subscription.updated
      // with 'unpaid' when it has genuinely given up, and that maps to suspended.
      const { data } = await sb.rpc('apply_stripe_subscription', {
        p_customer_id: String(obj.customer || ''),
        p_subscription_id: String(obj.subscription || ''),
        p_status: 'past_due', p_plan: null, p_period_end: null,
      });
      log.warn('payment_failed', { matched: (data as Record<string, unknown>)?.ok });
      return json({ received: true, applied: (data as Record<string, unknown>)?.ok ?? false });
    }

    // Everything else is acknowledged and ignored. Returning non-2xx would make Stripe retry an
    // event we were never going to act on, for days.
    log.info('unhandled_event', { type });
    return json({ received: true, applied: false, reason: 'event type not handled' });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    log.error('handler_failed', { error_code: 'handler_failed', detail: msg });
    // 500 so Stripe retries: a genuine failure here means somebody paid and did not get access.
    return fail('handler_failed', 500);
  }
});
