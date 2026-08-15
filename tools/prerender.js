/* Build the per-locale HTML that crawlers and link-preview bots actually read.
 *
 *   node tools/prerender.js            regenerate
 *   node tools/prerender.js --check    exit 1 if the output is stale (used by CI)
 *
 * The problem this solves: docs/index.html served an empty <div id="root"> and built every
 * screen from one inline script. Google can run JS, slowly and unreliably; WhatsApp, LinkedIn,
 * Slack and iMessage cannot run it at all. And Spanish and Arabic had no URL of their own — a
 * runtime language switch is invisible to a search engine and impossible to share, which for a
 * product sold on being trilingual meant two thirds of the positioning did not exist online.
 *
 * How: run the app's own landing() under jsdom once per locale and write the result into the
 * marked region of #root. No second copy of the markup, no template to keep in step — the
 * prerendered HTML is by construction the same markup the app renders, because it IS the app
 * rendering it. When the script boots, render() replaces the region with identical output, so
 * there is no flash and nothing to hydrate.
 *
 * Output is COMMITTED rather than built on the host. That means Cloudflare Pages needs no build
 * command and no configuration change, and if this script ever breaks, the last good HTML stays
 * live. The cost is that the output can drift from the source, which is what --check is for.
 *
 * No new dependency: jsdom is already in tests/ for the suite.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'index.html');
const ORIGIN = 'https://alsaitigrowth.com';
const CHECK = process.argv.includes('--check');

let JSDOM;
try {
  ({ JSDOM } = require(path.join(ROOT, 'tests', 'node_modules', 'jsdom')));
} catch {
  console.error('jsdom not found. Run:  cd tests && npm install');
  process.exit(2);
}

/* Locale copy. Translated per locale rather than reused — a shared Arabic link that previews in
   English is a broken first impression, and it is the exact thing the product claims to fix. */
const LOCALES = {
  en: {
    dir: 'ltr', ogLocale: 'en_GB', out: 'docs/index.html', url: ORIGIN + '/',
    title: 'Alsaiti Growth — AI receptionist & lead dashboard',
    description: 'Alsaiti Growth — AI receptionists & lead systems that turn enquiries into booked clients. Live trilingual demo (EN / ES / AR).',
    ogDescription: 'AI systems that answer calls, capture leads, follow up automatically, and show everything in a live dashboard.',
  },
  es: {
    dir: 'ltr', ogLocale: 'es_ES', out: 'docs/es/index.html', url: ORIGIN + '/es/',
    title: 'Alsaiti Growth — recepcionista con IA y panel de clientes potenciales',
    description: 'Alsaiti Growth — recepcionistas con IA y sistemas de captación que convierten consultas en clientes con cita. Demo trilingüe en directo (EN / ES / AR).',
    ogDescription: 'Sistemas de IA que atienden llamadas, captan clientes potenciales, hacen el seguimiento automáticamente y lo muestran todo en un panel en directo.',
  },
  ar: {
    dir: 'rtl', ogLocale: 'ar_AE', out: 'docs/ar/index.html', url: ORIGIN + '/ar/',
    title: 'Alsaiti Growth — موظف استقبال بالذكاء الاصطناعي ولوحة العملاء المحتملين',
    description: 'Alsaiti Growth — موظفو استقبال بالذكاء الاصطناعي وأنظمة التقاط العملاء تحوّل الاستفسارات إلى مواعيد مؤكدة. عرض حي بثلاث لغات (إنجليزي / إسباني / عربي).',
    ogDescription: 'أنظمة ذكاء اصطناعي تردّ على المكالمات وتلتقط العملاء المحتملين وتتابعهم تلقائيًا وتعرض كل شيء في لوحة تحكم مباشرة.',
  },
};

/* Routes, not just locales. Everything below is generated as <locale>/<segment>/index.html.
   privacy/terms/legal already existed with real, translated content — but only as hash routes,
   which have no URL, so a crawler could not index them and nobody could link to one. Their
   titles come from the app's own LEGAL tables, which are already translated, rather than being
   restated here where they would drift. */
