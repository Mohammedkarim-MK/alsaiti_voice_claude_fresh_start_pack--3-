/* The onboarding wizard, in all three languages.
 *
 * It shipped entirely in English. Every other screen was translated, so the gap was invisible
 * from the outside: a Spanish customer signed up in Spanish, was greeted in Spanish, and then
 * hit twelve steps of English at the exact moment they were being asked to describe their own
 * business. That is the worst possible place to lose someone.
 *
 * Two things are checked here, and the second is the one that will catch a future mistake:
 *   1. every string the wizard displays has a Spanish and an Arabic entry;
 *   2. translating a <select> label never changes the value that gets STORED. The options are
 *      answers — 'Dental clinic' is written into the onboarding record. If the label and the
 *      value were the same string, choosing an industry in Spanish would save Spanish, and the
 *      `o===obVal(name)` comparison would stop matching the next time the step was opened. The
 *      answer would silently read as unset.
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

console.log('=== onboarding: EN, ES and AR ===\n');

const w = new JSDOM(SRC, { runScripts: 'dangerously', url: 'https://alsaitigrowth.com/' }).window;

ok(typeof w.obT === 'function', 'obT exists', 'the wizard has no translation path at all');
ok(!!w.OB2_TR, 'the dictionary exists', '');
if (!w.obT) { console.log('\ncannot continue'); process.exit(1); }

// The wizard reads OB.answers directly and throws without it. Rendering a step against a real
// (empty) answer set is the only way to see what a new customer actually sees.
w.OB = { answers: { services: [] }, step: 0, test: null };

const strip = (h) => String(h)
  .replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

const render = (lang) => {
  w.LANG = lang;
  let out = '';
  let threw = 0;
  for (let i = 0; i < 12; i++) {
    try { out += ' ' + strip(w.obStepHtml(i)); } catch (e) { threw++; }
  }
  return { text: out, threw };
};

console.log('every step renders in every language');
{
  for (const lang of ['en', 'es', 'ar']) {
    const r = render(lang);
    ok(r.threw === 0, 'all 12 steps render in ' + lang.toUpperCase(),
      r.threw + ' threw — a translation broke the wizard');
    ok(r.text.length > 1500, lang.toUpperCase() + ' produces real content (' + r.text.length + ' chars)',
      'the wizard rendered almost nothing');
  }
}

console.log('\nno English copy survives into ES or AR');
{
  /* Brand and product names are supposed to appear untranslated, and Spanish genuinely shares
     some words with English. Anything else shared with the English render is a missed string. */
  const ALLOWED = new Set(['alsaiti', 'voice', 'english', 'espa', 'byoc', 'generic', 'webhook',
    'hubspot', 'pipedrive', 'gohighlevel', 'dental', 'formal', 'chat', 'widget', 'popular']);
  const words = (lang) => new Set((render(lang).text.match(/[A-Za-z]{4,}/g) || []).map((x) => x.toLowerCase()));
  const en = words('en');
  for (const lang of ['es', 'ar']) {
    const leaked = [...words(lang)].filter((x) => en.has(x) && !ALLOWED.has(x));
    ok(leaked.length === 0, 'no untranslated words in ' + lang.toUpperCase(),
      'still English: ' + leaked.join(', '));
  }
  w.LANG = 'en';
}

console.log('\ntranslating a label never changes the stored value');
{
  const OPTS = ['Dental clinic', 'Real estate', 'Missed calls only'];
  for (const lang of ['es', 'ar']) {
    w.LANG = lang;
    const html = w.obSelF('Industry', 'industry', OPTS);
    for (const o of OPTS) {
      ok(html.includes('value="' + o + '"'), o + ' keeps its English value in ' + lang.toUpperCase(),
        'the stored answer would change with the display language');
      ok(!html.includes('>' + o + '</option>'), o + ' is shown translated in ' + lang.toUpperCase(),
        'the label was not translated');
    }
  }
  w.LANG = 'en';
  const enHtml = w.obSelF('Industry', 'industry', OPTS);
  for (const o of OPTS) {
    ok(enHtml.includes('value="' + o + '">' + o + '</option>'),
      o + ' is unchanged in English', 'the English path regressed');
  }
}

console.log('\nfield names are never translated');
{
  /* The second argument is the answer key. If it ever went through obT, a translation would
     rename the key and orphan every answer already saved under the old one. */
  for (const lang of ['es', 'ar']) {
    w.LANG = lang;
    for (const [html, name] of [
      [w.obInput('Company name', 'business_name', 'Bright Smile Dental'), 'business_name'],
      [w.obArea('What does your company do?', 'business_description', ''), 'business_description'],
      [w.obTog('We have more than one location', 'has_multiple_locations'), 'has_multiple_locations'],
    ]) {
      ok(html.includes("'" + name + "'"), name + ' survives ' + lang.toUpperCase() + ' untouched',
        'the answer key was translated — saved answers would be orphaned');
    }
  }
  w.LANG = 'en';
}

console.log('\nan unknown string degrades to English rather than to blank');
{
  w.LANG = 'es';
  ok(w.obT('A field added next week') === 'A field added next week',
    'a new untranslated string still renders', 'it would render blank');
  ok(w.obT('') === '', 'empty stays empty', '');
  w.LANG = 'en';
}

console.log('\nboth dictionaries cover the same strings');
{
  const es = Object.keys(w.OB2_TR.es || {});
  const ar = Object.keys(w.OB2_TR.ar || {});
  ok(es.length > 100, 'ES has ' + es.length + ' entries', 'suspiciously small');
  const onlyEs = es.filter((k) => !(k in (w.OB2_TR.ar || {})));
  const onlyAr = ar.filter((k) => !(k in (w.OB2_TR.es || {})));
  ok(onlyEs.length === 0, 'nothing is Spanish-only', 'missing from AR: ' + onlyEs.join(', '));
  ok(onlyAr.length === 0, 'nothing is Arabic-only', 'missing from ES: ' + onlyAr.join(', '));
}

console.log('\npassed: ' + pass);
if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1); }
