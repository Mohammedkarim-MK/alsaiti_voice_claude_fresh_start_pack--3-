// POST /functions/v1/contact-submit   { first,last,biz,email,phone,wa,industry,system,problem }
// Public (verify_jwt = false) so the marketing site's contact form can reach it with just the anon
// key. Stored via the service role into public.contact_submissions so no enquiry is ever lost.
// Protected by a per-IP rate limit, strict length caps, and a honeypot to shrug off spam bots.

import { preflight, json, fail } from '../_shared/http.ts';
import { enforceLimit, ipBucket } from '../_shared/ratelimit.ts';
import { serviceClient } from '../_shared/store.ts';

const LIMIT = { limit: 8, windowSeconds: 60 };                 // per IP — humans fill forms slowly
const cap = (s: unknown, n: number): string | null =>
  (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : null);

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  const limited = await enforceLimit(ipBucket(req, 'contact'), LIMIT);
  if (limited) return limited;

  try {
    const b = await req.json().catch(() => ({}));
    // Honeypot: a real user never fills this hidden field. Bots do — accept silently, store nothing.
    if (typeof b.company_website === 'string' && b.company_website.trim()) return json({ ok: true });

    const email = cap(b.email, 160), phone = cap(b.phone, 40), wa = cap(b.wa, 40);
    if (!email && !phone && !wa) return fail('missing_contact', 400); // need at least one way to reply

    const row = {
      first_name: cap(b.first, 80), last_name: cap(b.last, 80), business: cap(b.biz, 120),
      email, phone, whatsapp: wa,
      industry: cap(b.industry, 120), system: cap(b.system, 80), message: cap(b.problem, 2000),
      source: 'website_form', user_agent: cap(req.headers.get('user-agent'), 300),
    };

    const { error } = await serviceClient().from('contact_submissions').insert(row);
    if (error) return fail('store_failed', 502, error.message);
    return json({ ok: true });
  } catch (e) {
    return fail('contact_failed', 502, String((e as Error)?.message || e));
  }
});
