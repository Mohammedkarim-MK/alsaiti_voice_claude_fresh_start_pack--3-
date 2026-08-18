// POST /functions/v1/events-consume    — the outbox consumer.
//
// Claims a batch of platform_events, dispatches each to a handler, acknowledges the ones that
// succeed and fails the ones that do not, with backoff. Invoke it on a schedule; it processes
// what is waiting and returns.
//
// Runs as a function rather than a long-lived worker on purpose: there is no always-on host yet,
// and a scheduled function needs none. The claim/ack contract is identical either way, so moving
// to a persistent worker later is a deployment change, not a rewrite.
//
// AUTH: verify_jwt = false, because the caller is a scheduler and has no user session. A shared
// secret is required instead — without EVENTS_CONSUMER_SECRET set, the function refuses to run
// at all rather than defaulting to open.

import { preflight, json, fail } from '../_shared/http.ts';
import { serviceClient } from '../_shared/store.ts';
import { correlationId, logger, type Log } from '../_shared/log.ts';
import { sendEmail, leadAlert, contactAlert, emailProvider, replyToAddress } from '../_shared/email.ts';

function env(k: string): string | undefined {
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).Deno?.env.get(k) || undefined;
}

const BATCH = Number(env('EVENTS_BATCH') || 20);

interface PlatformEvent {
  event_id: string;
  event_type: string;
  workspace_id: string | null;
  payload: Record<string, unknown>;
  correlation_id: string | null;
  attempts: number;
}

/** Thrown for a failure that retrying cannot fix — a malformed payload, an unusable address. */
class Permanent extends Error {}

/**
 * Thrown when the handler cannot even start because the system is not finished being set up —
 * an email provider with no API key, an alert recipient nobody has chosen yet.
 *
 * This is deliberately NOT Permanent. A missing environment variable says nothing about the event;
 * it says something about the deployment, and it stops being true the moment an operator pastes a
 * key in. Treating it as permanent dead-lettered real leads on their first attempt, so the business
 * was never told about enquiries that had been saved perfectly well.
 *
 * It is not retryable either: claim_events charges an attempt per claim, so the event would run out
 * of attempts and dead-letter within hours — usually before DNS verification even completes.
 * defer_event puts it back with its attempt budget intact, and the queue-age alarm in the health
 * endpoint is what stops a deferral lasting for ever unnoticed.
 */
class NotConfigured extends Error {}

/* ---------------------------------------------------------------- handlers ---- */

/**
 * Tell the business about a lead.
 *
 * This used to be a fire-and-forget call from the browser: close the tab at the wrong moment and
 * a successfully saved enquiry was never announced. Here it is durable — a failure retries with
 * backoff, and a permanent failure becomes a visible dead-letter rather than silence.
 */
async function handleLeadCreated(ev: PlatformEvent, log: Log): Promise<void> {
  const to = env('LEAD_NOTIFICATION_TO');
  if (!to) throw new NotConfigured('no_recipient: LEAD_NOTIFICATION_TO is not set');
  if (!emailProvider()) throw new NotConfigured('no_email_provider: set RESEND_API_KEY');

  const p = ev.payload as Record<string, string | number | undefined>;
  const mail = leadAlert({
    name: p.name as string, service: p.service as string, urgency: p.urgency as string,
    source: p.source as string, phone: p.phone as string, email: p.email as string,
    summary: p.summary as string, score: p.score as number,
  }, env('PUBLIC_APP_URL') || '');

  const sent = await sendEmail(to, mail.subject, mail.html, mail.text,
                               replyToAddress(p.email as string));

  // Record what was sent, so "was the business told?" is answerable without reading a mail log.
  await serviceClient().from('notifications').insert({
    workspace_id: ev.workspace_id,
    channel: 'email',
    category: String(p.urgency).toLowerCase() === 'high' ? 'urgent_lead' : 'new_lead',
    recipient: to, subject: mail.subject, status: 'sent',
    provider: sent.provider, provider_id: sent.id ?? null, attempts: ev.attempts,
    related_table: 'leads', related_id: (p.lead_id as string) ?? null,
    correlation_id: ev.correlation_id,
  });
  log.info('lead_alert_sent', { provider: sent.provider, provider_id: sent.id });
}

/** A status move is worth an internal note, not an email. Recorded on the lead's timeline. */
async function handleLeadStatus(ev: PlatformEvent, log: Log): Promise<void> {
  const p = ev.payload as Record<string, string>;
  await serviceClient().from('lead_activities').insert({
    workspace_id: ev.workspace_id, lead_id: p.lead_id,
    kind: 'status_changed', actor_label: 'system',
    detail: { from: p.from_status, to: p.to_status },
    correlation_id: ev.correlation_id,
  });
  log.info('status_recorded', { status: p.to_status });
}

/**
 * Tell the business about a website enquiry.
 *
 * contact-submit sends this email synchronously, so on a configured deployment this handler
 * almost never does the sending — it re-reads the row, sees notification_status 'sent', and
 * acknowledges. It exists for the case that was silently broken: an enquiry captured while no
 * email provider was configured was stored with a reference and then forgotten. Nothing retried
 * it, so pasting in an API key later did not deliver it. The visitor was thanked, the row looked
 * perfect, and the owner was never told.
 *
 * Re-reading rather than trusting the payload is what makes the two paths safe together: the
 * event carries only an id, so whichever path gets there second sees the first one's result.
 */
