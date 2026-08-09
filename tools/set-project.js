/* Point the whole repository at a Supabase project, in one command.
 *
 *   node tools/set-project.js <project-ref> [publishable-key]
 *   node tools/set-project.js hedaklvumeihfsgokdsi sb_publishable_xxx
 *
 * The reference was hardcoded in twelve places across seven files — the app, the native app,
 * three documents, two test harnesses and an env template. Changing projects by hand means
 * finding all twelve, and missing one is a silent failure: the app talks to one project while a
 * test verifies another and both look fine.
 *
 * Run with no arguments to see what is currently referenced.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const REPO = path.join(__dirname, '..');
const REF_RE = /\b[a-z]{20}\b(?=\.supabase\.co)|(?<=project-ref )\b[a-z]{20}\b/g;
// Both key formats: the modern publishable prefix, and a legacy anon JWT.
const KEY_RE = /\bsb_publishable_[A-Za-z0-9_-]{10,}|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g;

const tracked = () => cp.execSync('git ls-files', { cwd: REPO, encoding: 'utf8' })
  .split('\n').map((s) => s.trim())
  .filter((f) => f && !/node_modules|package-lock|\.pdf$|\.png$/.test(f));

function scan() {
  const refs = new Map(), keys = new Map();
  for (const f of tracked()) {
    let src;
    try { src = fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { continue; }
    for (const m of src.match(REF_RE) || []) refs.set(m, (refs.get(m) || 0) + 1);
    for (const m of src.match(KEY_RE) || []) keys.set(m, (keys.get(m) || 0) + 1);
  }
  return { refs, keys };
}

const [, , newRef, newKey] = process.argv;

if (!newRef) {
  const { refs, keys } = scan();
  console.log('=== currently referenced ===');
  console.log('project refs:');
  refs.forEach((n, r) => console.log('   ' + r + '   ×' + n));
  console.log('publishable keys:');
  keys.forEach((n, k) => console.log('   ' + k.slice(0, 30) + '…   ×' + n));
  if (refs.size > 1) console.log('\nWARNING: more than one project is referenced. Something is pointing the wrong way.');
  console.log('\nTo switch:  node tools/set-project.js <new-ref> [new-publishable-key]');
  process.exit(0);
}

if (!/^[a-z]{20}$/.test(newRef)) {
  console.error('A Supabase project ref is 20 lowercase letters. Got: ' + newRef);
  process.exit(2);
}
/* Only a PUBLIC key may be written into files that are committed and served to browsers.
 *
 * Two formats are valid. The modern one announces itself: sb_publishable_… . The legacy one is a
 * JWT, and a legacy service_role key is byte-for-byte indistinguishable at a glance — same
 * prefix, same length, same shape. The only difference is the `role` claim in the payload, so
 * that is what gets checked. Getting this wrong publishes a key that bypasses every row-level
 * security policy in the database. */
function assertPublicKey(k) {
  if (/^sb_publishable_/.test(k)) return 'publishable';
  if (/^sb_secret_/.test(k)) {
    console.error('That is a SECRET key. It must never be committed or sent to a browser.');
    process.exit(2);
  }
  const parts = k.split('.');
  if (parts.length === 3) {
    let claims;
    try {
      claims = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    } catch {
      console.error('That looks like a JWT but its payload could not be read.');
      process.exit(2);
    }
    if (claims.role === 'anon') return 'legacy anon (role=anon, verified)';
    console.error('REFUSED: that JWT has role="' + claims.role + '".');
    console.error('Only role="anon" may be published. A service_role key bypasses every RLS policy.');
    process.exit(2);
  }
  console.error('Unrecognised key format. Expected sb_publishable_… or a legacy anon JWT.');
  process.exit(2);
}
let keyKind = null;
if (newKey) keyKind = assertPublicKey(newKey);

const { refs, keys } = scan();
const oldRefs = [...refs.keys()].filter((r) => r !== newRef);
const oldKeys = [...keys.keys()].filter((k) => k !== newKey);

let files = 0, edits = 0;
for (const f of tracked()) {
  const p = path.join(REPO, f);
  let src;
  try { src = fs.readFileSync(p, 'utf8'); } catch { continue; }
  const before = src;
  for (const o of oldRefs) src = src.split(o).join(newRef);
  if (newKey) for (const o of oldKeys) src = src.split(o).join(newKey);
  if (src !== before) {
    const n = (before.match(new RegExp(oldRefs.map((r) => r).join('|') || '$^', 'g')) || []).length;
    fs.writeFileSync(p, src);
    files++; edits += n;
    console.log('  updated  ' + f);
  }
}

console.log('\nproject ref -> ' + newRef);
if (newKey) console.log('publishable key -> ' + newKey.slice(0, 30) + '…');
console.log(files + ' file(s), ' + edits + ' reference(s) changed');
console.log('\nNext:');
console.log('  1. node tests/repo-audit.js      # confirms only one project is referenced');
console.log('  2. cd tests && node run.js       # the app still works');
console.log('  3. supabase link --project-ref ' + newRef);
console.log('  4. supabase db push && supabase functions deploy contact-submit lead-notify health events-consume');
