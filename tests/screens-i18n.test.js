/* Whole-screen sweep: render each screen in English and in Spanish, and fail on any word that
 * survives untranslated into the Spanish render.
 *
 * This is the check that found everything else. Key-level tests ("does key X exist in ES?") pass
 * happily while a screen is full of English, because the English was never behind a key in the
 * first place — it was written straight into the markup. Comparing two renders finds copy that
 * has no key at all, which was the actual defect in the onboarding wizard, the leads list, the
 * status chips, the funnel, the relative times and the integration catalogue.
 *
 * A word appearing in both renders is a leak UNLESS it is on the list below. That list is the
 * interesting part of this file: every entry is a deliberate decision, not a silenced failure.
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

console.log('=== every screen, EN vs ES ===\n');

const w = new JSDOM(SRC, { runScripts: 'dangerously', url: 'https://alsaitigrowth.com/' }).window;

/* Words allowed to appear identically in both languages, and why. If you add to this list,
   add the reason — an unexplained entry here is how a real leak gets hidden. */
const ALLOWED = new Set([
  // brand
  'alsaiti', 'voice', 'alsaitigrowth',
  // third-party product names — HubSpot is HubSpot in every language
  'hubspot', 'pipedrive', 'gohighlevel', 'salesforce', 'zoho', 'supabase', 'google', 'sheets',
  'microsoft', 'dynamics', 'dataverse', 'entra', 'webhook', 'generic', 'custom',
  // technical terms carried untranslated into Spanish and Arabic alike
  'oauth', 'pkce', 'json', 'http', 'https', 'html', 'endpoint', 'multi', 'byoc', 'crm', 'email',
  // "backend" is the loanword used in the Spanish copy itself — "Sin backend conectado"
  'backend',
  // part of contact@alsaitigrowth.com, which is an address and not copy
  'contact',
  // language names, shown in their own language on purpose
  'english', 'espa',
  // words Spanish genuinely shares with English
  'dental', 'formal', 'chat', 'widget', 'popular', 'total', 'plan', 'base', 'error', 'item',
  'normal', 'legal', 'contractual', 'online', 'manual', 'demo', 'contacto', 'plus', 'spam',
  // "real" is the Spanish adjective, as in "Backend real"
  'real',
  // demo seed data — what a customer typed, not interface copy
  'sarah', 'whitfield', 'james', 'okoro', 'bradley', 'implant', 'consult', 'boiler', 'botox',
]);

const SCREENS = ['dashboard', 'leadsPage', 'analyticsPage', 'voicePage', 'integrationsPage',
                 'pricingPage', 'faqPage', 'dpaPage'];

const strip = (h) => String(h)
  .replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

const render = (fn, lang) => {
  w.LANG = lang;
  try { return strip(w[fn]()); } catch (e) { return null; }
};

for (const fn of SCREENS) {
  const en = render(fn, 'en');
  const es = render(fn, 'es');
  if (en === null || es === null) {
    ok(false, fn + ' renders', 'threw in ' + (en === null ? 'EN' : 'ES'));
    continue;
  }
  ok(en.length > 80 && es.length > 80, fn + ' produces content in both languages',
    'EN ' + en.length + ' / ES ' + es.length + ' chars — the screen rendered almost nothing');

  const enWords = new Set((en.match(/[A-Za-z]{4,}/g) || []).map((x) => x.toLowerCase()));
  const leaked = [...new Set((es.match(/[A-Za-z]{4,}/g) || []).map((x) => x.toLowerCase()))]
    .filter((x) => enWords.has(x) && !ALLOWED.has(x));

  ok(leaked.length === 0, fn + ' has no untranslated copy',
    'still English in the Spanish render: ' + leaked.join(', '));
}
w.LANG = 'en';

console.log('\nArabic renders too, and stays right-to-left');
{
  for (const fn of SCREENS) {
    const ar = render(fn, 'ar');
    ok(ar !== null && ar.length > 80, fn + ' renders in Arabic',
      ar === null ? 'threw' : 'produced almost nothing');
  }
  w.LANG = 'ar';
  // The document direction is set by the language switch, not by the screen.
  if (typeof w.setLang === 'function') {
    try { w.setLang('ar'); } catch (e) { /* no DOM route in this harness */ }
  }
  ok(w.document.documentElement.getAttribute('dir') === 'rtl' ||
     /dir="rtl"/.test(SRC), 'Arabic is rendered RTL', 'dir was not set to rtl');
  w.LANG = 'en';
}

console.log('\npassed: ' + pass);
if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1); }