async function handleContactSubmitted(ev: PlatformEvent, log: Log): Promise<void> {
  const sb = serviceClient();
  const id = (ev.payload as Record<string, unknown>).submission_id as string;
  if (!id) throw new Permanent('contact.submitted with no submission_id');

  const { data: row } = await sb.from('contact_submissions')
    .select('id,reference,first_name,last_name,business,email,phone,whatsapp,industry,' +
            'system,message,created_at,notification_status,notification_attempts')
    .eq('id', id).maybeSingle();

  // Retention removed it. That is a completed lifecycle, not a failure to retry.
  if (!row) { log.info('submission_gone', { submission_id: id }); return; }

  if (row.notification_status === 'sent') {
    log.info('already_notified', { reference: row.reference });
    return;
  }

  const to = env('LEAD_NOTIFICATION_TO');
  if (!to) throw new NotConfigured('LEAD_NOTIFICATION_TO is not set');
  if (!emailProvider()) throw new NotConfigured('no email provider configured');

  const mail = contactAlert({
    reference: row.reference as string,
    first: row.first_name as string, last: row.last_name as string, biz: row.business as string,
    email: row.email as string, phone: row.phone as string, wa: row.whatsapp as string,
    industry: row.industry as string, system: row.system as string,
    message: row.message as string,
    receivedAt: new Date(row.created_at as string).toUTCString(),
  }, env('PUBLIC_APP_URL') || '');

  const sent = await sendEmail(to, mail.subject, mail.html, mail.text,
                               replyToAddress(row.email as string));

  await sb.from('contact_submissions').update({
    notification_status: 'sent',
    notified_at: new Date().toISOString(),
    notification_provider_id: sent.id ?? null,
    notification_attempts: ((row.notification_attempts as number) ?? 0) + 1,
    notification_error: null,
  }).eq('id', row.id);

  await sb.from('notifications').insert({
    workspace_id: ev.workspace_id,
    channel: 'email', category: 'contact_form',
    recipient: to, subject: mail.subject, status: 'sent',
    provider: sent.provider, provider_id: sent.id ?? null, attempts: ev.attempts,
    related_table: 'contact_submissions', related_id: row.id,
    correlation_id: ev.correlation_id,
  });
  log.info('contact_alert_sent', { reference: row.reference, provider: sent.provider });
}

/**
 * Dispatch table. An event type absent from here is NOT an error — it means the feature that
 * consumes it has not been built yet. Those are acknowledged and counted separately, so the queue
 * does not silently fill with work nobody will ever do, and the count stays visible.
 */
const HANDLERS: Record<string, (ev: PlatformEvent, log: Log) => Promise<void>> = {
  'lead.created': handleLeadCreated,
  'contact.submitted': handleContactSubmitted,
  'lead.qualified': handleLeadCreated,
  'lead.status_changed': handleLeadStatus,
};

/* ---------------------------------------------------------------- entry ---- */

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  // Fail closed. A consumer that anyone can trigger is a way to drain a queue or force sends.
  const secret = env('EVENTS_CONSUMER_SECRET');
  if (!secret) return fail('consumer_not_configured', 503);
  if (req.headers.get('x-consumer-secret') !== secret) return fail('unauthorised', 401);

  const cid = correlationId(req);
  const log = logger('events-consume', cid);
  const sb = serviceClient();

  try {
    // Recover anything a previous invocation claimed and never acknowledged — a timeout, a cold
    // stop mid-batch. Without this those rows sit in 'processing' forever and the queue quietly
    // drains to nothing.
    const { data: requeued } = await sb.rpc('requeue_stalled_events', { p_older_than: '5 minutes' });
    if (requeued) log.warn('requeued_stalled', { count: requeued });

    const { data: claimed, error } = await sb.rpc('claim_events', {
      p_limit: BATCH, p_worker: 'events-consume',
    });
    if (error) throw new Error('claim_failed: ' + error.message);

    const events: PlatformEvent[] = claimed || [];
    let done = 0, failed = 0, dead = 0, unhandled = 0, deferred = 0;

    for (const ev of events) {
      const evLog = logger('events-consume', ev.correlation_id || cid);
      const handler = HANDLERS[ev.event_type];

      if (!handler) {
        // Acknowledge, but count it. The event was delivered nowhere because nothing consumes it
        // yet — that is a roadmap fact, not a failure, and it should be visible either way.
        await sb.rpc('ack_event', { p_event: ev.event_id });
        unhandled++;
        evLog.info('no_handler', { event_type: ev.event_type });
        continue;
      }

      try {
        await handler(ev, evLog);
        await sb.rpc('ack_event', { p_event: ev.event_id });
        done++;
      } catch (e) {
        const msg = String((e as Error)?.message || e).slice(0, 500);

        if (e instanceof NotConfigured) {
          // Hold the event, do not spend an attempt on it, and say so loudly — this is an
          // operator's to-do item, not an application error.
          await sb.rpc('defer_event', { p_event: ev.event_id, p_reason: msg });
          deferred++;
          evLog.warn('handler_not_configured', { event_type: ev.event_type, error_code: msg });
          continue;
        }

        const permanent = e instanceof Permanent;
        await sb.rpc('fail_event', {
          p_event: ev.event_id, p_error: msg, p_retryable: !permanent,
        });
        if (permanent) { dead++; evLog.error('handler_permanent', { event_type: ev.event_type, error_code: msg }); }
        else { failed++; evLog.warn('handler_retryable', { event_type: ev.event_type, error_code: msg, attempt: ev.attempts }); }
      }
    }

    const { data: stats } = await sb.rpc('event_queue_stats');
    const q = Array.isArray(stats) ? stats[0] : stats;

    log.info('batch_complete', { claimed: events.length, done, failed, dead, unhandled, deferred });
    return json({
      ok: true, claimed: events.length, done, failed, dead, unhandled, deferred,
      queue: q || null, correlation_id: cid,
    });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    log.error('consumer_failed', { error_code: 'consumer_failed', detail: msg });
    return fail('consumer_failed', 502, msg);
  }
});
