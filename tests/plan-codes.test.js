/* The plan code must mean the same thing in the database, the checkout function and the UI.
 *
 * It did not. public.plans seeded the third tier as 'scale', stripe-billing accepted 'business',
 * and the page renders 'plan_full'. Checkout would have written plan='business' to the workspace;
 * plan_limit() joins public.plans on code, finds nothing, and every limit resolves to NULL — so a
 * paying top-tier customer would silently get unlimited seats and unmetered usage, with nothing
 * logged and nothing failing.
 *
 * Three files have to agree and none of them imports the others, which is exactly the shape of
 * problem that comes back. This is the check that stops it.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0; const bad = [];
const ok = (c, name, detail) => {
  if (c) { pass++; console.log('  ok   ' + name); }
  else { bad.push(name + ' — ' + detail); console.log('  FAIL ' + name + ' — ' + detail); }
};

console.log('=== plan codes agree across database, checkout and UI ===\n');

// 1. The seeded codes, read from the migration rather than the live database so this runs in CI.
const seed = fs.readFileSync(path.join(ROOT, 'supabase/migrations/0009_platform_entities.sql'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'supabase/migrations/0017_admin_console_usage_invites.sql'), 'utf8')
  + fs.readFileSync(path.join(ROOT, 'supabase/migrations/0021_plan_code_consistency.sql'), 'utf8');
const inserted = [...seed.matchAll(/\('(demo|starter|growth|scale|full|business)'\s*,\s*'/g)].map((m) => m[1]);
const renamed = /set code = 'full' where code = 'scale'/.test(seed);
const dbCodes = new Set(inserted.map((c) => (renamed && c === 'scale') ? 'full' : c));

// 2. What checkout will accept.
const billing = fs.readFileSync(path.join(ROOT, 'supabase/functions/stripe-billing/index.ts'), 'utf8');
const m = billing.match(/\[([^\]]*)\]\.includes\(plan\)/);
ok(!!m, 'checkout declares its plan list', 'could not find the plan whitelist');
const payCodes = m ? [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]) : [];

// 3. What the page renders.
const html = fs.readFileSync(path.join(ROOT, 'docs/index.html'), 'utf8');
const uiKeys = [...new Set([...html.matchAll(/k:'plan_([a-z]+)'/g)].map((x) => x[1]))];

console.log('  database : ' + [...dbCodes].sort().join(', '));
console.log('  checkout : ' + payCodes.sort().join(', '));
console.log('  UI       : ' + uiKeys.sort().join(', ') + '\n');

for (const c of payCodes) {
  ok(dbCodes.has(c), 'checkout plan "' + c + '" exists in public.plans',
    'a customer paying for this gets a plan with NO limits — every quota resolves to NULL');
}
for (const k of uiKeys) {
  ok(dbCodes.has(k), 'UI tier "' + k + '" exists in public.plans',
    'the page sells a tier the database does not price');
  ok(payCodes.includes(k), 'UI tier "' + k + '" can be checked out',
    'the page shows a plan the checkout would reject with unknown_plan');
}
ok(!payCodes.includes('business') && !dbCodes.has('business'),
  'the old "business" code is gone', 'the mismatch that caused this is still present');
ok(!dbCodes.has('scale'), 'the old "scale" code is gone', 'still seeded under the old name');

console.log('\npassed: ' + pass);
if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1); }
