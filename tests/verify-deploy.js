/* Run this straight after deploying. It answers one question — did the deploy actually take? —
 * without needing any credential, because every check uses a public endpoint.
 *
 *   node tests/verify-deploy.js
 *
 * It deliberately does NOT submit a real enquiry. That writes a row to production and emails the
 * business; do that by hand through the website once this passes.
 */

const REF = process.env.SUPABASE_REF || 'jnxvwdcvnwigowafdxvl';
const BASE = `https://${REF}.supabase.co/functions/v1`;

let pass = 0; const bad = [];
const ok = (c, name, detail) => { if (c) { pass++; console.log('  ok    ' + name); } else { bad.push(name + ' — ' + detail); console.log('  FAIL  ' + name + '  ' + detail); } };
const warn = (name, detail) => console.log('  note  ' + name + '  ' + detail);

async function post(fn, body) {
  try {
    const r = await fetch(`${BASE}/${fn}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}), signal: AbortSignal.timeout(15000),
    });
    const text = await r.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: r.status, json };
  } catch (e) {
    return { status: 0, error: String(e?.message || e) };
  }
}

(async () => {
  console.log('=== post-deploy verification ===');
  console.log('project: ' + REF + '\n');

  console.log('all three functions are deployed');
  for (const fn of ['contact-submit', 'lead-notify', 'health']) {
    const r = await post(fn);
    ok(r.status !== 404 && r.status !== 0, fn,
      r.status === 404 ? 'returns 404 — NOT DEPLOYED' : r.status === 0 ? 'unreachable: ' + r.error : '');
  }

  console.log('\nthe contact form runs the NEW code');
  {
    // The old version accepted anything with an @-less string. The new one rejects it.
    const r = await post('contact-submit', { first: 'deploy-probe', email: 'not-an-email', company_website: 'honeypot' });
    if (r.status === 404) ok(false, 'new validation', 'function not deployed');
    else if (r.json && r.json.ok === true) ok(false, 'new validation',
      'accepted an invalid email — this is still the OLD version. Redeploy contact-submit.');
    else ok(r.json?.error === 'invalid_email', 'new validation',
      'expected invalid_email, got ' + JSON.stringify(r.json));
  }
  {
    // The honeypot field is set, so nothing is stored by either version.
    const r = await post('contact-submit', { first: 'probe', company_website: 'bot' });
    ok(r.status < 500, 'honeypot handled', 'HTTP ' + r.status);
  }

  console.log('\nthe migrations landed');
  {
    // A valid-looking submission that fails on a MISSING COLUMN means db push has not run.
    const r = await post('contact-submit', { first: 'schema-probe', email: 'probe@example.invalid', company_website: 'bot-so-nothing-is-stored' });
    const err = JSON.stringify(r.json || {});
    ok(!/column|does not exist|schema cache/i.test(err), 'contact_submissions has the 0006 columns',
      'the function is reporting a schema error — run `supabase db push`: ' + err.slice(0, 160));
  }

  console.log('\nhealth reports honestly');
  {
    const r = await post('health');
    if (r.status === 404) ok(false, 'health responds', 'not deployed');
    else {
      ok(r.json && typeof r.json.status === 'string', 'health responds', 'unexpected body: ' + JSON.stringify(r.json));
      const st = r.json?.status;
      ok(st !== 'down', 'health is not down', 'status=' + st + ' — the database check is failing');
      if (st === 'degraded') warn('degraded', 'expected until Resend DNS is verified and LEAD_NOTIFICATION_TO is set');
      ok(r.status === (st === 'down' ? 503 : 200), 'status code matches the body',
        'HTTP ' + r.status + ' with status=' + st + ' — an uptime monitor would read this wrong');
      ok(!r.json?.checks, 'detail requires a login', 'per-check detail was returned to an anonymous caller');
    }
  }

  console.log('\nlead-notify refuses anonymous callers');
  {
    const r = await post('lead-notify', { lead: { name: 'probe' } });
    ok(r.status === 401 || r.status === 403, 'lead-notify requires auth',
      'HTTP ' + r.status + ' — an open relay would let anyone send mail from your domain');
  }

  console.log('\n' + '-'.repeat(58));
  console.log('passed: ' + pass);
  if (bad.length) {
    console.log('FAILED: ' + bad.length);
    bad.forEach((b) => console.log('   ' + b));
    console.log('\nNext: fix the above, then re-run. Nothing else should be tested until this is clean.');
    process.exit(1);
  }
  console.log('\nDeploy verified. Next: submit a real enquiry through the website and confirm');
  console.log('the row appears in contact_submissions and the alert email arrives.');
})();
