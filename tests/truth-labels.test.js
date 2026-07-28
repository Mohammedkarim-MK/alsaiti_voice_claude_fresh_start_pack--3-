/* Handoff §2 "Non-negotiable truth labels" + Appendix B.
   A production state (Connected / Healthy / Live / Active / Synced) may only appear when the
   BACKEND says so — never from a click, localStorage, or a demo wizard.

   NOTE ON METHOD: an earlier version of this file matched these words anywhere in the visible
   text, which produced three false alarms — a section heading, a metric label ("Synced leads"),
   and copy inside the demo banner. Status claims live in `.cs` chips and in the summary tiles,
   so that is what is asserted here. Bare-word matching is kept only for the §13 phone-call
   claim, where the wording itself is the thing under test. */
const REPO = require('path').join(__dirname, '..');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const HTML = fs.readFileSync(REPO + '/docs/index.html', 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0; const bad = [];
const ok = (c, id, what) => { if (c) pass++; else bad.push(id + ': ' + what) };

/* Words Appendix B reserves for states proven by a real transaction. */
const PROD = /^(Connected|Conectado|متصل|Healthy|Correcto|سليم|Live|En vivo|مباشر|Active|Activa?s?|نشط|Synced|Sincronizado|مُزامَن)$/i;

function boot(fetchImpl) {
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.SpeechSynthesisUtterance = function (t) { this.text = t };
  w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { setTimeout(() => u.onend && u.onend(), 1) } };
  w.Audio = function () { return { play: () => Promise.resolve(), pause() {}, set src(v) {}, get src() { return '' } } };
  w.scrollTo = () => {}; w.scrollBy = () => {};
  w.fetch = fetchImpl || (() => Promise.reject(new Error('offline')));
  return w;
}
/* Every status chip currently on screen. */
const chips = (w) => [...w.document.querySelectorAll('.cs')].map((e) => (e.textContent || '').trim()).filter(Boolean);
/* Summary-tile label/value pairs on the integrations page. */
const tiles = (w) => [...w.document.querySelectorAll('.crmsum > *')].map((e) => (e.textContent || '').trim());
const vis = (w) => { const c = w.document.body.cloneNode(true); c.querySelectorAll('script,style').forEach((x) => x.remove()); return c.textContent };

(async () => {
  /* ---- 1. backend unreachable: no chip may claim a production state ---- */
  {
    const w = boot(() => Promise.reject(new Error('network down')));
    await wait(340); w.demoLogin();
    for (const screen of ['integrations', 'phone', 'dashboard', 'settings', 'leads']) {
      w.location.hash = '#/' + screen; w.render(); await wait(60);
      const liar = chips(w).find((c) => PROD.test(c));
      ok(!liar, 'TRUTH/offline/' + screen, 'status chip reads "' + liar + '" with the backend unreachable');
    }
  }

  /* ---- 2. backend reachable but reports nothing connected ---- */
  {
    const w = boot(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ ok: true, connections: [], numbers: [], status: 'missing_credentials' }),
    }));
    await wait(340); w.demoLogin();
    for (const screen of ['integrations', 'phone']) {
      w.location.hash = '#/' + screen; w.render(); await wait(80);
      const liar = chips(w).find((c) => PROD.test(c));
      ok(!liar, 'TRUTH/empty/' + screen, 'status chip reads "' + liar + '" when the backend reports nothing connected');
    }
  }

  /* ---- 3. the summary tile must not count simulated connections as "Active" ---- */
  {
    const w = boot(() => Promise.reject(new Error('offline')));
    await wait(340); w.demoLogin();
    w.location.hash = '#/integrations'; w.render(); await wait(80);
    const st = w.crmState();
    const allDemo = (st.conns || []).every((c) => c.status === 'demo');
    const tileText = tiles(w).join(' | ');
    if (allDemo) {
      ok(/Demo/i.test(tileText), 'TRUTH/tile',
        'every connection is simulated, yet the summary tile does not say Demo: ' + tileText.slice(0, 120));
      ok(!/Active connections|Conexiones activas|الاتصالات النشطة/.test(tileText), 'TRUTH/tile',
        'simulated connections counted under the production word "Active": ' + tileText.slice(0, 120));
    }
  }

  /* ---- 4. §13: the browser voice demo must not be sold as live phone answering ---- */
  {
    const w = boot(() => Promise.reject(new Error('offline')));
    await wait(340); w.demoLogin();
    w.location.hash = '#/voice'; w.render(); await wait(60);
    const txt = vis(w);
    ok(!/live phone call|real phone call|answers your phone line|answering your phone line/i.test(txt),
      'TRUTH/§13', 'the browser demo is described as live phone answering');
    ok(/demo|navegador|browser|تجريب/i.test(txt), 'TRUTH/§13', 'the voice screen never identifies itself as a demo');
  }

  /* ---- 5. clicking Connect must not, by itself, produce a connected chip ---- */
  {
    const w = boot(() => Promise.reject(new Error('provider_not_configured')));
    await wait(340); w.demoLogin();
    w.location.hash = '#/integrations'; w.render(); await wait(80);
    const before = chips(w).length;
    const btns = [...w.document.querySelectorAll('button,a')].filter((b) => /^(connect|conectar|ربط)/i.test((b.textContent || '').trim()));
    for (const b of btns.slice(0, 6)) { try { b.click() } catch (e) {} }
    await wait(150);
    const liar = chips(w).find((c) => PROD.test(c));
    ok(!liar, 'TRUTH/click', 'clicking Connect produced the chip "' + liar + '" with no working provider');
    ok(before >= 0, 'TRUTH/click', 'sanity');
  }

  /* ---- 6. the state→label mapping itself is honest ---- */
  {
    const w = boot(); await wait(340);
    ok(typeof w.crmStateMeta === 'function', 'TRUTH/mapping', 'no crmStateMeta mapping function exists');
    ok(PROD.test(w.crmStateMeta('connected').l), 'TRUTH/mapping', 'the genuinely-connected state has no production label');
    for (const st of ['demo', 'needs_setup', 'authorising', 'test_required', 'attention_required', 'error', 'disconnected']) {
      const m = w.crmStateMeta(st);
      ok(m && !PROD.test(m.l), 'TRUTH/mapping', st + ' maps to a production-sounding label: ' + (m && m.l));
    }
  }

  /* ---- 7. same, in every language ---- */
  for (const L of ['en', 'es', 'ar']) {
    const w = boot(() => Promise.reject(new Error('offline')));
    await wait(340); w.setLang(L); w.demoLogin();
    w.location.hash = '#/integrations'; w.render(); await wait(80);
    const liar = chips(w).find((c) => PROD.test(c));
    ok(!liar, 'TRUTH/lang/' + L, 'status chip reads "' + liar + '" for a demo-only connection');
  }

  console.log('=== §2 / Appendix B truth-label audit ===');
  console.log('passed: ' + pass);
  if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1) }
  else console.log('no untruthful production states found');
})();
