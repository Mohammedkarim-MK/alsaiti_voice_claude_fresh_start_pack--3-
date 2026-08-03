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
    /* Ask the database directly.
       The previous version of this check posted to contact-submit with the honeypot field set
       and looked for a schema error in the reply. That was a FALSE PASS: the honeypot makes the
       function return early without ever touching the table, so the check reported the 0006
       columns present while they demonstrably did not exist. Never infer schema state from an
       endpoint that can short-circuit before it writes. */
    const ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_fTj566JdyWyCA58y2AU8rQ_l-SmkBXU';
    const probe = async (path) => {
      try {
        const r = await fetch(`https://${REF}.supabase.co/rest/v1/${path}`, {
          headers: { apikey: ANON }, signal: AbortSignal.timeout(15000),
        });
        const j = await r.json().catch(() => null);
        // 42703 = column missing, PGRST205 = table missing. An array (even empty) means it exists.
        if (Array.isArray(j)) return { exists: true };
        return { exists: false, why: (j && (j.message || j.code)) || ('HTTP ' + r.status) };
      } catch (e) { return { exists: false, why: String(e?.message || e) }; }
    };

    for (const [what, path, migration] of [
      ['contact_submissions.reference', 'contact_submissions?select=reference&limit=1', '0006'],
      ['contact_submissions.notification_status', 'contact_submissions?select=notification_status&limit=1', '0006'],
      ['lead_activities table', 'lead_activities?select=id&limit=1', '0006'],
      ['notifications table', 'notifications?select=id&limit=1', '0006'],
      ['audit_logs table', 'audit_logs?select=id&limit=1', '0006'],
      ['contact_submissions.correlation_id', 'contact_submissions?select=correlation_id&limit=1', '0007'],
      ['conversations table', 'conversations?select=id&limit=1', '0007'],
    ]) {
      const r = await probe(path);
      ok(r.exists, what, `missing — migration ${migration} has not been applied. Run \`supabase db push\`.`);
    }
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
