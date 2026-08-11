/* Prove the paywall and the single-admin rule against the REAL database.
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *   A_EMAIL=... A_PASS=... B_EMAIL=... B_PASS=... \
 *   ADMIN_USER_ID=<uuid of A>  node tests/entitlements-live.js
 *
 * A becomes the platform administrator. B is an ordinary customer on the demo tier.
 *
 * Why this has to run against the real thing: every rule here is a Postgres policy or a
 * SECURITY DEFINER function. A mock would be testing my idea of what the database does, and the
 * entire point of putting the paywall in the database was to stop the browser being the gate —
 * so a test that never speaks to the database tests the wrong layer.
 *
 * The question it exists to answer: can a customer give themselves the product for free?
 */

const URL  = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const A = { email: process.env.A_EMAIL, pass: process.env.A_PASS };
const B = { email: process.env.B_EMAIL, pass: process.env.B_PASS };

if (!URL || !ANON || !A.email || !B.email) {
  console.error('Missing configuration: SUPABASE_URL, SUPABASE_ANON_KEY, A_EMAIL, A_PASS, B_EMAIL, B_PASS');
  process.exit(2);
}

let pass = 0; const bad = [];
const ok = (c, name, detail) => {
  if (c) { pass++; console.log('  ok   ' + name); }
  else { bad.push(name + ' — ' + detail); console.log('  FAIL ' + name + ' — ' + detail); }
};
const base = URL.replace(/\/+$/, '');

async function signIn(who) {
  const r = await fetch(base + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: who.email, password: who.pass }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('sign-in failed for ' + who.email + ': ' + JSON.stringify(j).slice(0, 160));
  return j.access_token;
}

