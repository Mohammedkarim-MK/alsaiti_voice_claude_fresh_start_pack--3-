/* Lead status, source and urgency — the words on the two screens customers use every day.
 *
 * They were printed straight from the database: a Spanish user's dashboard said "Contacted",
 * "Voice call" and "High" no matter which language they had chosen. Every surrounding label was
 * translated, which is exactly why it went unnoticed — the screen looked finished.
 *
 * The codes themselves are a contract and must not move. They are pinned by a CHECK constraint
 * in SQL, they are the product vocabulary in CLAUDE.md, and the badge colours key off them
 * (.b-New, .b-Contacted). So this suite checks both halves: that the label is translated, and
 * that the code underneath it never is. Translating the code would write Spanish into the status
 * column and be rejected by the constraint on the next save.
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

console.log('=== lead vocabulary in EN, ES and AR ===\n');

const w = new JSDOM(SRC, { runScripts: 'dangerously', url: 'https://alsaitigrowth.com/' }).window;
ok(typeof w.lv === 'function', 'lv() exists', 'codes would print raw');
if (!w.lv) { console.log('\ncannot continue'); process.exit(1); }

console.log('the vocabulary comes from SQL, not from a copied list');
{
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '0001_foundation.sql'), 'utf8');
  const grab = (col) => {
    const m = new RegExp(col + "\\s+text[^,]*?check \\(" + col + "\\s+in \\(([^)]*)\\)", 'i').exec(sql);
    return m ? m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean) : [];
  };
  const statuses = grab('status');
  const sources = grab('source');
  ok(statuses.length === 7, 'read ' + statuses.length + ' statuses from SQL', 'expected the 7 documented statuses');
  ok(sources.length === 6, 'read ' + sources.length + ' sources from SQL', 'expected the 6 documented sources');

  for (const code of statuses.concat(sources).concat(['High', 'Medium', 'Low'])) {
    for (const lang of ['es', 'ar']) {
      w.LANG = lang;
      const label = w.lv(code);
      /* Three codes are deliberately identical to their English form, and this list is the
         record of that decision rather than a hole in the check:
           API, CRM — acronyms, written as-is in Spanish and Arabic business software alike.
                      The Arabic expansions exist but are long enough to break a compact
                      source badge, and nobody reads "CRM" as English.
           Spam     — the loanword in Spanish. Arabic does NOT get the exemption: it is
                      translated to غير مرغوب, and this check would fail if that were dropped. */
      const DELIBERATELY_SAME = { es: ['API', 'CRM', 'Spam'], ar: ['API', 'CRM'] };
      const sameIsFine = DELIBERATELY_SAME[lang].includes(code);
      ok(label !== code || sameIsFine,
        code + ' → "' + label + '" in ' + lang.toUpperCase(),
        'still the English code — this shows on the dashboard');
    }
  }
  w.LANG = 'en';
  for (const code of statuses) {
    ok(w.lv(code) === code, code + ' is unchanged in English', 'the English path regressed');
  }
}

