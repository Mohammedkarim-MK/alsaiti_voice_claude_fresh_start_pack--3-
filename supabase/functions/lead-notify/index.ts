// POST /functions/v1/lead-notify   { to, lead:{name,service,urgency,source,phone,email,summary,score} }
// Auth: verify_jwt = true — only a signed-in user can send an alert, and only to an address
// they control (it must match their own account email, so this can never be used to mail
// strangers). Rate limited per user. Returns 501 'no_email_provider' when no key is set, so the
// app can say so honestly instead of pretending an alert went out.

import { preflight, json, fail } from '../_shared/http.ts';
import { enforceLimit, userBucket } from '../_shared/ratelimit.ts';
import { resolveWorkspace } from '../_shared/store.ts';
import { emailProvider, sendEmail, leadAlert } from '../_shared/email.ts';

const LIMIT = { limit: 30, windowSeconds: 60 };   // a busy hour of enquiries, not a mail blast
const cap = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);

// deno-lint-ignore no-explicit-any
const appUrl = () => ((globalThis as any).Deno?.env.get('PUBLIC_APP_URL') || '').trim();

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  try {
    if (!emailProvider()) return fail('no_email_provider', 501);

    const body = await req.json().catch(() => ({}));
    const lead = body && typeof body.lead === 'object' ? body.lead : null;
    if (!lead) return fail('missing_lead', 400);

    const { userId, email: own } = await resolveWorkspace(req);
    const limited = await enforceLimit(userBucket(userId, 'lead-notify'), LIMIT);
    if (limited) return limited;

    // Only ever mail the signed-in user's own verified address. Without this the endpoint would
    // be an open relay: any authenticated account could send our branded mail to anyone.
    const to = String(body.to || own).toLowerCase();
    if (!own) return fail('no_account_email', 409);
    if (to !== own) return fail('recipient_not_allowed', 403);

    const safe = {
      name: cap(lead.name, 120), service: cap(lead.service, 200), urgency: cap(lead.urgency, 20),
      source: cap(lead.source, 40), phone: cap(lead.phone, 40), email: cap(lead.email, 200),
      summary: cap(lead.summary, 1200),
      score: typeof lead.score === 'number' && isFinite(lead.score) ? Math.round(lead.score) : undefined,
    };

    const { subject, html, text } = leadAlert(safe, appUrl());
    const sent = await sendEmail(to, subject, html, text);
    return json({ ok: true, provider: sent.provider, id: sent.id });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (msg === 'unauthenticated') return fail('unauthenticated', 401);
    if (msg === 'no_email_provider') return fail('no_email_provider', 501);
    return fail('notify_failed', 502, msg);
  }
});
