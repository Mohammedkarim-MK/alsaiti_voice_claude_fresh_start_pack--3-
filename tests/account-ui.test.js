/* The account area: plan, usage, team, activity log and the platform admin console.
 *
 * The first check below is the one that earns its keep. The account code was inserted next to
 * settingsPage(), which sits well above `var BK` in the file, and it began with `BK.rpc = ...`.
 * That runs at parse time against an undefined BK, throws, and aborts the REST OF THE SCRIPT —
 * so VOICE, LEADS and every later definition silently never existed and the app rendered nothing.
 * Twelve suites went red at once with "cannot read properties of undefined", which is what a
 * dead script looks like from the outside. Asserting that late globals still exist is how that
 * class of failure gets named instead of guessed at.
 *
 * The rest hold the two promises this UI makes: it shows nothing it cannot back with a real
 * request, and the admin console never displays customer content.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');

let pass = 0; const bad = [];
const ok = (c, name, detail) => {
  if (c) { pass++; console.log('  ok   ' + name); }
  else { bad.push(name + ' — ' + detail); console.log('  FAIL ' + name + ' — ' + detail); }
};

console.log('=== account, team, usage and admin console ===\n');

const dom = new JSDOM(SRC, { runScripts: 'dangerously', url: 'https://alsaitigrowth.com/' });
const w = dom.window;

console.log('the script runs to completion');
{
  // Defined AFTER the account block. If any of these is missing the script died partway.
  for (const g of ['BK', 'VOICE', 'AUTH', 'crmStateMeta', 'humanState']) {
    ok(typeof w[g] !== 'undefined', g + ' is still defined',
      'the script aborted before reaching it — something in the account block threw at parse time');
  }
  ok(typeof w.BK === 'object' && typeof w.BK.rest === 'function', 'BK is intact', 'BK was overwritten');
}

console.log('\nthe account code is present');
{
  for (const fn of ['accountPanels', 'acctLoad', 'bkRpc', 'acctChip',
                    'teamInvite', 'teamRevoke', 'teamRemove', 'adminSet']) {
    ok(typeof w[fn] === 'function', fn + ' defined', 'missing');
  }
}

console.log('\nwith no backend it says so instead of inventing data');
{
  const html = w.accountPanels();
  ok(/Connect a Supabase|no backend/i.test(html), 'unconfigured state is honest',
    'it drew plan and usage panels with nothing behind them');
  ok(!/\d+\s*\/\s*\d+/.test(html), 'no fabricated usage numbers', 'usage figures appear with no data source');

  let threw = null;
  try { w.acctLoad(); } catch (e) { threw = String(e && e.message || e); }
  ok(!threw, 'acctLoad is safe to call with no backend', threw);
}

console.log('\nthe settings screen wires it in');
{
  /* Checked structurally rather than by calling settingsPage(). It is a signed-in screen and
     reads AUTH.current(), which is null in a fresh jsdom, so invoking it here throws on a missing
     profile — a fact about the test having no session, not about the wiring. */
  ok(/accountPanels\(\)\s*\+/.test(w.settingsPage.toString()), 'settings renders the account area',
    'accountPanels() is not called from settingsPage');
  ok(/hash==='settings'[^;]*acctLoad/.test(SRC), 'the loader fires on the settings route',
    'the panels would render as permanent "Loading…" because nothing fetches their data');
}

console.log('\nstate chips never dress a demo up as a paying customer');
{
  const active = w.acctChip('active');
  const demo   = w.acctChip('demo');
  const past   = w.acctChip('past_due');
  ok(/cs-connected/.test(active), 'active reads as connected', active);
  ok(!/cs-connected/.test(demo), 'demo does NOT read as connected',
    'a demo account is rendered in the same green as a paying one');
  ok(!/cs-connected/.test(past), 'past_due does NOT read as connected', past);
}

console.log('\nthe admin console states its own scope');
{
  // The note is the user-visible half of the guarantee the SQL enforces.
  const strings = JSON.stringify(w.TR || {});
  ok(/Accounts only/i.test(strings), 'admin panel says it shows accounts only',
    'the console does not tell the operator what it deliberately does not show');
  ok(/no lead, call or contact data/i.test(strings), 'and names what it excludes', 'scope note is vague');
}

console.log('\npaid features are described as locked, not hidden');
{
  const strings = JSON.stringify(w.TR || {});
  ok(/requires a subscription/i.test(strings), 'team invite explains why it is unavailable',
    'a locked feature with no explanation reads as a broken feature');
  ok(/Not included on this plan/i.test(strings), 'unmetered usage is labelled',
    'an unmetered item would render as an empty bar, which reads as zero usage');
}

