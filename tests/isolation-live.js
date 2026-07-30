/* SEC-03 + AUTH-01 — tenant isolation, against the REAL project.
 *
 * This is the one test that cannot be faked. RLS is written into the schema and reviewed, but
 * "reviewed" and "proven" are different words, and §19 marks this Mandatory. It stays out of CI
 * because it needs two genuine accounts and it writes to a live database.
 *
 * Run it once after deploying, with two accounts you created in the Supabase dashboard:
 *
 *   SUPABASE_URL=https://jnxvwdcvnwigowafdxvl.supabase.co \
 *   SUPABASE_ANON_KEY=sb_publishable_... \
 *   A_EMAIL=owner-a@example.com A_PASS=... \
 *   B_EMAIL=owner-b@example.com B_PASS=... \
 *   node tests/isolation-live.js
 *
 * It creates one lead in A's workspace, tries every way B might reach it, then deletes it.
 * Nothing is left behind if it passes.
 */

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const A = { email: process.env.A_EMAIL, pass: process.env.A_PASS };
const B = { email: process.env.B_EMAIL, pass: process.env.B_PASS };

if (!URL || !ANON || !A.email || !A.pass || !B.email || !B.pass) {
  console.error('Missing configuration. Required: SUPABASE_URL, SUPABASE_ANON_KEY,');
  console.error('A_EMAIL, A_PASS, B_EMAIL, B_PASS');
  console.error('\nCreate the two accounts in Supabase → Authentication → Users first.');
  process.exit(2);
}

let pass = 0; const bad = [];
const ok = (c, id, what) => { if (c) { pass++; console.log('  ok   ' + id); } else { bad.push(id + ': ' + what); console.log('  FAIL ' + id + ' — ' + what); } };

const base = URL.replace(/\/+$/, '');

async function signIn(who) {
  const r = await fetch(base + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: who.email, password: who.pass }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`sign-in failed for ${who.email}: ${j.error_description || j.msg || r.status}`);
  return j.access_token;
}

async function rest(token, path, opts = {}) {
  const r = await fetch(base + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({ apikey: ANON, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      opts.prefer ? { Prefer: opts.prefer } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: r.status, ok: r.ok, json };
}

(async () => {
  console.log('=== SEC-03 tenant isolation, against the live project ===\n');

  const tokenA = await signIn(A);
  const tokenB = await signIn(B);
  console.log('  signed in as both accounts\n');

  const wsA = await rest(tokenA, 'workspaces?select=id&limit=1');
  const wsB = await rest(tokenB, 'workspaces?select=id&limit=1');
  const idA = wsA.json?.[0]?.id, idB = wsB.json?.[0]?.id;
  ok(!!idA && !!idB, 'setup', 'one of the accounts has no workspace');
  ok(idA !== idB, 'setup', 'both accounts resolved to the SAME workspace — they are not separate tenants');
  if (!idA || !idB || idA === idB) { console.log('\ncannot continue'); process.exit(1); }

  /* ---- A creates a lead ---- */
  const marker = 'ISOLATION-PROBE-' + Date.now();
  const made = await rest(tokenA, 'leads', {
    method: 'POST', prefer: 'return=representation',
    body: { workspace_id: idA, name: marker, service: 'isolation test', status: 'New', source: 'Manual import', score: 1 },
  });
  ok(made.ok && made.json?.[0]?.id, 'A can create in its own workspace', 'HTTP ' + made.status);
  const leadId = made.json?.[0]?.id;
  if (!leadId) { console.log('\ncannot continue'); process.exit(1); }

  try {
    /* ---- the actual test: can B reach it, by any route? ---- */
    const bList = await rest(tokenB, 'leads?select=*');
    ok(!(bList.json || []).some((l) => l.id === leadId), 'B cannot LIST A\'s lead',
      "B's lead list contains A's row");

    const bDirect = await rest(tokenB, 'leads?select=*&id=eq.' + leadId);
    ok(!(bDirect.json || []).length, 'B cannot READ A\'s lead by id',
      'fetching the row directly returned it');

    const bFilter = await rest(tokenB, 'leads?select=*&workspace_id=eq.' + idA);
    ok(!(bFilter.json || []).length, 'B cannot read A\'s workspace by asking for it',
      'filtering by A\'s workspace_id returned rows — the client can choose its own tenant');

    const bUpdate = await rest(tokenB, 'leads?id=eq.' + leadId, { method: 'PATCH', body: { status: 'Won' } });
    const after = await rest(tokenA, 'leads?select=status&id=eq.' + leadId);
    ok(after.json?.[0]?.status === 'New', 'B cannot UPDATE A\'s lead',
      'B changed the status to ' + after.json?.[0]?.status);

    const bInsert = await rest(tokenB, 'leads', {
      method: 'POST', body: { workspace_id: idA, name: 'INJECTED BY B', status: 'New', source: 'API', score: 1 },
    });
    ok(!bInsert.ok, 'B cannot INSERT into A\'s workspace', 'B planted a row in A\'s workspace (HTTP ' + bInsert.status + ')');

    const bDelete = await rest(tokenB, 'leads?id=eq.' + leadId, { method: 'DELETE' });
    const stillThere = await rest(tokenA, 'leads?select=id&id=eq.' + leadId);
    ok((stillThere.json || []).length === 1, 'B cannot DELETE A\'s lead', "B destroyed A's data");

    /* ---- anonymous must see nothing at all ---- */
    const anon = await fetch(base + '/rest/v1/leads?select=*', { headers: { apikey: ANON } });
    const anonRows = await anon.json().catch(() => null);
    ok(!Array.isArray(anonRows) || anonRows.length === 0, 'anonymous callers see no leads',
      'the anon key alone returned ' + (anonRows?.length) + ' rows');

    /* ---- the same, for the other tables that carry customer data ---- */
    for (const table of ['lead_activities', 'notifications', 'audit_logs', 'crm_connections', 'call_sessions']) {
      const r = await rest(tokenB, table + '?select=*&workspace_id=eq.' + idA);
      ok(!(r.json || []).length, 'B cannot read A\'s ' + table, 'returned ' + (r.json || []).length + ' rows');
    }
  } finally {
    await rest(tokenA, 'leads?id=eq.' + leadId, { method: 'DELETE' });
    const gone = await rest(tokenA, 'leads?select=id&id=eq.' + leadId);
    console.log('\n  cleanup: probe lead ' + ((gone.json || []).length ? 'STILL PRESENT — delete ' + leadId + ' by hand' : 'removed'));
  }

  console.log('\npassed: ' + pass);
  if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1); }
  console.log('SEC-03 PASSES — tenant isolation is enforced by the database, not by the client.');
})().catch((e) => { console.error('\nharness error: ' + (e?.message || e)); process.exit(2); });
