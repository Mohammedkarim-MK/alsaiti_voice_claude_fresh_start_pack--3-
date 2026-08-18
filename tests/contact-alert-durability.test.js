/* An enquiry captured before the email provider exists must still reach the owner.
 *
 * contact-submit sends its alert synchronously. With no provider configured it stored the
 * enquiry, issued a reference, set notification_status 'pending' — and stopped. Only two cron
 * jobs exist (events-consume, retention-sweep) and neither reads contact_submissions, so nothing
 * ever retried it. Pasting in RESEND_API_KEY later would NOT have delivered anything captured
 * before that moment.
 *
 * Nothing about that was visible: the visitor got a reference and a thank-you, the row was
 * present and correct, the dashboard showed it, and the owner was simply never told. For a
 * lead-generation product that is the one failure the whole system exists to prevent.
 *
 * The fix puts contact submissions on the outbox the leads already use. This suite holds the
 * three properties that make it safe, because each one has a way of quietly going wrong:
 *   1. every real submission is queued, and honeypot rows are not;
 *   2. the consumer knows what to do with the event (an unregistered type is ACKNOWLEDGED, so a
 *      missing handler would silently bin the alert — that is exactly what happened when I first
 *      queued these before deploying);
 *   3. a missing provider DEFERS the event rather than failing it, so it keeps its attempt
 *      budget and is still waiting when the key finally lands.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const SQL = fs.readFileSync(path.join(REPO, 'supabase', 'migrations', '0022_contact_alert_durability.sql'), 'utf8');
const CONSUMER = fs.readFileSync(path.join(REPO, 'supabase', 'functions', 'events-consume', 'index.ts'), 'utf8');
const SUBMIT = fs.readFileSync(path.join(REPO, 'supabase', 'functions', 'contact-submit', 'index.ts'), 'utf8');

let pass = 0; const bad = [];
const ok = (c, name, detail) => {
  if (c) { pass++; console.log('  ok   ' + name); }
  else { bad.push(name + ' — ' + detail); console.log('  FAIL ' + name + ' — ' + detail); }
};

console.log('=== contact alerts survive a missing email provider ===\n');

console.log('every real submission is queued');
{
  ok(/create trigger contact_submissions_emit\s+after insert on public\.contact_submissions/.test(SQL),
    'a trigger fires on insert', 'submissions would never reach the queue');
  ok(/emit_event\(\s*'contact\.submitted'/.test(SQL),
    'it emits contact.submitted', '');
  ok(/'contact\.submitted:' \|\| new\.id::text/.test(SQL),
    'one event per submission, whatever retries run',
    'no idempotency key — a retry would email the owner twice');

  // The trigger must be on the TABLE, not inside contact-submit, or a submission written by any
  // other path would silently skip the queue.
  ok(!/platform_events|emit_event/.test(SUBMIT),
    'contact-submit does not queue it itself',
    'queuing in the function means any other write path skips the alert entirely');
}

console.log('\nhoneypot rows are stored but never alerted on');
{
  ok(/website_form_honeypot/.test(SQL), 'the trigger knows about the honeypot flag', '');
  ok(/if new\.source = 'website_form_honeypot' then\s+return new;/.test(SQL),
    'honeypot submissions are not queued',
    'bot traffic would email the owner');
  ok(/source is distinct from 'website_form_honeypot'/.test(SQL),
    'the backfill skips them too', 'backfilling spam');
}

console.log('\nthe consumer actually handles the event');
{
  /* This is the assertion that would have caught my own mistake. An event type absent from the
     dispatch table is ACKNOWLEDGED, not retried — so queuing contact.submitted against a
     consumer that did not know it meant the alerts were marked done and thrown away. */
  ok(/'contact\.submitted':\s*handleContactSubmitted/.test(CONSUMER),
    'contact.submitted is registered in the dispatch table',
    'an unregistered type is acknowledged and discarded — the alert would vanish');
  ok(/async function handleContactSubmitted/.test(CONSUMER), 'the handler exists', '');
  ok(/import \{[^}]*contactAlert[^}]*\} from '\.\.\/_shared\/email\.ts'/.test(CONSUMER),
    'it uses the same email template as the form', 'a second, drifting template');
}

console.log('\nno duplicate emails when both paths run');
{
  ok(/notification_status === 'sent'/.test(CONSUMER),
    'the handler stops if the synchronous send already won',
    'a configured deployment would send two emails per enquiry');
  ok(/from\('contact_submissions'\)[\s\S]{0,220}\.eq\('id', id\)/.test(CONSUMER),
    'it re-reads the row rather than trusting the payload',
    'a payload snapshot cannot know whether the other path has since succeeded');
  ok(/jsonb_build_object\('submission_id'/.test(SQL) && !/'email'|'phone'|'message'/.test(
       (/jsonb_build_object\([^)]*\)/.exec(SQL) || [''])[0]),
    'only an id travels in the event payload',
    'personal data copied into the event log, and a stale snapshot');
}

console.log('\na missing provider defers, it does not fail');
{
  ok(/throw new NotConfigured\('no email provider configured'\)/.test(CONSUMER),
    'no provider raises NotConfigured', 'the event would burn attempts and dead-letter');
  ok(/throw new NotConfigured\('LEAD_NOTIFICATION_TO is not set'\)/.test(CONSUMER),
    'no recipient raises NotConfigured', '');

  // NotConfigured is routed to defer_event, which does not spend an attempt.
  ok(/e instanceof NotConfigured[\s\S]{0,240}defer_event/.test(CONSUMER),
    'NotConfigured is deferred, keeping its attempt budget',
    'the alert would run out of attempts before DNS verification even finished');

  // A vanished row is a completed lifecycle, not something to retry for ever.
  ok(/if \(!row\)[\s\S]{0,120}submission_gone[\s\S]{0,40}return;/.test(CONSUMER),
    'a row removed by retention ends the event cleanly',
    'the queue would retry a deleted enquiry indefinitely');
}

console.log('\nthe enquiry is never risked for the sake of the alert');
{
  ok(/The enquiry is safe from here on/.test(SUBMIT),
    'storing the enquiry is committed before any alerting',
    'a provider outage could lose the enquiry itself');
  ok(/notification: 'sent' \| 'retry_required' \| 'no_recipient' \| 'no_email_provider'/.test(SUBMIT),
    'the response states the notification outcome truthfully',
    'the form would claim an alert was sent when it was not');
}

console.log('\npassed: ' + pass);
if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1); }