const ROUTES = [
  { seg: '',         render: (w) => w.landing(),            title: null },
  { seg: 'privacy/', render: (w) => w.legalPage('privacy'), title: (w) => (w.LEGAL[w.LANG] || w.LEGAL.en).privacy.title },
  { seg: 'terms/',   render: (w) => w.legalPage('terms'),   title: (w) => (w.LEGAL[w.LANG] || w.LEGAL.en).terms.title },
  { seg: 'legal/',   render: (w) => w.legalPage('legal'),   title: (w) => (w.LEGAL_NOTICE[w.LANG] || w.LEGAL_NOTICE.en).title },
  { seg: 'pricing/', render: (w) => w.pricingPage(),        title: (w) => (w.PRICING_TR[w.LANG] || w.PRICING_TR.en).h1 },
  { seg: 'faq/',     render: (w) => w.faqPage(),            title: (w) => (w.FAQ_TR[w.LANG] || w.FAQ_TR.en).h1 },
];

/* Per-route, per-locale descriptions. Written out rather than derived: a description is sales
   copy, and truncating the first paragraph of a privacy policy makes a bad search result. */
const ROUTE_DESC = {
  'privacy/': {
    en: 'How Alsaiti Growth collects, uses and stores personal data from enquiries, calls and the lead dashboard, and the rights you have over it.',
    es: 'Cómo Alsaiti Growth recopila, utiliza y almacena los datos personales de consultas, llamadas y el panel de clientes potenciales, y qué derechos tiene usted sobre ellos.',
    ar: 'كيف يجمع Alsaiti Growth البيانات الشخصية من الاستفسارات والمكالمات ولوحة العملاء المحتملين ويستخدمها ويخزّنها، وما حقوقك تجاهها.',
  },
  'terms/': {
    en: 'The terms that apply when you use Alsaiti Growth: plans and fees, what is included, what a Demo label means, and how to cancel.',
    es: 'Las condiciones aplicables al uso de Alsaiti Growth: planes y tarifas, qué se incluye, qué significa la etiqueta Demo y cómo cancelar.',
    ar: 'الشروط التي تسري عند استخدام Alsaiti Growth: الخطط والرسوم، وما هو مشمول، ومعنى وسم Demo، وكيفية الإلغاء.',
  },
  'legal/': {
    en: 'Company information for Alsaiti Growth: registered details, data protection registration, complaints and governing law.',
    es: 'Información de la empresa Alsaiti Growth: datos registrales, registro de protección de datos, reclamaciones y legislación aplicable.',
    ar: 'معلومات شركة Alsaiti Growth: بيانات التسجيل، وتسجيل حماية البيانات، والشكاوى، والقانون الواجب التطبيق.',
  },
  'pricing/': {
    en: 'Alsaiti Growth pricing: three plans, monthly or annual with 20% off, each including the trilingual AI receptionist and the lead dashboard. Voice minutes are metered.',
    es: 'Precios de Alsaiti Growth: tres planes, mensual o anual con un 20% de descuento, todos con el recepcionista con IA trilingüe y el panel de clientes potenciales. Los minutos de voz son medidos.',
    ar: 'أسعار Alsaiti Growth: ثلاث خطط، شهرية أو سنوية بخصم 20%، وكلها تشمل موظف الاستقبال الذكي بثلاث لغات ولوحة العملاء المحتملين. ودقائق الصوت محتسبة.',
  },
  'faq/': {
    en: 'Answers on call recordings, where your data is stored, the languages supported, setup time and cancellation — the questions buyers ask before signing.',
    es: 'Respuestas sobre grabaciones de llamadas, dónde se almacenan sus datos, los idiomas admitidos, el tiempo de puesta en marcha y la cancelación: lo que preguntan los clientes antes de firmar.',
    ar: 'إجابات عن تسجيلات المكالمات، وأين تُخزَّن بياناتك، واللغات المدعومة، ومدة الإعداد، والإلغاء — الأسئلة التي يطرحها المشترون قبل التوقيع.',
  },
};

/* One place that knows how a (locale, route) pair becomes a URL and a file. English lives at the
   root with no locale segment, so /privacy/ and /es/privacy/ are siblings rather than /en/ being
   a fourth copy of everything — a duplicate that would then need its own canonical. */
const urlFor  = (code, seg) => ORIGIN + '/' + (code === 'en' ? '' : code + '/') + seg;
const fileFor = (code, seg) => 'docs/' + (code === 'en' ? '' : code + '/') + seg + 'index.html';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* og:image is emitted only when the file exists. A tag pointing at a 404 is worse than no tag:
   the bot fetches it, fails, and some caches remember the failure. Phase 4 creates the file. */
