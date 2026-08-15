// POST /functions/v1/stripe-billing   — start a Checkout Session, or open the Customer Portal.
//
// AUTH: verify_jwt = true. Only a signed-in user can start checkout, and only for a workspace
// they administer — otherwise anyone could open a Checkout Session that, once paid, provisions
// somebody else's account.
//
// Two actions in one function rather than two functions, because they share everything that
// matters: the auth check, the workspace lookup, and the get-or-create of the Stripe customer.
// Splitting them would mean duplicating the customer logic, and the failure mode of that
// duplication is two Stripe customers for one workspace — which silently breaks the webhook,
// since apply_stripe_subscription() matches on stripe_customer_id.
//
// The secret key never leaves this function. The browser receives a URL and nothing else.
// Access is provisioned by the WEBHOOK (stripe-webhook), never here and never on the success
// redirect: a user can open the success URL directly without paying.

import { preflight, json, fail } from '../_shared/http.ts';
import { serviceClient, userClient } from '../_shared/store.ts';
import { correlationId, logger } from '../_shared/log.ts';
import { enforceLimit, userBucket } from '../_shared/ratelimit.ts';

function env(k: string): string | undefined {
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).Deno?.env.get(k) || undefined;
}

const LIMIT = { limit: 10, windowSeconds: 60 };

/* Price IDs come from env, never from the client. A price id in the request body would let
   anyone check out at any price — including one they created in their own Stripe account.
   Products and Prices are created in the Stripe dashboard; this only maps a plan name to one. */
function priceId(plan: string, period: string): string | undefined {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${period.toUpperCase()}`;
  return env(key);
}

/** Stripe's API is form-encoded, and nested keys use bracket notation. */
function form(obj: Record<string, string | number | boolean | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) p.append(k, String(v));
  return p.toString();
}

async function stripe(pathname: string, body: Record<string, unknown>, idempotencyKey?: string) {
  const key = env('STRIPE_SECRET_KEY');
  if (!key) throw new Error('stripe_not_configured');
  const headers: Record<string, string> = {
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  // Stripe retries and users double-click. An idempotency key makes both harmless.
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const r = await fetch('https://api.stripe.com/v1/' + pathname, {
    method: 'POST', headers, body: form(body as Record<string, string>),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || ('stripe_http_' + r.status));
  return j;
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  const cid = correlationId(req);
  const log = logger('stripe-billing', cid);

  /* Identity first, configuration second. The other order answers "Stripe is not set up here"
     to anyone holding the public anon key — harmless in itself, but an endpoint should not tell
     an unauthenticated caller anything about its own state. */
  const { data: userData } = await userClient(req).auth.getUser();
  const user = userData?.user;
  if (!user) return fail('unauthorised', 401);

  if (!env('STRIPE_SECRET_KEY')) {
    // Fail closed and say so plainly, rather than 500-ing on the first Stripe call.
    return fail('stripe_not_configured', 503);
  }

  const limited = await enforceLimit(userBucket(user.id, 'billing'), LIMIT);
  if (limited) return limited;

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return fail('invalid_json', 400); }

  const sb = serviceClient();

  /* The workspace must be one this user ADMINISTERS, not merely belongs to. can_admin() is the
     same check the rest of the product uses, so billing cannot drift from it. */
  const { data: allowed } = await sb.rpc('can_admin_as', { p_user: user.id, p_workspace: body.workspace_id });
  if (!allowed) return fail('not_permitted', 403);

  const { data: ws } = await sb.from('workspaces')
    .select('id,name,stripe_customer_id,subscription_status')
    .eq('id', body.workspace_id).maybeSingle();
  if (!ws) return fail('workspace_not_found', 404);

  try {
    /* Get or create the Stripe customer, and store it before doing anything else. If checkout
       succeeds and we never wrote stripe_customer_id, the webhook cannot match the payment to a
       workspace — the customer has paid and nothing unlocks. Writing first makes that impossible. */
    let customer = ws.stripe_customer_id as string | null;
    if (!customer) {
      const c = await stripe('customers', {
        email: user.email, name: ws.name,
        'metadata[workspace_id]': ws.id, 'metadata[user_id]': user.id,
      }, 'cust:' + ws.id);
      customer = c.id;
      const { error } = await sb.rpc('admin_link_stripe_service', { p_workspace: ws.id, p_customer_id: customer });
      if (error) throw new Error('could not store stripe customer: ' + error.message);
    }

    const appUrl = env('PUBLIC_APP_URL') || 'https://alsaitigrowth.com';

    if (body.action === 'portal') {
      const s = await stripe('billing_portal/sessions', {
        customer, return_url: appUrl + '/#/settings',
      });
      log.info('portal_opened', { workspace_id: ws.id });
      return json({ ok: true, url: s.url });
    }

    // ---- checkout ----
    const plan = String(body.plan || '');
    const period = String(body.period || 'monthly');
    if (!['starter', 'growth', 'business'].includes(plan)) return fail('unknown_plan', 400);
    if (!['monthly', 'annual'].includes(period)) return fail('unknown_period', 400);

    const price = priceId(plan, period);
    if (!price) {
      // Honest: the plan exists but nobody has created its Price in Stripe yet.
      log.warn('price_not_configured', { plan, period });
      return fail('price_not_configured', 503);
    }

    const session = await stripe('checkout/sessions', {
      mode: 'subscription',
      customer,
      'line_items[0][price]': price,
      'line_items[0][quantity]': 1,
      /* Stripe Tax handles UK VAT and EU place-of-supply. Without this every EU sale is
         mispriced and the VAT is ours to eat. */
      'automatic_tax[enabled]': true,
      'customer_update[address]': 'auto',
      'subscription_data[metadata][workspace_id]': ws.id,
      'metadata[workspace_id]': ws.id,
      allow_promotion_codes: true,
      /* The success page is a receipt, not a grant of access. Provisioning happens in
         stripe-webhook on checkout.session.completed, because this URL can be opened by anyone. */
      success_url: appUrl + '/#/settings?checkout=done',
      cancel_url: appUrl + '/#/pricing',
    }, 'co:' + ws.id + ':' + plan + ':' + period);

    log.info('checkout_started', { workspace_id: ws.id, plan, period });
    return json({ ok: true, url: session.url });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    log.error('billing_failed', { error_code: 'billing_failed', detail: msg });
    return fail(msg === 'stripe_not_configured' ? 'stripe_not_configured' : 'billing_failed',
                msg === 'stripe_not_configured' ? 503 : 500);
  }
});