async function rest(token, path, opts = {}) {
  const r = await fetch(base + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: Object.assign(
      { apikey: ANON, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      opts.prefer ? { Prefer: opts.prefer } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* not json */ }
  return { status: r.status, ok: r.ok, json: j };
}
const rpc = (token, fn, args) => rest(token, 'rpc/' + fn, { method: 'POST', body: args || {} });

(async () => {
  console.log('=== paywall + single-admin, against the live project ===\n');

  const tA = await signIn(A);
  const tB = await signIn(B);
  const wsA = (await rest(tA, 'workspaces?select=id&limit=1')).json?.[0]?.id;
  const wsB = (await rest(tB, 'workspaces?select=id&limit=1')).json?.[0]?.id;
  ok(!!wsA && !!wsB && wsA !== wsB, 'setup: two separate workspaces', 'A=' + wsA + ' B=' + wsB);
  if (!wsA || !wsB) process.exit(1);

  console.log('\nA is the platform administrator, B is not');
  ok((await rpc(tA, 'is_platform_admin')).json === true,  'A is recognised as platform admin', 'got ' + JSON.stringify((await rpc(tA, 'is_platform_admin')).json));
  ok((await rpc(tB, 'is_platform_admin')).json === false, 'B is NOT platform admin', 'B was treated as an administrator');

  console.log('\nthe admin list is not readable by anyone');
  {
    const r = await rest(tB, 'platform_admins?select=*');
    ok(!(r.json || []).length, 'B cannot read platform_admins', 'the admin list leaked to a customer');
    const rA = await rest(tA, 'platform_admins?select=*');
    ok(!(rA.json || []).length, 'even the admin cannot read platform_admins', 'readable — anyone guessing the table name learns who runs the platform');
  }

  console.log('\na new customer starts on the demo tier');
  {
    const r = await rest(tB, 'workspaces?select=subscription_status&id=eq.' + wsB);
    ok(r.json?.[0]?.subscription_status === 'demo', 'B starts as demo',
      'a new signup began as ' + r.json?.[0]?.subscription_status + ' — an unknown account got paid access');
    ok((await rpc(tB, 'is_subscribed', { ws: wsB })).json === false, 'B is not subscribed', 'demo counted as subscribed');
  }

  console.log('\nTHE ONE THAT MATTERS: can a customer give themselves the product free?');
  {
    // B owns this workspace row and can legitimately rename it. The entitlement column must
    // still be untouchable.
    const patch = await rest(tB, 'workspaces?id=eq.' + wsB, {
      method: 'PATCH', body: { subscription_status: 'active', plan: 'growth' },
    });
    const after = (await rest(tB, 'workspaces?select=subscription_status&id=eq.' + wsB)).json?.[0]?.subscription_status;
    ok(after === 'demo', 'B cannot self-upgrade by PATCHing their own workspace',
      'B set their own status to ' + after + ' (HTTP ' + patch.status + ') — the product is free to anyone who reads the API docs');

    /* Reset before the next probe. The first version of this test did not, so when the PATCH hole
       was open every later check inherited a workspace that was already 'active' and reported its
       own failure — four failures for one bug, and the set_subscription() check looked broken when
       it had actually refused correctly with a 403. Each probe must start from a known state or
       the first failure writes the results of the rest. */
    await rpc(tA, 'set_subscription', { p_workspace: wsB, p_status: 'demo', p_note: 'test reset' });

    const viaRpc = await rpc(tB, 'set_subscription', { p_workspace: wsB, p_status: 'active' });
    const after2 = (await rest(tB, 'workspaces?select=subscription_status&id=eq.' + wsB)).json?.[0]?.subscription_status;
    ok(after2 === 'demo' && viaRpc.status >= 400, 'B cannot self-upgrade through set_subscription()',
      'the grant function let a customer upgrade themselves (HTTP ' + viaRpc.status + ', status now ' + after2 + ')');
  }

  console.log('\ndemo accounts cannot connect anything real');
  {
    await rpc(tA, 'set_subscription', { p_workspace: wsB, p_status: 'demo', p_note: 'test reset' });
    const r = await rest(tB, 'crm_connections', {
      method: 'POST', body: { workspace_id: wsB, provider: 'hubspot', status: 'connected' },
    });
    ok(!r.ok, 'B cannot create a CRM connection while on demo', 'a demo account connected a real CRM (HTTP ' + r.status + ')');
    ok((await rpc(tB, 'has_feature', { ws: wsB, feature: 'integrations' })).json === false,
      'has_feature says integrations are locked for B', 'the gate reports unlocked for a demo account');
    ok((await rpc(tB, 'has_feature', { ws: wsB, feature: 'view_dashboard' })).json === true,
      'B can still see the dashboard', 'the demo cannot even be evaluated');
  }

  console.log('\nafter the admin grants a subscription, the same action works');
  {
    const g = await rpc(tA, 'set_subscription', { p_workspace: wsB, p_status: 'active', p_plan: 'growth', p_note: 'entitlement test' });
    ok(g.ok, 'admin can grant a subscription', 'HTTP ' + g.status + ' ' + JSON.stringify(g.json).slice(0, 140));

    ok((await rpc(tB, 'is_subscribed', { ws: wsB })).json === true, 'B is now subscribed', 'the grant did not take');
    const r = await rest(tB, 'crm_connections', {
      method: 'POST', prefer: 'return=representation',
      body: { workspace_id: wsB, provider: 'hubspot', status: 'connected' },
    });
    ok(r.ok, 'B can now create a CRM connection', 'still blocked after paying: HTTP ' + r.status + ' ' + JSON.stringify(r.json).slice(0, 140));
    if (r.ok && r.json?.[0]?.id) await rest(tB, 'crm_connections?id=eq.' + r.json[0].id, { method: 'DELETE' });

    // Put it back, so the test leaves nothing behind.
    await rpc(tA, 'set_subscription', { p_workspace: wsB, p_status: 'demo', p_note: 'test cleanup' });
  }

  console.log('\nadmin unlocks the PAYWALL, never the tenant boundary');
  {
    // The most dangerous mistake available here: writing has_feature so that an admin returns
    // true before the membership check. That would silently make every customer's data readable.
    ok((await rpc(tA, 'has_feature', { ws: wsB, feature: 'integrations' })).json === false,
      'admin has_feature is FALSE for a workspace they are not in',
      'the platform admin was granted rights inside a customer workspace — tenancy is breached');

    const leads = await rest(tA, 'leads?select=*&workspace_id=eq.' + wsB);
    ok(!(leads.json || []).length, 'admin cannot read a customer\'s leads over the API',
      'the admin account can read customer data directly — that is a GDPR problem, not a feature');
  }

  console.log('\nonly one platform administrator can exist');
  {
    const r = await rest(tB, 'platform_admins', {
      method: 'POST', body: { user_id: '00000000-0000-0000-0000-000000000001', email: 'attacker@example.com' },
    });
    ok(!r.ok, 'B cannot insert themselves as an admin', 'a customer promoted themselves (HTTP ' + r.status + ')');
  }

  console.log('\n' + '-'.repeat(58));
  console.log('passed: ' + pass);
  if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1); }
  console.log('The paywall is enforced by the database. A customer cannot grant themselves access,');
  console.log('and the platform administrator cannot read customer data.');
})().catch((e) => { console.error('\nharness error: ' + (e?.message || e)); process.exit(2); });