console.log('\nthe code underneath is never translated');
{
  // The badge class must stay the English code or the colour is lost.
  ok(/class="badge b-'\+esc\(l\.status\)\+'">'\+esc\(lv\(l\.status\)\)/.test(SRC),
    'badge keeps the English class and translates only the label',
    'either the colour breaks or the label stays English');

  // Selects must carry an explicit English value.
  ok(/URGENCIES\.map\(function\(u\)\{return '<option value="'\+esc\(u\)/.test(SRC),
    'urgency options carry their English value', 'choosing an urgency in Spanish would save Spanish');
  ok(/SOURCES\.map\(function\(s\)\{return '<option value="'\+esc\(s\)/.test(SRC),
    'source options carry their English value', 'choosing a source in Spanish would save Spanish');

  ok(!/>'\+u\+'<\/option>/.test(SRC) && !/>'\+s\+'<\/option>/.test(SRC),
    'no select still prints a bare code as its label', '');
}

console.log('\nsearch matches the word the user can actually see');
{
  /* Someone reading "Contactado" will type "Contactado". If only the English code were indexed,
     search would silently return nothing for the very word on screen. */
  ok(/lv\(l\.source\),lv\(l\.urgency\),lv\(l\.status\)/.test(SRC.replace(/\s+/g, '')),
    'the translated forms are in the search haystack',
    'searching for the visible word would find nothing');
  ok(/l\.source,l\.urgency/.test(SRC.replace(/\s+/g, '')),
    'the English codes are still indexed too',
    'an English-speaking user, or a saved query, would stop matching');
}

console.log('\nunknown and empty codes are safe');
{
  w.LANG = 'es';
  ok(w.lv('Archived') === 'Archived', 'an unknown status falls back to its code',
    'a status added server-side would render blank');
  ok(w.lv(null) === '' && w.lv(undefined) === '', 'null and undefined render empty',
    'the list would print "null"');
  w.LANG = 'en';
}

console.log('\nboth dictionaries cover the same codes');
{
  const es = Object.keys(w.LEADV_TR.es || {});
  const ar = Object.keys(w.LEADV_TR.ar || {});
  ok(es.length === 16, 'ES covers ' + es.length + ' codes', '7 statuses + 6 sources + 3 urgencies expected');
  ok(es.filter((k) => !(k in w.LEADV_TR.ar)).length === 0, 'nothing is Spanish-only', '');
  ok(ar.filter((k) => !(k in w.LEADV_TR.es)).length === 0, 'nothing is Arabic-only', '');
}

console.log('\nthe two the static checks missed');
{
  /* Both of these passed every source-level check and still showed English on the screen. The
     Spanish leads list read "Llamada de voz · Alta · Yesterday" — one word translated, one not —
     and it was only visible by rendering the real page and reading it. Hence these assertions. */

  // srcIcon() prints the source label next to its icon, separately from the badge.
  for (const lang of ['es', 'ar']) {
    w.LANG = lang;
    const html = w.srcIcon('Voice call');
    const text = html.replace(/<[^>]*>/g, '');
    ok(text !== 'Voice call' && text.length > 0,
      'srcIcon is translated in ' + lang.toUpperCase() + ' ("' + text + '")',
      'the leads list still prints the English source beside the icon');
  }
  w.LANG = 'en';
  ok(w.srcIcon('Voice call').replace(/<[^>]*>/g, '') === 'Voice call', 'srcIcon unchanged in English', '');

  // ago() returned English phrases in every language.
  const now = Date.now();
  const cases = [[30e3, 'now'], [5 * 60e3, 'minutes'], [3 * 3600e3, 'hours'],
                 [26 * 3600e3, 'yesterday'], [5 * 86400e3, 'days']];
  const en = {};
  w.LANG = 'en';
  for (const [ms, key] of cases) en[key] = w.ago(now - ms);
  for (const lang of ['es', 'ar']) {
    w.LANG = lang;
    for (const [ms, key] of cases) {
      const got = w.ago(now - ms);
      ok(got !== en[key], 'ago/' + key + ' is translated in ' + lang.toUpperCase() + ' ("' + got + '")',
        'the leads list shows an English relative time');
    }
  }
  w.LANG = 'en';

  // The number has to survive interpolation — an untranslated {n} would read literally.
  for (const lang of ['en', 'es', 'ar']) {
    w.LANG = lang;
    const five = w.ago(now - 5 * 60e3);
    ok(/5/.test(five) && !/\{n\}/.test(five),
      'the count appears in ' + lang.toUpperCase() + ' ("' + five + '")',
      'the placeholder was not filled');
  }
  w.LANG = 'en';

  /* ago()'s parameter used to be named `t`, which shadowed the translation function and made
     the first version of this fix throw on every call. */
  ok(!/function ago\(t\)/.test(SRC), 'ago() does not shadow t()',
    'the timestamp parameter shadows the translation function');
}

console.log('\npassed: ' + pass);
if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1); }
