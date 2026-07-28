// POST /functions/v1/contact-submit
//   { first,last,biz,email,phone,wa,industry,system,problem,consent,idem,company_website }
//
// Public (verify_jwt = false) so the marketing site's contact form can reach it with just the
// anon key. Stored via the service role into public.contact_submissions.
//
// Handoff §5. The contract this function owes the caller: it returns ok:true ONLY after the row
// is committed. The website is not allowed to say "Sent" on anything else. It also reports the
// notification state separately and truthfully — "we saved your enquiry but the alert email has
// not gone out yet" is a real, expected outcome, not a failure to paper over.

import { preflight, json, fail } from '../_shared/http.ts';
import { enforceLimit, ipBucket, clientIp } from '../_shared/ratelimit.ts';
import { serviceClient } from '../_shared/store.ts';
import { EMAIL_RE, contactAlert, sendEmail, replyToAddress, emailProvider } from '../_shared/email.ts';
import { correlationId, logger } from '../_shared/log.ts';

const LIMIT = { limit: 8, windowSeconds: 60 };                 // per IP — humans fill forms slowly
const EMAIL_TIMEOUT_MS = 5000;                                 // never make a visitor wait on a provider

const cap = (s: unknown, n: number): string | null =>
  (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : null);

function env(k: string): string | undefined {
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).Deno?.env.get(k) || undefined;
}

/**
 * Salted hash of the caller IP, for abuse investigation only.
 *
 * Returns null when no salt is configured, and that is deliberate. A bare SHA-256 of an IPv4
 * address is not anonymisation — the whole four-billion keyspace can be enumerated in seconds —
 * so storing one would claim a privacy property we do not actually have. Better to store nothing.
 */
