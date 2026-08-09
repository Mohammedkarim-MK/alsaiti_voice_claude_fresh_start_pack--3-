/* Whole-repo audit: the classes of defect the behavioural suites do not look for.
   Static, cross-file, and cheap to re-run. */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const REPO = path.join(__dirname, '..');
const findings = [];
const F = (sev, area, msg) => findings.push({ sev, area, msg });
const SKIP = /node_modules|[\\/]\.git[\\/]|goldfish-house-demo/;

function tracked() {
  return cp.execSync('git ls-files', { cwd: REPO, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean).filter((f) => !SKIP.test(f));
}
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const files = tracked();

/* ---------------------------------------------------------------- 1. every JSON parses */
for (const f of files.filter((f) => f.endsWith('.json'))) {
  try { JSON.parse(read(f)); } catch (e) { F('HIGH', 'json', f + ' — ' + e.message.slice(0, 90)); }
}

/* ---------------------------------------------------------------- 2. every JS parses */
for (const f of files.filter((f) => /\.(js|mjs)$/.test(f) && !/alsaiti-go|alsaiti-voice-expo/.test(f))) {
  const src = read(f);
  const isModule = /^\s*(import|export)\s/m.test(src);
  try {
    // eslint-disable-next-line no-new-func
    if (isModule) new (require('vm').Script)(src, { filename: f, importModuleDynamically: () => {} });
    else new Function(src);
  } catch (e) {
    if (!/import|export|await is only valid/i.test(e.message)) F('HIGH', 'syntax', f + ' — ' + e.message.slice(0, 90));
  }
}

/* ---------------------------------------------------------------- 3. i18n completeness
   A key present in English but missing elsewhere renders the RAW KEY to the user.

   The tables are read from a real DOM rather than parsed out of the source. An earlier version
   brace-matched `var EXTRA_TR={...}` and produced 268 false positives, because the translation
   strings contain {p}, {acct}, {e} placeholders that a naive brace counter treats as nesting.
   EXTRA_TR is also merged into TR at runtime, so only the merged result is the truth. */
{
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = new JSDOM(read('docs/index.html'), {
    runScripts: 'dangerously', url: 'https://example.org/', virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;
  const TR = w.TR;
  if (!TR || !TR.en) F('HIGH', 'i18n', 'TR is not reachable on window after load');
  else {
    const en = Object.keys(TR.en);
    for (const l of Object.keys(TR).filter((x) => x !== 'en')) {
      const missing = en.filter((k) => !(k in TR[l]));
      if (missing.length) F('HIGH', 'i18n', `${l} is missing ${missing.length} key(s) — the raw key renders: ${missing.slice(0, 8).join(', ')}`);
      const extra = Object.keys(TR[l]).filter((k) => !en.includes(k));
      if (extra.length) F('LOW', 'i18n', `${l} defines ${extra.length} key(s) English does not: ${extra.slice(0, 5).join(', ')}`);
    }
    const html = read('docs/index.html');
    const used = new Set([...html.matchAll(/\bt\('([a-z0-9_]+)'\)/g)].map((m) => m[1]));
    const undef = [...used].filter((k) => !(k in TR.en));
    if (undef.length) F('HIGH', 'i18n', `${undef.length} key(s) used but never defined: ${undef.slice(0, 8).join(', ')}`);
    /* Unused keys are dead weight rather than a defect — but only count the ones that really
       are unreachable. The app builds keys by concatenation (t('hz_' + name), t('v_a_' + intent)),
       so a purely static count reported 78 when the true figure was 30. A check that cries wolf
       gets ignored, which is worse than not having it. */
    const prefixes = [...new Set([...html.matchAll(/\bt\(\s*'([a-z0-9_]+)'\s*\+/g)].map((m) => m[1]))];
    const reachable = (k) => used.has(k) || html.includes("'" + k + "'") || prefixes.some((p) => k.startsWith(p));
    const orphan = en.filter((k) => !reachable(k));
    if (orphan.length) F('LOW', 'i18n', orphan.length + ' English key(s) unreachable by any route: ' + orphan.slice(0, 10).join(', '));
  }
  dom.window.close();
}

/* ---------------------------------------------------------------- 4. window exports resolve */
{
  const html = read('docs/index.html');
  for (const m of html.matchAll(/window\.(\w+)\s*=\s*(\w+)\s*[;\n]/g)) {
    const target = m[2];
    const declared = new RegExp('(function\\s+' + target + '\\s*\\(|var\\s+' + target + '\\s*=|const\\s+' + target + '\\s*=|let\\s+' + target + '\\s*=)').test(html);
    if (!declared) F('HIGH', 'exports', `window.${m[1]} = ${target}, but ${target} is never declared`);
  }
  // inline handlers calling something that does not exist on window
  const exported = new Set([...html.matchAll(/window\.(\w+)\s*=/g)].map((m) => m[1]));
  // Language constructs and browser globals are not app functions. Without this the check
  // reports `if(` and `setTimeout(` as undefined handlers.
  const NOT_APP = new Set(['if', 'for', 'while', 'switch', 'return', 'typeof', 'new', 'do',
    'setTimeout', 'setInterval', 'alert', 'confirm', 'console', 'event', 'window', 'document']);
  const calls = new Set([...html.matchAll(/on(?:click|submit|input|change|keydown)="(?:return\s+)?(\w+)\s*\(/g)].map((m) => m[1]));
  for (const c of calls) {
    if (NOT_APP.has(c) || exported.has(c)) continue;
    const isGlobalFn = new RegExp('function\\s+' + c + '\\s*\\(').test(html);
    if (!isGlobalFn) F('HIGH', 'handlers', `inline handler calls ${c}() which is neither declared nor exported`);
  }
}

/* ---------------------------------------------------------------- 5. cross-file consistency */
{
  const web = read('docs/index.html');
  const native = read('alsaiti-go/App.js');

  const wS = (web.match(/var SIGNUPS_OPEN\s*=\s*(true|false)/) || [])[1];
  const nS = (native.match(/const SIGNUPS_OPEN\s*=\s*(true|false)/) || [])[1];
  if (!wS || !nS) F('HIGH', 'consistency', 'SIGNUPS_OPEN missing from web or native');
  else if (wS !== nS) F('HIGH', 'consistency', `SIGNUPS_OPEN disagrees: web=${wS} native=${nS} — one of them is lying to users`);

  // the Supabase project must be the same everywhere it is hardcoded
  const refs = new Set();
  for (const f of files.filter((f) => /\.(html|js|ts|md|yml|toml)$/.test(f))) {
    for (const m of read(f).matchAll(/https:\/\/([a-z0-9]{20})\.supabase\.co/g)) refs.add(m[1]);
  }
  if (refs.size > 1) F('HIGH', 'consistency', 'more than one Supabase project referenced: ' + [...refs].join(', '));

  // retention periods promised on the site must match what the sweep actually deletes
  const sql = read('supabase/migrations/0007_retention_roles_conversations.sql');
  const promised = /24 months/.test(web) && /30 days/.test(web);
  const enforced = /interval '24 months'/.test(sql) && /interval '30 days'/.test(sql);
  if (promised && !enforced) F('HIGH', 'consistency', 'the privacy policy promises retention periods the sweep does not enforce');
}

/* ---------------------------------------------------------------- 6. edge functions:
   every function named in config.toml exists, and vice versa */
{
  const toml = read('supabase/config.toml');
  const configured = new Set([...toml.matchAll(/\[functions\.([a-z0-9-]+)\]/g)].map((m) => m[1]));
  const onDisk = fs.readdirSync(path.join(REPO, 'supabase/functions'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '_shared').map((d) => d.name);
  for (const f of onDisk) if (!configured.has(f)) F('HIGH', 'functions', `${f} exists but has no [functions.${f}] block — it will default to verify_jwt=true, silently 401ing`);
  for (const f of configured) if (!onDisk.includes(f)) F('MED', 'functions', `config.toml declares ${f} but no such function exists`);

  /* Parse config.toml into real blocks. A non-greedy [\s\S]{0,120} lookahead runs past the end
     of one block into the next, so every function inherited the verify_jwt of whichever block
     happened to follow — which reported four public functions that are not public. */
  const jwt = {};
  {
    let current = null;
    for (const line of toml.split('\n')) {
      const head = line.match(/^\s*\[functions\.([a-z0-9-]+)\]/);
      if (head) { current = head[1]; continue; }
      if (/^\s*\[/.test(line)) { current = null; continue; }
      const v = line.match(/^\s*verify_jwt\s*=\s*(true|false)/);
      if (v && current) jwt[current] = v[1] === 'true';
    }
  }
  for (const f of onDisk) {
    const src = read(`supabase/functions/${f}/index.ts`);
    if (jwt[f] === false && /resolveWorkspace\s*\(/.test(src) && !/auth\.getUser/.test(src)) {
      F('HIGH', 'functions', `${f} has verify_jwt=false but calls resolveWorkspace — it would trust an unverified caller`);
    }
    // a JWT-protected function that never resolves a workspace may be leaking across tenants
    if (jwt[f] === true && !/resolveWorkspace|auth\.getUser/.test(src)) {
      F('MED', 'functions', `${f} requires a JWT but never resolves who the caller is`);
    }
  }
}

/* ---------------------------------------------------------------- 7. migrations */
{
  const dir = path.join(REPO, 'supabase/migrations');
  const migs = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const nums = migs.map((m) => m.slice(0, 4));
  if (new Set(nums).size !== nums.length) F('HIGH', 'migrations', 'duplicate migration numbers: ' + nums.join(', '));
  /* Contiguous, but allowed to start at either 0000 or 0001. 0000 is reserved for work that must
     precede the schema rather than extend it — dropping another tool's leftovers, for instance —
     and numbering it 0000 is the only way to make it sort first. Insisting the sequence begins at
     0001 flagged that as a gap, which is the check misreading a deliberate convention. */
  const start = Number(nums[0]) === 0 ? 0 : 1;
  for (let i = 0; i < nums.length; i++) {
    if (Number(nums[i]) !== i + start) { F('MED', 'migrations', `numbering gap at ${migs[i]}`); break; }
  }
  // every table exposed through the API must have RLS
  const all = migs.map((m) => fs.readFileSync(path.join(dir, m), 'utf8')).join('\n');
  const tables = [...all.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  for (const t of tables) {
    const rls = new RegExp('alter table public\\.' + t + '\\s+enable row level security', 'i').test(all);
    const revoked = new RegExp('revoke all on public\\.' + t + '\\s+from anon, authenticated', 'i').test(all);
    if (!rls && !revoked) F('HIGH', 'rls', `public.${t} has neither RLS enabled nor privileges revoked — it is readable by anyone with the anon key`);
  }
  // a bundle that has drifted from the migrations is a trap
  const bundle = read('supabase/RUN_THIS_IN_SQL_EDITOR.sql');
  for (const m of migs) if (!bundle.includes(m)) F('HIGH', 'migrations', `RUN_THIS_IN_SQL_EDITOR.sql does not include ${m} — anyone running it gets an out-of-date schema`);
}

/* ---------------------------------------------------------------- 8. docs tell the truth */
{
  for (const f of files.filter((f) => f.startsWith('handover/') || f === 'README.md')) {
    const src = read(f);
    for (const m of src.matchAll(/\]\((?!https?:|#|mailto:)([^)]+)\)/g)) {
      const target = m[1].split('#')[0];
      if (!target) continue;
      const abs = path.resolve(path.join(REPO, path.dirname(f)), target);
      if (!fs.existsSync(abs)) F('MED', 'docs', `${f} links to ${target}, which does not exist`);
    }
  }
}

/* ---------------------------------------------------------------- 9. leftovers */
for (const f of files.filter((f) => /\.(js|ts|html)$/.test(f) && !/^tests\//.test(f))) {
  const src = read(f);
  for (const [re, label] of [[/\bdebugger\b/g, 'debugger statement'], [/\bFIXME\b/g, 'FIXME'], [/\bXXX\b/g, 'XXX']]) {
    const n = (src.match(re) || []).length;
    if (n) F('MED', 'leftover', `${f} contains ${n} ${label}`);
  }
}

/* ---------------------------------------------------------------- report */
const order = ['HIGH', 'MED', 'LOW'];
console.log('=== whole-repo audit: ' + files.length + ' tracked files ===\n');
let high = 0;
for (const sev of order) {
  const list = findings.filter((f) => f.sev === sev);
  if (sev === 'HIGH') high = list.length;
  console.log(sev + ': ' + list.length);
  for (const f of list) console.log('   [' + f.area + '] ' + f.msg);
  if (list.length) console.log('');
}
process.exit(high ? 1 : 0);
