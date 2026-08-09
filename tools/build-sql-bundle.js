/* Regenerate supabase/RUN_THIS_IN_SQL_EDITOR.sql from supabase/migrations/.
 *
 *   node tools/build-sql-bundle.js
 *
 * The bundle is the fallback path for anyone without the Supabase CLI: paste one file into the
 * dashboard SQL editor and get the whole schema. Its header has always said "GENERATED FILE — do
 * not edit by hand … regenerate", but until now there was nothing to regenerate it WITH, so the
 * only way to add a migration was to paste it in by hand and hope. That is precisely how it came
 * to be missing 0000 and how it would have drifted again. A promise of regeneration with no
 * generator behind it is just a comment.
 *
 * tests/repo-audit.js fails the build when the bundle omits any migration, so this script and that
 * check are two halves of the same guarantee: the audit notices the drift, this fixes it.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'supabase', 'migrations');
const OUT = path.join(ROOT, 'supabase', 'RUN_THIS_IN_SQL_EDITOR.sql');

const migrations = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
if (!migrations.length) {
  console.error('no migrations found in ' + DIR);
  process.exit(1);
}

const head = [
  '-- ============================================================================',
  '--  Alsaiti Growth - RUN THIS ONCE, IN ONE GO.',
  '--  Supabase dashboard -> SQL Editor -> New query -> paste ALL of this -> Run.',
  '--',
  '--  This is every migration concatenated in order. It is safe to re-run: every',
  '--  statement uses "if not exists" / "create or replace" / "drop policy if exists",',
  '--  and 0000 drops a table only after checking at run time that it is empty.',
  '--',
  '--  GENERATED FILE - do not edit by hand. Edit the migration in',
  '--  supabase/migrations/ and run:  node tools/build-sql-bundle.js',
  '--',
  '--  Migrations included:',
  ...migrations.map((m) => '--    ' + m),
  '-- ============================================================================',
  '', '',
].join('\n');

const body = migrations.map((m) => [
  '',
  '-- ==========================================================================',
  '-- ' + m,
  '-- ==========================================================================',
  '',
  fs.readFileSync(path.join(DIR, m), 'utf8').replace(/\s+$/, ''),
  '',
].join('\n')).join('\n');

fs.writeFileSync(OUT, head + body + '\n');

console.log('wrote ' + path.relative(ROOT, OUT).replace(/\\/g, '/'));
console.log('  ' + migrations.length + ' migrations, ' + (head + body).split('\n').length + ' lines');
for (const m of migrations) console.log('    ' + m);