async function hashIp(req: Request): Promise<string | null> {
  const salt = env('CONTACT_IP_HASH_SALT');
  if (!salt) return null;
  const ip = clientIp(req);
  if (!ip || ip === 'unknown') return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return Array.from(new Uint8Array(digest)).slice(0, 16)
    .map((x) => x.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  // One id for this enquiry, carried through the logs and stored on the row, so a visitor's
  // "I submitted at 14:20" can actually be traced end to end (§17.1).
  const cid = correlationId(req);
  const log = logger('contact-submit', cid);

  const limited = await enforceLimit(ipBucket(req, 'contact'), LIMIT);
  if (limited) { log.warn('rate_limited'); return limited; }

  try {
    const b = await req.json().catch(() => ({}));
    const sb = serviceClient();

    const email = cap(b.email, 160), phone = cap(b.phone, 40), wa = cap(b.wa, 40);
    const first = cap(b.first, 80), last = cap(b.last, 80), biz = cap(b.biz, 120);
    const honeypot = !!(typeof b.company_website === 'string' && b.company_website.trim());

    /* -- validation (§5.1 server-side, §5.3 field rules) -------------------------------------
       Deliberately loose. Every rejection here is an enquiry that never reaches the business, so
       we reject only what is genuinely unusable: no way to reply at all, or an email address
       that cannot be one. Everything else is stored and let a human judge it. */
    if (!honeypot) {
      const reject = (code: string) => { log.warn('rejected', { error_code: code }); return fail(code, 400); };
      if (!first && !biz) return reject('missing_name');
      if (!email && !phone && !wa) return reject('missing_contact');
      if (email && !EMAIL_RE.test(email)) return reject('invalid_email');
    }

    /* -- idempotency (§5.2, FORM-02) --------------------------------------------------------
       The browser mints one key per filled-in form and reuses it across retries, so a double
       click or a "try again" after a network blip resolves to the same row. */
    const idem = cap(b.idem, 80);
    if (idem) {
      const { data: existing } = await sb.from('contact_submissions')
        .select('reference,notification_status').eq('idempotency_key', idem).maybeSingle();
      if (existing) {
        return json({ ok: true, reference: existing.reference, duplicate: true,
                      notification: existing.notification_status });
      }
    }

    /* -- honeypot (§5.5) --------------------------------------------------------------------
       A real visitor never fills this hidden field; bots do. We still STORE the row, flagged by
       its source, rather than discarding it. Browser autofill occasionally populates fields
       named like this one, and silently binning a genuine enquiry over an autofill quirk is
       precisely the failure this document exists to prevent. The owner simply is not emailed,
       so the containment is real without the data loss. */
    const row: Record<string, unknown> = {
      first_name: first, last_name: last, business: biz,
      email, phone, whatsapp: wa,
      industry: cap(b.industry, 120), system: cap(b.system, 80), message: cap(b.problem, 2000),
      source: honeypot ? 'website_form_honeypot' : 'website_form',
      user_agent: cap(req.headers.get('user-agent'), 300),
      idempotency_key: idem,
      ip_hash: await hashIp(req),
      // The privacy line shown beside the submit button, captured verbatim so we can show later
      // exactly what this person agreed to (§5.3, §18).
      consent_text: cap(b.consent, 500),
      consent_version: cap(b.consent_version, 40),
      consent_at: cap(b.consent, 500) ? new Date().toISOString() : null,
      notification_status: 'pending',
      correlation_id: cid,
    };

    const { data: saved, error } = await sb.from('contact_submissions')
      .insert(row).select('id,reference,created_at').single();

    // 23505 = unique violation: two tabs raced on the same idempotency key and the other won,
    // which is the outcome we wanted. Return its reference rather than erroring.
    if (error && (error as { code?: string }).code === '23505' && idem) {
      const { data: won } = await sb.from('contact_submissions')
        .select('reference,notification_status').eq('idempotency_key', idem).maybeSingle();
      if (won) return json({ ok: true, reference: won.reference, duplicate: true,
                             notification: won.notification_status });
    }
    if (error || !saved) {
      log.error('store_failed', { error_code: 'store_failed', detail: error?.message });
      return fail('store_failed', 502, error?.message);
    }
    log.info('stored', { reference: saved.reference, honeypot });

    // The enquiry is safe from here on. Nothing below is allowed to turn this into a failure.
    if (honeypot) return json({ ok: true, reference: saved.reference, notification: 'skipped' });

    /* -- owner notification (§5.4) ---------------------------------------------------------- */
    const to = env('LEAD_NOTIFICATION_TO');
    let notification: 'sent' | 'retry_required' | 'no_recipient' | 'no_email_provider' = 'retry_required';

    if (!to) notification = 'no_recipient';
    else if (!emailProvider()) notification = 'no_email_provider';
    else {
      const mail = contactAlert({
        reference: saved.reference, first, last, biz, email, phone, wa,
        industry: row.industry as string, system: row.system as string,
        message: row.message as string,
        receivedAt: new Date(saved.created_at).toUTCString(),
      }, env('PUBLIC_APP_URL') || '');

      try {
        const sent = await Promise.race([
          sendEmail(to, mail.subject, mail.html, mail.text, replyToAddress(email)),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('email_timeout')), EMAIL_TIMEOUT_MS)),
        ]);
        notification = 'sent';
        await sb.from('contact_submissions').update({
          notification_status: 'sent', notified_at: new Date().toISOString(),
          notification_provider_id: sent.id ?? null, notification_attempts: 1,
        }).eq('id', saved.id);
        await sb.from('notifications').insert({
          category: 'contact_form', channel: 'email', recipient: to, subject: mail.subject,
          status: 'sent', provider: sent.provider, provider_id: sent.id ?? null, attempts: 1,
          related_table: 'contact_submissions', related_id: saved.id, correlation_id: cid,
        });
        log.info('notified', { provider: sent.provider, provider_id: sent.id });
      } catch (e) {
        // The enquiry is already committed. A provider outage downgrades the notification,
        // never the enquiry (§5.1, FORM-05).
        const msg = String((e as Error)?.message || e).slice(0, 300);
        log.error('notify_failed', { error_code: 'notify_failed', detail: msg });
        notification = 'retry_required';
        await sb.from('contact_submissions').update({
          notification_status: 'retry_required', notification_error: msg, notification_attempts: 1,
        }).eq('id', saved.id);
        await sb.from('notifications').insert({
          category: 'contact_form', channel: 'email', recipient: to, subject: mail.subject,
          status: 'retry_required', attempts: 1, last_error: msg,
          related_table: 'contact_submissions', related_id: saved.id, correlation_id: cid,
        });
      }
    }

    return json({ ok: true, reference: saved.reference, notification, correlation_id: cid });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    log.error('contact_failed', { error_code: 'contact_failed', detail: msg });
    return fail('contact_failed', 502, msg);
  }
});
