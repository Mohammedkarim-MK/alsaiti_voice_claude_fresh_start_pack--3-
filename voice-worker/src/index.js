/* Entry point — handoff §11.3.
 *
 * Two things run here: an HTTP health endpoint so the platform can restart us when we stop being
 * useful, and the LiveKit agent itself. The health server starts FIRST and stays up even when
 * the agent is failing, because a health check that dies with the thing it monitors reports
 * nothing at the exact moment you need it most.
 */

import http from 'node:http';

const PORT = Number(process.env.PORT || 8080);
const started = Date.now();

const state = {
  agent: 'starting',        // starting | connected | degraded | failed
  lastError: null,
  callsHandled: 0,
  callsFailed: 0,
  lastCallAt: null,
};
export function mark(patch) { Object.assign(state, patch); }
/** Increment a counter. Separate from mark() so a counter can never be assigned by accident. */
export function bump(key, by = 1) { state[key] = (state[key] || 0) + by; }

const log = (level, event, fields) => console[level === 'error' ? 'error' : 'log'](
  JSON.stringify(Object.assign({ level, event, at: new Date().toISOString() }, fields || {})));

/* ---------------------------------------------------------------- health ---- */
const health = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    // 'starting' is deliberately healthy: a platform must not kill us during boot.
    const ok = state.agent === 'starting' || state.agent === 'connected';
    const body = {
      status: ok ? 'ok' : 'down',
      agent: state.agent,
      uptime_s: Math.round((Date.now() - started) / 1000),
      calls_handled: state.callsHandled,
      calls_failed: state.callsFailed,
      last_call_at: state.lastCallAt,
      // The error string is safe to expose: no secret ever reaches it.
      last_error: state.lastError,
    };
    res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end('{"error":"not_found"}');
});
health.listen(PORT, () => log('info', 'health_listening', { port: PORT }));

/* ---------------------------------------------------------------- agent ---- */
/* Loaded dynamically so a missing or misconfigured LiveKit SDK leaves the health endpoint alive
   and reporting 'failed' — which is what tells you something is wrong — rather than crashing the
   container into a silent restart loop. */
const REQUIRED = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'SUPABASE_URL'];
const missing = REQUIRED.filter((k) => !process.env[k]);

if (missing.length) {
  state.agent = 'failed';
  state.lastError = 'missing configuration: ' + missing.join(', ');
  log('error', 'agent_not_started', { missing });
} else {
  import('./agent.js')
    .then((m) => m.start({ mark, bump, log }))
    .catch((e) => {
      state.agent = 'failed';
      state.lastError = String(e?.message || e);
      log('error', 'agent_start_failed', { error: state.lastError });
    });
}

/* ---------------------------------------------------------------- shutdown ---- */
/* Finish the call in progress before exiting. Hanging up on a customer mid-sentence because a
   deploy went out is a bad way to lose one. */
let closing = false;
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    if (closing) process.exit(0);
    closing = true;
    log('info', 'shutting_down', { signal: sig });
    state.agent = 'degraded';                 // stop taking new calls; health goes 503
    health.close();
    setTimeout(() => process.exit(0), Number(process.env.DRAIN_MS || 15000)).unref();
  });
}

process.on('unhandledRejection', (e) => {
  state.lastError = String(e?.message || e);
  log('error', 'unhandled_rejection', { error: state.lastError });
});
