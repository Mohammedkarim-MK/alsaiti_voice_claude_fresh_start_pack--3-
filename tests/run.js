/* Run every suite in this directory and fail the process if any of them fail.
   Each suite is a standalone script that exits non-zero on failure, so the runner just needs to
   sequence them and total up. Kept dependency-free on purpose: the only thing `npm i` fetches is
   jsdom, which keeps CI fast and the supply chain small. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const only = process.argv.slice(2);
const suites = fs.readdirSync(dir)
  .filter((f) => f.endsWith('.test.js'))
  .filter((f) => !only.length || only.some((o) => f.includes(o)))
  .sort();

if (!suites.length) { console.error('no suites matched'); process.exit(1) }

let failed = 0;
const results = [];
for (const suite of suites) {
  const t0 = Date.now();
  let out = '', code = 0;
  try {
    out = execFileSync(process.execPath, [path.join(dir, suite)], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    code = e.status == null ? 1 : e.status;
    out = (e.stdout || '') + (e.stderr || '');
    failed++;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  // pull the summary line each suite prints, whichever style it uses
  const m = out.match(/passed:\s*\d+|PASS \d+\s+FAIL \d+|No defects found|Every feature behaved as claimed/);
  results.push({ suite, code, secs, summary: m ? m[0] : '(no summary)' });
  if (code !== 0) {
    console.log('\n===== FAILED: ' + suite + ' =====');
    console.log(out.trim().split('\n').slice(-25).join('\n'));
  }
}

console.log('\n' + '-'.repeat(62));
for (const r of results) {
  console.log((r.code === 0 ? '  ok   ' : '  FAIL ') + r.suite.padEnd(30) + r.summary.padEnd(18) + r.secs + 's');
}
console.log('-'.repeat(62));
console.log(suites.length - failed + '/' + suites.length + ' suites passed');
process.exit(failed ? 1 : 0);
