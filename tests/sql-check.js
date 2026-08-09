/* Parse every migration with PostgreSQL's own grammar before any of it touches production.
 *
 * Ten migrations, ~1700 lines of hand-written SQL, five of them never executed anywhere. A syntax
 * error surfaces halfway through `db push`, leaving the database partly migrated — which is the
 * worst possible moment to discover a missing semicolon.
 *
 * Catches syntax, not semantics: a typo in a column name still gets through. But syntax is where
 * hand-written DDL actually breaks.
 */
const fs = require('fs');
const path = require('path');
const pg = require('libpg-query');

const DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

/* Split into statements on top-level semicolons only.
 *
 * Four things contain semicolons that must NOT split a statement, and earlier versions of this
 * tripped over three of them:
 *   $$ … $$   function bodies, which are almost entirely semicolons
 *   -- …      line comments; prose like "lives in crm_credentials; this is only the reference"
 *   /* … *\/  block comments
 *   ' … '     string literals
 */
function statements(sql) {
  const out = [];
  let buf = '', i = 0, tag = null;
  while (i < sql.length) {
    const rest = sql.slice(i, i + 2);

    if (!tag) {
      // dollar-quoted body: $$ or $name$
      const m = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i));
      if (m) { tag = m[0]; buf += tag; i += tag.length; continue; }

      if (rest === '--') {                      // line comment to end of line
        const nl = sql.indexOf('\n', i);
        const end = nl < 0 ? sql.length : nl;
        buf += sql.slice(i, end); i = end; continue;
      }
      if (rest === '/*') {                      // block comment, possibly nested in Postgres
        let depth = 1, j = i + 2;
        while (j < sql.length && depth) {
          if (sql.startsWith('/*', j)) { depth++; j += 2; }
          else if (sql.startsWith('*/', j)) { depth--; j += 2; }
          else j++;
        }
        buf += sql.slice(i, j); i = j; continue;
      }
      if (sql[i] === "'") {                     // string literal, '' escapes a quote
        let j = i + 1;
        while (j < sql.length) {
          if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
          if (sql[j] === "'") { j++; break; }
          j++;
        }
        buf += sql.slice(i, j); i = j; continue;
      }
      if (sql[i] === ';') { out.push(buf); buf = ''; i++; continue; }
    } else if (sql.startsWith(tag, i)) {
      buf += tag; i += tag.length; tag = null; continue;
    }
    buf += sql[i]; i++;
  }
  if (buf.trim()) out.push(buf);

  // Drop chunks that are only comments and whitespace — real statements remain.
  return out.map((s) => s.trim()).filter((s) => {
    const stripped = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '').trim();
    return stripped.length > 0;
  });
}

(async () => {
  if (pg.loadModule) await pg.loadModule();
  let total = 0, bad = 0;
  for (const f of files) {
    const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
    const stmts = statements(sql);
    let fileBad = 0;
    for (const s of stmts) {
      total++;
      try {
        await pg.parse(s + ';');
      } catch (e) {
        bad++; fileBad++;
        const probe = s.replace(/^\s*(--.*\n|\/\*[\s\S]*?\*\/\s*)*/, '').slice(0, 50);
        const at = sql.indexOf(probe);
        const line = at < 0 ? '?' : sql.slice(0, at).split('\n').length;
        console.log('\n  SYNTAX ERROR  ' + f + '  near line ' + line);
        console.log('     ' + String(e.message || e).split('\n')[0]);
        console.log('     ' + probe.replace(/\s+/g, ' ').slice(0, 120) + '…');
      }
    }
    console.log('  ' + (fileBad ? 'FAIL' : ' ok ') + '  ' + f.padEnd(42) + String(stmts.length).padStart(3) + ' statements');
  }
  console.log('\n' + '-'.repeat(62));
  console.log(total + ' statements parsed, ' + bad + ' syntax error(s)');
  if (bad) { console.log('\nDo NOT run db push until these are fixed.'); process.exit(1); }
  console.log('Every migration parses cleanly against the real PostgreSQL grammar.');
})();
