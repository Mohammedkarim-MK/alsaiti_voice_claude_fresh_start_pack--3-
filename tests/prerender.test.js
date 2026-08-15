/* The prerendered per-locale pages: does a crawler actually get content, in the right language?
 *
 * Two failures this exists to catch, both silent:
 *
 *   1. Stale output. docs/*.html is generated and COMMITTED, so editing docs/index.html without
 *      re-running tools/prerender.js leaves /es/ and /ar/ serving yesterday's page. Nothing
 *      errors; the site just quietly lies to search engines.
 *   2. Wrong language attributes. docs/index.html is both the source and the English output, so
 *      the generator reads back its own output on every run after the first. The initial version
 *      matched the literal '<html lang="en">', which stops existing after run one — Arabic then
 *      inherited lang="en" dir="ltr" and rendered left-to-right. It worked exactly once.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0; const bad = [];
const ok = (c, name, detail) => {
  if (c) { pass++; console.log('  ok   ' + name); }
  else { bad.push(name + ' — ' + detail); console.log('  FAIL ' + name + ' — ' + detail); }
};

console.log('=== prerendered locale pages ===\n');

/* Every route in every locale. privacy/terms/legal existed only as hash routes before Phase 6 —
   real content, no URL, so nothing a crawler could index or a customer could link to. */
const SEGMENTS = ['', 'privacy/', 'terms/', 'legal/', 'pricing/', 'faq/'];
const CODES = { en: { dir: 'ltr', ogLocale: 'en_GB' }, es: { dir: 'ltr', ogLocale: 'es_ES' }, ar: { dir: 'rtl', ogLocale: 'ar_AE' } };
const LOCALES = [];
for (const seg of SEGMENTS) {
  for (const code of Object.keys(CODES)) {
    LOCALES.push({
      code, seg,
      file: 'docs/' + (code === 'en' ? '' : code + '/') + seg + 'index.html',
      dir: CODES[code].dir, ogLocale: CODES[code].ogLocale,
      url: 'https://alsaitigrowth.com/' + (code === 'en' ? '' : code + '/') + seg,
    });
  }
}

/* A word that must appear in that locale and cannot appear in the others. This is what proves
   the page is genuinely translated rather than English markup under a Spanish URL. */
const MARKER = { en: 'Live demos', es: 'Demos en directo', ar: 'العروض المباشرة' };

for (const L of LOCALES) {
  console.log(L.code.toUpperCase() + ' ' + (L.seg || '/') + ' — ' + L.file);
  const p = path.join(ROOT, L.file);
  if (!fs.existsSync(p)) { ok(false, L.file + ' exists', 'run: node tools/prerender.js'); continue; }
  const html = fs.readFileSync(p, 'utf8');
  const doc = new JSDOM(html).window.document;

  ok(doc.documentElement.getAttribute('lang') === L.code, 'lang="' + L.code + '"',
    'got lang="' + doc.documentElement.getAttribute('lang') + '"');
  ok(doc.documentElement.getAttribute('dir') === L.dir, 'dir="' + L.dir + '"',
    'got dir="' + doc.documentElement.getAttribute('dir') + '" — Arabic must be rtl before any JS runs');

  // The whole point: content in the served HTML.
  const root = doc.getElementById('root');
  const text = root ? root.textContent.replace(/\s+/g, ' ').trim() : '';
  const floor = L.seg === '' ? 2000 : 1000;
  ok(text.length > floor, 'crawlable text in #root (' + text.length + ' chars)',
    'the served HTML is empty — a link-preview bot sees nothing');
  ok(root && root.querySelectorAll('h1,h2,h3').length >= 3, 'real headings present',
    'no headings in the served HTML');

  if (L.seg === '') {
    ok(text.includes(MARKER[L.code]), 'content is actually in ' + L.code.toUpperCase(),
      'expected ' + JSON.stringify(MARKER[L.code]) + ' — this page is not in the language its URL claims');
    for (const other of Object.keys(MARKER).filter((c) => c !== L.code)) {
      ok(!text.includes(MARKER[other]), 'no ' + other.toUpperCase() + ' copy leaked in', 'mixed languages on one page');
    }
  } else {
    /* A legal page must NOT contain the landing page's nav copy — that is what it would look
       like if the app replaced the prerendered content with the home page on boot, which is
       exactly what happens without the path->hash mapping. */
    ok(!text.includes(MARKER[L.code]), 'the route rendered itself, not the landing page',
      'this file contains landing-page copy — prerendering wrote the wrong route');
  }

  const meta = (sel, attr) => { const e = doc.querySelector(sel); return e && e.getAttribute(attr || 'content'); };
  ok(meta('link[rel="canonical"]', 'href') === L.url, 'canonical -> ' + L.url, 'got ' + meta('link[rel="canonical"]', 'href'));
  ok(meta('meta[property="og:url"]') === L.url, 'og:url', 'got ' + meta('meta[property="og:url"]'));
  ok(meta('meta[property="og:locale"]') === L.ogLocale, 'og:locale ' + L.ogLocale, 'got ' + meta('meta[property="og:locale"]'));
  ok(meta('meta[name="twitter:card"]') === 'summary_large_image', 'twitter:card', 'got ' + meta('meta[name="twitter:card"]'));
  ok(meta('meta[property="og:type"]') === 'website', 'og:type', 'missing');

  const alts = [...doc.querySelectorAll('link[rel="alternate"][hreflang]')]
    .map((e) => e.getAttribute('hreflang'));
  for (const h of ['en', 'es', 'ar', 'x-default']) {
    ok(alts.includes(h), 'hreflang ' + h, 'missing — Google cannot connect the three language versions');
  }

  // Description and title must be translated, not the English string reused.
  const desc = meta('meta[name="description"]');
  ok(desc && desc.length > 40, 'has a description', 'missing');
  if (L.code !== 'en') {
    const en = fs.readFileSync(path.join(ROOT, 'docs/index.html'), 'utf8');
    const enDesc = new JSDOM(en).window.document.querySelector('meta[name="description"]').getAttribute('content');
    ok(desc !== enDesc, 'description is translated, not the English one reused',
      'a link shared in ' + L.code.toUpperCase() + ' would preview in English');
    const enTitle = new JSDOM(en).window.document.title;
    ok(doc.title !== enTitle, 'title is translated', 'the English title is reused');
  }
  console.log('');
}

console.log('the committed output is not stale');
{
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools/prerender.js'), '--check'],
      { cwd: ROOT, stdio: 'pipe' });
    pass++; console.log('  ok   prerendered files match docs/index.html');
  } catch {
    bad.push('output is stale');
    console.log('  FAIL prerendered files are STALE — run: node tools/prerender.js');
  }
}

console.log('\npassed: ' + pass);
if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1); }
