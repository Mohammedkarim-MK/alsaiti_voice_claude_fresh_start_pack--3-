/* Handoff §18 / §20.1 — Privacy Policy and Terms must exist, be reachable, and be honest. */
const REPO = require('path').join(__dirname, '..');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const HTML = fs.readFileSync(REPO + '/docs/index.html', 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0; const bad = [];
const ok = (c, id, what) => { if (c) pass++; else bad.push(id + ': ' + what) };

function boot() {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e.message || e)));
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.SpeechSynthesisUtterance = function (t) { this.text = t };
  w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { setTimeout(() => u.onend && u.onend(), 1) } };
  w.Audio = function () { return { play: () => Promise.resolve(), pause() {}, set src(v) {}, get src() { return '' } } };
  w.scrollTo = () => {}; w.scrollBy = () => {};
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
  return { w, errors };
}
const vis = (w) => { const c = w.document.body.cloneNode(true); c.querySelectorAll('script,style').forEach((x) => x.remove()); return c.textContent };

(async () => {
  /* ---- reachable from the footer, not a scroll-to-contact dead end ---- */
  {
    const { w } = boot(); await wait(340);
    w.location.hash = '#/landing'; w.render(); await wait(80);
    const links = [...w.document.querySelectorAll('footer a')];
    const priv = links.find((a) => /privacy|privacidad|خصوصية/i.test(a.textContent || ''));
    const terms = links.find((a) => /terms|términos|الشروط/i.test(a.textContent || ''));
    ok(!!priv, '§20.1', 'no Privacy link in the footer');
    ok(!!terms, '§20.1', 'no Terms link in the footer');
    ok(priv && /#\/privacy/.test(priv.getAttribute('href') || ''), '§20.1', 'Privacy link does not go to a privacy page');
    ok(terms && /#\/terms/.test(terms.getAttribute('href') || ''), '§20.1', 'Terms link does not go to a terms page');
  }

  /* ---- the pages render, publicly, with real content ---- */
  for (const kind of ['privacy', 'terms']) {
    const { w, errors } = boot(); await wait(340);
    w.location.hash = '#/' + kind; w.render(); await wait(80);
    const txt = vis(w);
    ok(errors.length === 0, '§18/' + kind, 'errors: ' + errors.slice(0, 2).join(' | '));
    ok(txt.length > 1500, '§18/' + kind, 'page is too thin to be a real policy (' + txt.length + ' chars)');
    ok(!w.AUTH.session(), '§18/' + kind, 'the page required a session — it must be public');
    ok(/contact@alsaitigrowth\.com/.test(txt), '§18/' + kind, 'no support contact on the page');
    ok(/2026/.test(txt), '§18/' + kind, 'no last-updated date shown');
  }

  /* ---- privacy must cover what §18 requires ---- */
  {
    const { w } = boot(); await wait(340);
    w.location.hash = '#/privacy'; w.render(); await wait(80);
    const txt = vis(w);
    for (const [what, re] of [
      ['what is collected', /what we collect/i],
      ['lawful basis', /lawful basis|legitimate interest/i],
      ['processors', /Supabase/],
      ['retention', /how long we keep|24 months|30 days/i],
      ['rights + regulator', /ico\.org\.uk/i],
      ['local storage', /local storage/i],
      ['the voice demo', /voice demo/i],
    ]) ok(re.test(txt), '§18/privacy', 'does not cover ' + what);
    // it must NOT claim a capability that is not built (§13)
    ok(!/we answer your phone line|live telephone answering service/i.test(txt), '§18/privacy', 'claims live phone answering, which is not built');
  }

  /* ---- terms must be honest about demo vs live and about metered voice ---- */
  {
    const { w } = boot(); await wait(340);
    w.location.hash = '#/terms'; w.render(); await wait(80);
    const txt = vis(w);
    ok(/simulation|sample data/i.test(txt), '§18/terms', 'does not distinguish demo from live');
    ok(/metered|not unlimited/i.test(txt), '§18/terms', 'does not state that voice usage is metered (product rule)');
    ok(/England and Wales/i.test(txt), '§18/terms', 'no governing law');
    ok(!/guarantee.{0,20}(leads|revenue|bookings)/i.test(txt) || /do not guarantee/i.test(txt), '§18/terms', 'appears to guarantee results');
  }

  /* ---- all three languages, no raw keys, correct direction ---- */
  for (const L of ['en', 'es', 'ar']) {
    for (const kind of ['privacy', 'terms']) {
      const { w } = boot(); await wait(340);
      w.setLang(L); w.location.hash = '#/' + kind; w.render(); await wait(80);
      const txt = vis(w);
      ok(txt.length > 1200, 'i18n/' + L + '/' + kind, 'policy did not render (' + txt.length + ' chars)');
      ok(!/\blegal_(updated|back)\b|\bfn_terms\b/.test(txt), 'i18n/' + L + '/' + kind, 'raw translation key leaked');
      if (L === 'ar') ok(w.document.documentElement.getAttribute('dir') === 'rtl', 'i18n/ar/' + kind, 'Arabic policy not rendered right-to-left');
    }
  }

  console.log('=== §18 / §20.1 privacy + terms ===');
  console.log('passed: ' + pass);
  if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1) }
  else console.log('policies present, public and honest');
})();
