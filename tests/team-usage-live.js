/* Admin console, usage metering and team invitations — against the REAL database.
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *   A_EMAIL/A_PASS (platform admin)  B_EMAIL/B_PASS (customer)  C_EMAIL/C_PASS (invitee) \
 *   node tests/team-usage-live.js
 *
 * The question that matters most here is not "does the admin console work" but "does it leak".
 * An operator needs to see which accounts exist and what they pay. If the same function also
 * returns a customer's leads, then running the business and reading the customers stop being
 * separable, and every customer's data is one SELECT away from the operator's screen. So the
 * strongest check below is a negative one: nothing this admin can call returns customer content.
 */

const URL  = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const A = { email: process.env.A_EMAIL, pass: process.env.A_PASS };
const B = { email: process.env.B_EMAIL, pass: process.env.B_PASS };
const C = { email: process.env.C_EMAIL, pass: process.env.C_PASS };

if (!URL || !ANON || !A.email || !B.email || !C.email) {
  console.error('Missing configuration: SUPABASE_URL, SUPABASE_ANON_KEY, A/B/C_EMAIL and _PASS');
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
  if (!j.access_token) throw new Error('sign-in failed for ' + who.email);
  return j.access_token;
}
async function rest(token, path, opts = {}) {
  const r = await fetch(base + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({ apikey: ANON, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      opts.prefer ? { Prefer: opts.prefer } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* not json */ }
  return { status: r.status, ok: r.ok, json: j };
}
const rpc = (token, fn, args) => rest(token, 'rpc/' + fn, { method: 'POST', body: args || {} });

(async () => {
  console.log('=== admin console, usage and invitations ===\n');

  const tA = await signIn(A), tB = await signIn(B), tC = await signIn(C);
  const wsB = (await rest(tB, 'workspaces?select=id&limit=1')).json?.[0]?.id;
  ok(!!wsB, 'setup: customer workspace exists', 'no workspace for B');
  if (!wsB) process.exit(1);

  /* Reset to a known state before asserting anything. This test writes to a live database, so it
     WILL be re-run over its own leftovers — and the first re-run proved the point: the previous
     run had left B on the 'growth' plan and had failed to remove C, so two checks failed for
     reasons that had nothing to do with the code under test. A live test that is not idempotent
     reports the last run's mess as this run's bug. */
  const meC0 = (await (await fetch(base + '/auth/v1/user', {
    headers: { apikey: ANON, Authorization: 'Bearer ' + tC },
  })).json()).id;
  await rpc(tA, 'set_subscription', { p_workspace: wsB, p_status: 'demo', p_plan: 'demo', p_note: 'test setup' });
  await rpc(tB, 'remove_member', { p_workspace: wsB, p_user: meC0 });
  await rest(tB, 'leads?name=eq.CONFIDENTIAL Probe Client', { method: 'DELETE' });

  // Give B something worth protecting.
  const lead = await rest(tB, 'leads', {
    method: 'POST', prefer: 'return=representation',
    body: { workspace_id: wsB, name: 'CONFIDENTIAL Probe Client', service: 'secret', status: 'New', source: 'Manual import', score: 5 },
  });
  ok(lead.ok, 'setup: customer has a lead', 'HTTP ' + lead.status);

  console.log('\nthe admin console lists accounts');
  {
    const r = await rpc(tA, 'admin_list_workspaces');
    ok(r.ok && Array.isArray(r.json), 'admin can list workspaces', 'HTTP ' + r.status + ' ' + JSON.stringify(r.json).slice(0, 120));
    const rowB = (r.json || []).find((w) => w.id === wsB);
    ok(!!rowB, 'the customer appears in the list', 'the operator cannot see their own customer');
    if (rowB) {
      ok(rowB.owner_email === B.email, 'shows who owns the account', 'owner email missing');
      ok(rowB.subscription_status === 'demo', 'shows the subscription status', 'got ' + rowB.subscription_status);
      ok(Number(rowB.lead_count) >= 1, 'shows a lead COUNT', 'counts are how you tell a live account from a dead one');
    }

    // The negative that matters.
    const blob = JSON.stringify(r.json || []);
    ok(!blob.includes('CONFIDENTIAL'), 'the list contains NO lead content',
      'admin_list_workspaces returned customer data — running the business and reading the customers are no longer separable');
    ok(!/"(phone|email_address|summary|notes)":/.test(blob), 'no contact fields in the payload', 'customer contact data leaked');
  }

  console.log('\na customer cannot use the admin console');
  {
    const r = await rpc(tB, 'admin_list_workspaces');
    ok(!r.ok, 'B cannot list workspaces', 'a customer can enumerate every other customer (HTTP ' + r.status + ')');
  }

  console.log('\nusage is reported against the plan');
  {
    const r = await rpc(tB, 'usage_summary', { ws: wsB });
    ok(r.ok && r.json && r.json.leads, 'usage_summary returns data', JSON.stringify(r.json).slice(0, 140));
    ok(Number(r.json?.leads?.used) >= 1, 'counts the lead just created', 'usage does not reflect reality');
    ok(r.json?.plan === 'demo', 'reports the plan', 'got ' + r.json?.plan);
    ok(r.json?.leads?.limit !== undefined, 'reports the limit', 'a usage figure with no limit cannot be acted on');

    const other = await rpc(tC, 'usage_summary', { ws: wsB });
    ok(!other.json || Object.keys(other.json).length === 0, 'C cannot read B\'s usage',
      'another customer can read this workspace\'s usage');
  }

  console.log('\nthe team list identifies actual people');
  {
    /* The panel used to select workspace_members directly, which returns user_ids and nothing
       else — `profiles` is readable only by its owner, so a workspace owner could not see the
       name of anyone on their own team. It rendered truncated UUIDs with a Remove button beside
       each: a destructive action next to an identifier nobody can resolve to a person. */
    /* rpc() here returns {status, ok, json} like rest() does, not the bare payload. */
    const team = (await rpc(tB, 'workspace_team', { ws: wsB })).json;
    ok(Array.isArray(team) && team.length >= 1, 'workspace_team returns the team', JSON.stringify(team).slice(0, 120));
    ok((team || []).every((m) => m.email && m.full_name), 'every member is identifiable by name and email',
      'the team list shows ids a human cannot resolve');

    // Scoped to the workspace: being platform admin does not make you a member of it.
    const outsider = (await rpc(tA, 'workspace_team', { ws: wsB })).json;
    ok(Array.isArray(outsider) && outsider.length === 0, 'a non-member sees nobody',
      'workspace_team leaked a customer\'s team to someone outside it');
  }

  console.log('\nthe activity log names who did it');
  {
    await rpc(tA, 'set_subscription', { p_workspace: wsB, p_status: 'demo', p_plan: 'demo', p_note: 'actor check' });
    const rows = await rest(tB, 'audit_logs?select=action,actor_email&workspace_id=eq.' + wsB + '&order=created_at.desc&limit=5');
    const withActor = (rows.json || []).filter((r) => r.actor_email);
    ok(withActor.length >= 1, 'audit entries carry an actor email',
      'actor_email was declared but never written, so every entry read as "system" — the log '
      + 'could not answer the one question it exists for');
  }

  console.log('\ninviting a colleague');
  let token = null;
  {
    // Demo tier: team is a paid feature, so this must be refused first.
    const denied = await rpc(tB, 'invite_member', { p_workspace: wsB, p_email: C.email, p_role: 'staff' });
    ok(!denied.ok, 'a demo account cannot invite', 'seats were given away free (HTTP ' + denied.status + ')');

    await rpc(tA, 'set_subscription', { p_workspace: wsB, p_status: 'active', p_plan: 'growth', p_note: 'team test' });

    const badRole = await rpc(tB, 'invite_member', { p_workspace: wsB, p_email: C.email, p_role: 'owner' });
    ok(!badRole.ok, 'cannot invite someone straight to owner', 'role escalation through the invite path');

    const badEmail = await rpc(tB, 'invite_member', { p_workspace: wsB, p_email: 'not-an-email', p_role: 'staff' });
    ok(!badEmail.ok, 'rejects a malformed email', 'an invitation was created for an unreachable address');

    const inv = await rpc(tB, 'invite_member', { p_workspace: wsB, p_email: C.email, p_role: 'staff' });
    ok(inv.ok && inv.json?.token, 'invitation created', 'HTTP ' + inv.status + ' ' + JSON.stringify(inv.json).slice(0, 140));
    token = inv.json?.token;

    // Only the hash is stored, so the row must not contain the token that was just returned.
    const rows = await rest(tB, 'workspace_invitations?select=*');
    const stored = JSON.stringify(rows.json || []);
    ok(token && !stored.includes(token), 'the plaintext token is NOT stored',
      'a database backup would contain working invitation links');
  }

  console.log('\naccepting it');
  {
    const wrongPerson = await rpc(tA, 'accept_invitation', { p_token: token });
    ok(!wrongPerson.ok, 'someone else cannot use the link', 'a forwarded invitation let the wrong person in');

    const good = await rpc(tC, 'accept_invitation', { p_token: token });
    ok(good.ok, 'the invited person can accept', 'HTTP ' + good.status + ' ' + JSON.stringify(good.json).slice(0, 140));

    const reuse = await rpc(tC, 'accept_invitation', { p_token: token });
    ok(!reuse.ok, 'the link cannot be used twice', 'invitation tokens are replayable');

    const junk = await rpc(tC, 'accept_invitation', { p_token: 'not-a-real-token' });
    ok(!junk.ok, 'a made-up token is refused', 'invalid tokens are accepted');

    // C is now staff in B's workspace and should see B's leads — that is the point of an invite.
    const seen = await rest(tC, 'leads?select=name&workspace_id=eq.' + wsB);
    ok((seen.json || []).some((l) => l.name === 'CONFIDENTIAL Probe Client'),
      'the new member can now see the workspace', 'the invitation did not actually grant access');
  }

  console.log('\nremoving people');
  {
    /* Ask the auth API who C actually is. The first version of this read
       workspace_members?workspace_id=eq.<ws> as C and took row [0] — but C is now a member, so
       that query correctly returns EVERY member, and row [0] was the owner. The test then tried
       to remove the owner, got the refusal it had just asserted two lines earlier, and reported
       remove_member as broken when it was working exactly as designed. */
    const meC = (await (await fetch(base + '/auth/v1/user', {
      headers: { apikey: ANON, Authorization: 'Bearer ' + tC },
    })).json()).id;

    const ownerRow = (await rest(tB, 'workspace_members?select=user_id&role=eq.owner&workspace_id=eq.' + wsB)).json?.[0];
    const rmOwner = await rpc(tB, 'remove_member', { p_workspace: wsB, p_user: ownerRow?.user_id });
    ok(!rmOwner.ok, 'the owner cannot be removed', 'a workspace can be left with nobody able to administer it');

    if (meC) {
      const rm = await rpc(tB, 'remove_member', { p_workspace: wsB, p_user: meC });
      ok(rm.ok, 'an admin can remove a member', 'HTTP ' + rm.status);
      const after = await rest(tC, 'leads?select=id&workspace_id=eq.' + wsB);
      ok(!(after.json || []).length, 'the removed member loses access immediately',
        'access survived removal');
    }
  }

  // Leave nothing behind.
  await rest(tB, 'leads?name=eq.CONFIDENTIAL Probe Client', { method: 'DELETE' });
  await rpc(tA, 'set_subscription', { p_workspace: wsB, p_status: 'demo', p_plan: 'demo', p_note: 'test cleanup' });

  console.log('\n' + '-'.repeat(58));
  console.log('passed: ' + pass);
  if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1); }
  console.log('The operator can run the business without being able to read the customers.');
})().catch((e) => { console.error('\nharness error: ' + (e?.message || e)); process.exit(2); });
