/* Handoff §6.1 — no dead-end sign-up, and the invitation route actually works. */
const REPO = require('path').join(__dirname, '..');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const HTML = fs.readFileSync(REPO + '/docs/index.html', 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0; const bad = [];
const ok = (c, id, what) => { if (c) pass++; else bad.push(id + ': ' + what) };

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

(async () => {
  /* ---- the signup route must not render a form that cannot succeed ---- */
  {
    const w = boot(); await wait(340);
    ok(w.SIGNUPS_OPEN === false, '§6.1', 'SIGNUPS_OPEN should be false while disable_signup is true on the project');
    w.location.hash = '#/signup'; w.render(); await wait(60);
    const pw = w.document.querySelector('input[name="pass"]');
    ok(!pw, '§6.1', 'a password field is still rendered on a route the server will reject');
    const txt = vis(w);
    ok(/invitation|invitación|بدعوة/i.test(txt), '§6.1', 'the screen never explains that access is invitation-only');
    const btns = [...w.document.querySelectorAll('button,a')].map((b) => (b.textContent || '').trim());
    ok(btns.some((b) => /Request access|Solicitar acceso|طلب الوصول/i.test(b)), '§6.1', 'no Request access route offered');
    ok(btns.some((b) => /demo/i.test(b)), '§6.1', 'no way through to the demo from the invitation screen');
  }

  /* ---- the login screen must not invite people into the closed door ---- */
  {
    const w = boot(); await wait(340);
    w.location.hash = '#/login'; w.render(); await wait(60);
    const txt = vis(w);
    ok(/Request access|Solicitar acceso|طلب الوصول/i.test(txt), '§6.1', 'login still advertises Get started into a closed sign-up');
    ok(!!w.document.querySelector('input[name="pass"]'), '§6.1', 'the login form itself went missing');
  }

  /* ---- the provider refusal maps to something actionable ---- */
  {
    const w = boot(); await wait(340);
    const msg = w.bkAuthError('Signups not allowed for this instance');
    ok(/invitation|invitación|بدعوة/i.test(msg), '§6.1', 'raw provider error shown for a closed sign-up: ' + msg);
  }

  /* ---- all three languages ---- */
  for (const L of ['en', 'es', 'ar']) {
    const w = boot(); await wait(340); w.setLang(L);
    w.location.hash = '#/signup'; w.render(); await wait(60);
    const txt = vis(w);
    ok(!/\binv_(title|body|request|have)\b/.test(txt), 'i18n/' + L, 'raw translation key leaked to the screen');
    ok(txt.trim().length > 40, 'i18n/' + L, 'invitation panel rendered empty');
  }

  /* ---- the demo still works, and is still labelled a demo (§6.2) ---- */
  {
    const w = boot(); await wait(340);
    w.demoLogin(); await wait(60);
    ok(!!w.AUTH.session(), '§6.2', 'demo login stopped working');
    w.location.hash = '#/dashboard'; w.render(); await wait(60);
    ok(/demo/i.test(vis(w)), '§6.2', 'signed-in demo never identifies itself as demo data');
  }

  console.log('=== §6.1 / §6.2 sign-up + demo truth ===');
  console.log('passed: ' + pass);
  if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1) }
  else console.log('no dead-end sign-up flow');
})();
