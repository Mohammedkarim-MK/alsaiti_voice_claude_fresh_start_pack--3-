// GET /functions/v1/health   — handoff §17.1, gate MON-01.
//
// Public (verify_jwt = false) so an external uptime monitor can watch it without a credential.
// That is the whole point: the thing that tells you the lead pipeline is broken must not itself
// need the lead pipeline to be working.
//
// The status code is the signal. 200 = fine, 503 = something is wrong. Uptime services alert on
// non-2xx, so a degraded backend pages you without any extra configuration.
//
// Anonymous callers get coarse status only. Detail — counts, error strings — requires a JWT,
// because "which provider is unconfigured" is a map of where to attack.

import { preflight, json } from '../_shared/http.ts';
import { serviceClient, userClient } from '../_shared/store.ts';
import { emailProvider } from '../_shared/email.ts';
import { correlationId, logger } from '../_shared/log.ts';
import { enforceLimit, ipBucket } from '../_shared/ratelimit.ts';

function env(k: string): string | undefined {
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).Deno?.env.get(k) || undefined;
}

type State = 'ok' | 'degraded' | 'down' | 'not_configured';
interface Check { name: string; state: State; detail?: string; count?: number }

/** Any check being down makes the whole thing down; degraded is degraded. */
function overall(checks: Check[]): State {
  if (checks.some((c) => c.state === 'down')) return 'down';
  if (checks.some((c) => c.state === 'degraded')) return 'degraded';
  return 'ok';
}

/* Generous, because this endpoint exists to be polled: an uptime monitor at 30-second intervals
   uses 2 of these, and a status page a few more. It is not here to stop legitimate monitoring —
   it is here because every health check runs a real database query and counts rows, so an
   unmetered public endpoint is a cheap way to make someone else's database do work. */
const LIMIT = { limit: 60, windowSeconds: 60 };  // per IP

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;

  const limited = await enforceLimit(ipBucket(req, 'health'), LIMIT);
  if (limited) return limited;

  const cid = correlationId(req);
  const log = logger('health', cid);
  const checks: Check[] = [];

  /* ---- database ---- */
  const t0 = Date.now();
  try {
    const { error } = await serviceClient()
      .from('contact_submissions').select('id', { count: 'exact', head: true }).limit(1);
    if (error) throw new Error(error.message);
    checks.push({ name: 'database', state: 'ok', detail: (Date.now() - t0) + 'ms' });
  } catch (e) {
    checks.push({ name: 'database', state: 'down', detail: String((e as Error)?.message || e).slice(0, 200) });
  }

  /* ---- can we actually alert anyone about a new lead? ---- */
  const provider = emailProvider();
  const recipient = env('LEAD_NOTIFICATION_TO');
  if (!provider || !recipient) {
    // Not an outage, but every enquiry from now on lands silently. That is worth paging for.
    checks.push({
      name: 'lead_alerts', state: 'degraded',
      detail: !provider ? 'no email provider configured' : 'LEAD_NOTIFICATION_TO not set',
    });
  } else {
    checks.push({ name: 'lead_alerts', state: 'ok', detail: provider });
  }

  /* ---- enquiries saved but never announced ---- */
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count, error } = await serviceClient()
      .from('contact_submissions')
      .select('id', { count: 'exact', head: true })
      .neq('notification_status', 'sent')
      // Honeypot rows are stored with status 'pending' and deliberately never notified, so
      // without this filter the first bot submission would mark the system degraded forever —
      // a 503, a paged engineer, and nothing actually wrong. On a public form that is days away.
      .eq('source', 'website_form')
      .gte('created_at', since);
    if (error) throw new Error(error.message);
    const n = count || 0;
    checks.push({
      name: 'notification_backlog',
      state: n === 0 ? 'ok' : 'degraded',
      count: n,
      detail: n ? n + ' enquiry(s) in the last 24h with no alert delivered' : undefined,
    });
  } catch (e) {
    checks.push({ name: 'notification_backlog', state: 'degraded', detail: String((e as Error)?.message || e).slice(0, 200) });
  }

  /* ---- the outbox ----
     A queue that stops draining is the failure mode that looks like nothing at all: leads keep
     saving, the dashboard keeps working, and nobody is told about any of them. §14.2 asks
     specifically for dead-letter depth and processing lag. */
  try {
    const { data, error } = await serviceClient().rpc('event_queue_stats');
    if (error) throw new Error(error.message);
    const q = (Array.isArray(data) ? data[0] : data) || {};
    const dead = Number(q.dead || 0);
    const lag = Number(q.oldest_pending_seconds || 0);
    // Ten minutes of lag means the scheduler has stopped, not that the queue is busy.
    const state: State = dead > 0 ? 'degraded' : lag > 600 ? 'degraded' : 'ok';
    checks.push({
      name: 'event_queue', state, count: Number(q.pending || 0),
      detail: dead > 0 ? dead + ' event(s) dead-lettered and needing attention'
            : lag > 600 ? 'oldest unprocessed event is ' + Math.round(lag / 60) + ' minutes old'
            : undefined,
    });
  } catch (e) {
    checks.push({ name: 'event_queue', state: 'degraded', detail: String((e as Error)?.message || e).slice(0, 200) });
  }

  /* ---- providers: configured or not. Absence is honest, not a failure. ---- */
  for (const [name, keys] of [
    ['tts', ['ELEVENLABS_API_KEY', 'OPENAI_API_KEY']],
    ['hubspot', ['HUBSPOT_CLIENT_ID']],
    ['telnyx', ['TELNYX_API_KEY']],
  ] as [string, string[]][]) {
    checks.push({ name, state: keys.some((k) => env(k)) ? 'ok' : 'not_configured' });
  }

  const state = overall(checks);
  const status = state === 'down' ? 503 : 200;
  log[state === 'ok' ? 'info' : 'warn']('health', { status: state, failing: checks.filter((c) => c.state === 'down' || c.state === 'degraded').map((c) => c.name) });

  /* Detail only for a signed-in caller. */
  let authorised = false;
  try {
    const { data } = await userClient(req).auth.getUser();
    authorised = !!data?.user;
  } catch { /* anonymous */ }

  if (!authorised) {
    return json({ status: state, correlation_id: cid }, status, { 'Cache-Control': 'no-store' });
  }
  return json({ status: state, correlation_id: cid, checks, at: new Date().toISOString() },
    status, { 'Cache-Control': 'no-store' });
});
