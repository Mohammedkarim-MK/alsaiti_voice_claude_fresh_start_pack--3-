/* §14.2 — the auth screens must render in the active language, with no English left behind. */
const REPO = require('path').join(__dirname, '..');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const HTML = fs.readFileSync(REPO + '/docs/index.html', 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0; const bad = [];
const ok = (c, id, w) => { if (c) pass++; else bad.push(id + ': ' + w) };

function boot() {
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.SpeechSynthesisUtterance = function (t) { this.text = t };
  w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { setTimeout(() => u.onend && u.onend(), 1) } };
  w.Audio = function () { return { play: () => Promise.resolve(), pause() {}, set src(v) {}, get src() { return '' } } };
  w.scrollTo = () => {}; w.scrollBy = () => {};
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
  return w;
}
const vis = (w) => { const c = w.document.body.cloneNode(true); c.querySelectorAll('script,style').forEach((x) => x.remove()); return c.textContent };

/* English phrases that must NOT survive a language switch. */
const ENGLISH = [/Welcome back/i, /Sign in to your lead dashboard/i, /Create your account/i,
                 /Your name/i, /Business name/i, /Your password/i, /Have an account/i, /New here/i];

(async () => {
  for (const L of ['es', 'ar']) {
    const w = boot(); await wait(340); w.setLang(L);
    for (const screen of ['login', 'signup']) {
      w.location.hash = '#/' + screen; w.render(); await wait(50);
      const txt = vis(w);
      const leak = ENGLISH.find((re) => re.test(txt));
      ok(!leak, 'i18n/' + L + '/' + screen, 'untranslated English left on screen: ' + (leak && leak.source));
      ok(!/\bau_[a-z_]+/.test(txt), 'i18n/' + L + '/' + screen, 'raw translation key leaked');
      // labels must still be tied to their controls after the rewrite
      const orphan = [...w.document.querySelectorAll('input')].filter((x) => x.type !== 'hidden' && (!x.labels || !x.labels.length) && !x.getAttribute('aria-label'));
      ok(orphan.length === 0, 'a11y/' + L + '/' + screen, orphan.length + ' unlabelled field(s)');
    }
    // provider errors are translated too
    const w2 = boot(); await wait(340); w2.setLang(L);
    ok(!/Incorrect email or password/i.test(w2.bkAuthError('Invalid login credentials')), 'i18n/' + L, 'provider error still English');
    ok(!/Could not reach the secure server/i.test(w2.bkAuthError('Failed to fetch')), 'i18n/' + L, 'network error still English');
  }
  // English still reads correctly
  {
    const w = boot(); await wait(340); w.setLang('en');
    w.location.hash = '#/login'; w.render(); await wait(50);
    const txt = vis(w);
    ok(/Welcome back/.test(txt), 'i18n/en', 'English heading missing');
    ok(/Sign in/.test(txt), 'i18n/en', 'English button missing');
  }
  console.log('=== §14.2 auth screen translations ===');
  console.log('passed: ' + pass);
  if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1) }
  else console.log('auth screens fully translated');
})();
