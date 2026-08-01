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

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
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