function ogImage() {
  const rel = 'og-image.png';
  return fs.existsSync(path.join(ROOT, 'docs', rel))
    ? `\n<meta property="og:image" content="${ORIGIN}/${rel}"/>` +
      `\n<meta property="og:image:width" content="1200"/>` +
      `\n<meta property="og:image:height" content="630"/>` +
      `\n<meta name="twitter:image" content="${ORIGIN}/${rel}"/>`
    : '\n<!-- og:image omitted: docs/og-image.png does not exist yet (Phase 4). A tag pointing\n     at a 404 is worse than no tag, because some preview caches remember the failure. -->';
}

function metaBlock(code, route) {
  const L = LOCALES[code];
  const seg = route.seg;
  const url = urlFor(code, seg);
  /* Route-specific where one exists, falling back to the locale's own. A description is sales
     copy; truncating the first paragraph of a privacy policy makes a poor search result. */
  const desc = (ROUTE_DESC[seg] && ROUTE_DESC[seg][code]) || L.description;
  /* Alternates point at the SAME route in each language, not at each language's home page.
     hreflang is a statement that two URLs are translations of each other — pointing /es/privacy/
     at the Spanish landing page would be false, and Google drops the whole cluster when it is. */
  const alternates = Object.keys(LOCALES)
    .map((c) => `<link rel="alternate" hreflang="${c}" href="${urlFor(c, seg)}"/>`)
    .concat([`<link rel="alternate" hreflang="x-default" href="${urlFor('en', seg)}"/>`])
    .join('\n');
  const otherLocales = Object.keys(LOCALES).filter((c) => c !== code)
    .map((c) => `<meta property="og:locale:alternate" content="${LOCALES[c].ogLocale}"/>`).join('\n');

  return [
    `<meta name="description" content="${esc(desc)}"/>`,
    `<link rel="canonical" href="${url}"/>`,
    alternates,
    `<meta property="og:type" content="website"/>`,
    `<meta property="og:url" content="${url}"/>`,
    `<meta property="og:site_name" content="Alsaiti Growth"/>`,
    `<meta property="og:locale" content="${L.ogLocale}"/>`,
    otherLocales,
    `<meta property="og:title" content="${esc(L.title)}"/>`,
    `<meta property="og:description" content="${esc(L.ogDescription)}"/>`,
    `<meta name="twitter:card" content="summary_large_image"/>`,
    `<meta name="twitter:title" content="${esc(L.title)}"/>`,
    `<meta name="twitter:description" content="${esc(L.ogDescription)}"/>`,
  ].join('\n') + ogImage();
}

function replaceBetween(html, startMark, endMark, body) {
  const i = html.indexOf(startMark), j = html.indexOf(endMark);
  if (i < 0 || j < 0) throw new Error('markers not found: ' + startMark);
  return html.slice(0, i + startMark.length) + body + html.slice(j);
}

function build(code, route, source) {
  const L = LOCALES[code];
  const url = urlFor(code, route.seg);

  /* Swallow jsdom's "Not implemented" notices. Setting location.hash on boot fires a hashchange,
     which calls window.scrollTo — real in a browser, absent in jsdom. Left alone it prints a
     stack trace per page, and a build that emits thirty stack traces is one where nobody notices
     the thirty-first that actually matters. Genuine exceptions still propagate and fail the run. */
  const { VirtualConsole } = require(path.join(ROOT, 'tests', 'node_modules', 'jsdom'));
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    if (!/Not implemented/.test(String(e && e.message))) throw e;
  });

  // Render this route, in this locale, using the app's own render functions.
  const dom = new JSDOM(source, { runScripts: 'dangerously', url, virtualConsole: vc });
  const w = dom.window;
  w.LANG = code;
  if (typeof w.applyDir === 'function') w.applyDir();
  const body = route.render(w);
  /* A legal page is far shorter than the landing page, so the floor is low. It exists only to
     catch a render that returned nothing — the failure that would otherwise publish a blank page
     and still report a successful build. */
  if (!body || body.length < 1200) {
    throw new Error(`${route.seg || '/'} returned ${body ? body.length : 0} bytes for ${code} — refusing to write a near-empty page`);
  }
  const title = route.title ? route.title(w) : L.title;

  let out = source;
  /* Match the whole tag, not the literal '<html lang="en">'. docs/index.html is both the source
     AND the English output, so the first run rewrites it to '<html lang="en" dir="ltr">' — and a
     literal match then finds nothing on every subsequent run, silently leaving Arabic as
     lang="en" dir="ltr". It worked exactly once. An idempotent generator has to survive reading
     back its own output. */
  const htmlTag = /<html\b[^>]*>/;
  if (!htmlTag.test(out)) throw new Error('no <html> tag found in the source');
  out = out.replace(htmlTag, `<html lang="${code}" dir="${L.dir}">`);
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  out = replaceBetween(out, '<!-- LOCALE-META:START -->', '<!-- LOCALE-META:END -->',
                       '\n' + metaBlock(code, route) + '\n');
  out = replaceBetween(out, '<!--PRERENDER:START-->', '<!--PRERENDER:END-->', body);

  /* Sub-locale files sit one directory down, so root-relative asset paths still resolve — but
     _headers and 404.html are served from the root by Cloudflare regardless of directory. */
  return out;
}

