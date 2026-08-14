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

const LOCALES = [
  { code: 'en', file: 'docs/index.html',    dir: 'ltr', url: 'https://alsaitigrowth.com/',    ogLocale: 'en_GB' },
  { code: 'es', file: 'docs/es/index.html', dir: 'ltr', url: 'https://alsaitigrowth.com/es/', ogLocale: 'es_ES' },
  { code: 'ar', file: 'docs/ar/index.html', dir: 'rtl', url: 'https://alsaitigrowth.com/ar/', ogLocale: 'ar_AE' },
];

/* A word that must appear in that locale and cannot appear in the others. This is what proves
   the page is genuinely translated rather than English markup under a Spanish URL. */
const MARKER = { en: 'Live demos', es: 'Demos en directo', ar: 'العروض المباشرة' };

for (const L of LOCALES) {
  console.log(L.code.toUpperCase() + ' — ' + L.file);
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
  ok(text.length > 2000, 'crawlable text in #root (' + text.length + ' chars)',
    'the served HTML is empty — a link-preview bot sees nothing');
  ok(root && root.querySelectorAll('h1,h2,h3').length >= 3, 'real headings present',
    'no headings in the served HTML');

  ok(text.includes(MARKER[L.code]), 'content is actually in ' + L.code.toUpperCase(),
    'expected to find ' + JSON.stringify(MARKER[L.code]) + ' — this page is not in the language its URL claims');
  for (const other of Object.keys(MARKER).filter((c) => c !== L.code)) {
    ok(!text.includes(MARKER[other]), 'no ' + other.toUpperCase() + ' copy leaked in', 'mixed languages on one page');
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