console.log('\nthe usage card says what it actually measures');
{
  /* Payload captured verbatim from the live database for a demo-tier workspace. Every bug below
     was found by rendering this and reading it, not by reading the code. */
  const live = {
    plan: 'demo', status: 'demo', period_start: '2026-08-01T00:00:00+00:00',
    leads:        { used: 0, limit: 25, percent: 0 },
    members:      { used: 1, limit: 1,  percent: 100 },
    call_minutes: { used: 0, limit: 0,  percent: null },
  };
  const el = (id) => { const e = w.document.createElement('div'); e.id = id; w.document.body.appendChild(e); return e; };
  el('acct-usage'); el('acct-plan');
  w.ACCT.usage = live; w.ACCT.ent = { plan: 'demo', status: 'demo', subscribed: false, features: {} };
  w.acctPaintUsage(); w.acctPaintPlan();
  const usage = new JSDOM('<div>' + w.document.getElementById('acct-usage').innerHTML + '</div>')
    .window.document.body.textContent.replace(/\s+/g, ' ');
  const plan = new JSDOM('<div>' + w.document.getElementById('acct-plan').innerHTML + '</div>')
    .window.document.body.textContent.replace(/\s+/g, ' ');

  /* Assert against the card TITLE, not the painted rows. The title lives in accountPanels() and
     was the thing that said "Usage this month" over three metrics, only one of which is monthly.
     The first version of this checked the painted content, which never contained that phrase —
     so it passed on the broken build and proved nothing. */
  const titles = JSON.stringify(w.TR || {});
  ok(!/"Usage this month"/.test(titles), 'the card is not titled "Usage this month"',
    'leads and seats are live totals, not monthly — a customer at their lead allowance would '
    + 'read that title as a cap that resets on the 1st, and be wrong about the number that '
    + 'decides whether they can keep taking enquiries');

  /* And check the minutes ROW specifically. Checking the whole panel for "this month" passed
     pre-fix because the old warning read "close to your limit for this month" — a coincidence,
     not the label being right. */
  const minutesRow = usage.split('Voice minutes')[1] || '';
  ok(/Voice minutes this month/i.test(usage), 'voice minutes ARE labelled monthly',
    'call_minutes is the one genuinely monthly figure and is the only one that may say so');
  ok(!/Leads stored this month|seats used this month/i.test(usage), 'leads and seats are not',
    'a live total was labelled as a monthly figure');

  ok(!/0 \/ 0/.test(usage), 'no "0 / 0" for something not on the plan',
    'showing a 0 of 0 quota beside "not included" says two contradictory things at once');
  ok(/Not included on this plan/i.test(usage), 'unavailable metrics say so', '');

  ok(/full allowance/i.test(usage), 'at the limit says the allowance is used up',
    'at 1 of 1 seats it said "close to your limit", which is both wrong and not actionable');
  ok(!/close to your limit/i.test(usage), 'and does not also say "close to"', 'both messages rendered');

  ok(!/Counting from|counted from/i.test(usage), 'no billing-period line when nothing is metered monthly',
    'a period line appeared for a plan with no monthly metric at all');

  ok(!/DemoDemo/i.test(plan), 'the plan name is not printed twice',
    'plan "demo" and status "demo" both rendered, giving "DemoDemo"');
  ok(/Demo/.test(plan), 'the tier is still shown', 'the fix removed the label entirely');
}

console.log('\nrole names are labels, not database codes');
{
  /* The team panel shipped printing the raw code: a Spanish or Arabic admin saw "readonly" and
     "staff" in English, and even in English "readonly" is not a word anyone writes. The roles
     live in a CHECK constraint in SQL, so this reads that constraint rather than a hand-copied
     list — a role added to the database but never given a label is exactly the drift to catch. */
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '0007_retention_roles_conversations.sql'), 'utf8');
  const m = /workspace_members_role_check[\s\S]*?check \(role in \(([^)]*)\)\)/.exec(sql);
  ok(!!m, 'found the role constraint in SQL', 'the migration moved — this test is now blind');
  const roles = (m ? m[1] : '').split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
  ok(roles.length >= 5, 'read ' + roles.length + ' roles from the constraint', 'parsed nothing useful');

  ok(typeof w.roleLabel === 'function', 'roleLabel exists', 'raw codes would reach the screen');
  for (const r of roles) {
    for (const lang of ['en', 'es', 'ar']) {
      w.LANG = lang;
      const label = w.roleLabel(r);
      ok(label && label !== r, r + ' has a ' + lang.toUpperCase() + ' label ("' + label + '")',
        'English-only or missing — a ' + lang.toUpperCase() + ' admin sees the database code');
    }
  }
  w.LANG = 'en';

  // An unknown code must degrade to the code, never to an empty cell that looks like no role.
  ok(w.roleLabel('supervisor') === 'supervisor', 'an unknown role falls back to its code',
    'a role added server-side would render as a blank cell');
  ok(w.roleLabel('') === '' && w.roleLabel(null) === '', 'empty stays empty', '');

  // The invite form must not carry hardcoded English either.
  for (const k of ['acct_invite_email_l', 'acct_invite_role_l', 'acct_invite_email_ph']) {
    for (const lang of ['en', 'es', 'ar']) {
      w.LANG = lang;
      ok(w.t(k) !== k, k + ' exists in ' + lang.toUpperCase(), 'untranslated string in the invite form');
    }
  }
  w.LANG = 'en';
  ok(!/<option value="(staff|manager|agent|readonly|admin)">\1<\/option>/.test(SRC),
    'no hardcoded English <option> labels remain',
    'the role picker is still printing database codes at the user');
}

console.log('\npassed: ' + pass);
if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1); }