// The English file is both source and output, so read it once before writing anything.
const source = fs.readFileSync(SRC, 'utf8');
if (!source.includes('<!--PRERENDER:START-->')) {
  console.error('docs/index.html has no PRERENDER markers. Was it reverted?');
  process.exit(2);
}

let stale = 0;
for (const route of ROUTES) {
  for (const code of Object.keys(LOCALES)) {
    const rel = fileFor(code, route.seg);
    const target = path.join(ROOT, rel);
    const built = build(code, route, source);
    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;

    if (CHECK) {
      if (existing !== built) { stale++; console.log('  STALE  ' + rel); }
      else console.log('  ok     ' + rel);
      continue;
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, built);
    const text = new JSDOM('<div>' + built.slice(built.indexOf('<!--PRERENDER:START-->'),
      built.indexOf('<!--PRERENDER:END-->')) + '</div>').window.document.body.textContent
      .replace(/\s+/g, ' ').trim();
    console.log(`  wrote  ${rel.padEnd(30)} ${String(Math.round(built.length / 1024)).padStart(4)} KB   ${String(text.length).padStart(5)} chars crawlable`);
  }
}

/* sitemap.xml and robots.txt are generated here rather than hand-written, so they cannot drift
   from the locale list above. Adding a fourth language should mean editing LOCALES and nothing
   else. */
function sitemap() {
  const entries = [];
  for (const route of ROUTES) {
    for (const code of Object.keys(LOCALES)) {
      /* xhtml:link alternates inside each <url> is the form Google documents for multilingual
         sitemaps: every entry lists every language INCLUDING itself, so each is a complete
         statement of the set rather than a fragment that has to be joined up. */
      const alts = Object.keys(LOCALES)
        .map((c) => `    <xhtml:link rel="alternate" hreflang="${c}" href="${urlFor(c, route.seg)}"/>`)
        .concat([`    <xhtml:link rel="alternate" hreflang="x-default" href="${urlFor('en', route.seg)}"/>`])
        .join('\n');
      /* The home page outranks the legal pages, and English outranks the translations only
         because it is the default — not because the others matter less. */
      const priority = route.seg === '' ? (code === 'en' ? '1.0' : '0.9') : '0.5';
      entries.push(`  <url>\n    <loc>${urlFor(code, route.seg)}</loc>\n${alts}\n    <changefreq>${route.seg === '' ? 'weekly' : 'monthly'}</changefreq>\n    <priority>${priority}</priority>\n  </url>`);
    }
  }
  const urls = entries.join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

/* Without our own file, Cloudflare serves a default content-signals robots.txt as text/html,
   with no Sitemap: line. Ours replaces it. Nothing is disallowed: the app screens live behind
   hash routes, which crawlers do not fetch as separate URLs anyway, so a Disallow would buy
   nothing and risks blocking something we later want indexed. */
function robots() {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    'Sitemap: ' + ORIGIN + '/sitemap.xml',
    '',
  ].join('\n');
}

for (const [rel, body] of [['docs/sitemap.xml', sitemap()], ['docs/robots.txt', robots()]]) {
  const target = path.join(ROOT, rel);
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (CHECK) {
    if (existing !== body) { stale++; console.log('  STALE  ' + rel); }
    else console.log('  ok     ' + rel);
  } else {
    fs.writeFileSync(target, body);
    console.log('  wrote  ' + rel);
  }
}

if (CHECK) {
  if (stale) {
    console.log(`\n${stale} file(s) stale. docs/index.html changed without regenerating.`);
    console.log('Run:  node tools/prerender.js');
    process.exit(1);
  }
  console.log('\nPrerendered output matches the source.');
}
