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

console.log('\npassed: ' + pass);
if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1); }
