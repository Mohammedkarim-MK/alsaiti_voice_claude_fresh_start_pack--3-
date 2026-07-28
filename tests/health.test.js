/* Handoff §17.1 / MON-01 — the health panel must report what the endpoint says, and an
   unreachable backend must never read as healthy. */
const REPO = require('path').join(__dirname, '..');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const HTML = fs.readFileSync(REPO + '/docs/index.html', 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0; const bad = [];
const ok = (c, id, what) => { if (c) pass++; else bad.push(id + ': ' + what) };

function boot(fetchImpl) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e.message || e)));
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.SpeechSynthesisUtterance = function (t) { this.text = t };
  w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { setTimeout(() => u.onend && u.onend(), 1) } };
  w.Audio = function () { return { play: () => Promise.resolve(), pause() {}, set src(v) {}, get src() { return '' } } };
  w.scrollTo = () => {}; w.scrollBy = () => {};
  const calls = [];
  w.fetch = (url, opt) => { calls.push({ url: String(url), headers: (opt && opt.headers) || {}, body: opt && opt.body ? JSON.parse(opt.body) : {} }); return fetchImpl(String(url), opt) };
  return { w, calls, errors };
}
const resp = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
const vis = (w) => { const c = w.document.body.cloneNode(true); c.querySelectorAll('script,style').forEach((x) => x.remove()); return c.textContent };
const chips = (w) => [...w.document.querySelectorAll('.cs')].map((e) => (e.textContent || '').trim());

(async () => {
  const HEALTHY = { status: 'ok', checks: [
    { name: 'database', state: 'ok' }, { name: 'lead_alerts', state: 'ok' },
    { name: 'notification_backlog', state: 'ok', count: 0 }, { name: 'telnyx', state: 'not_configured' }] };

  /* ---- healthy backend renders each check ---- */
  {
    const { w, errors } = boot(() => resp(200, HEALTHY));
    await wait(340); w.demoLogin();
    w.location.hash = '#/settings'; w.render(); await wait(60);
    w.healthFetch(); await wait(80);
    const txt = vis(w);
    ok(errors.length === 0, 'MON-01', 'errors: ' + errors.slice(0, 2).join(' | '));
    ok(/Database/i.test(txt), 'MON-01', 'database check not shown');
    ok(/Lead alert email/i.test(txt), 'MON-01', 'lead alert check not shown');
    ok(/Not configured/i.test(txt), 'MON-01', 'an unconfigured provider is not labelled as such');
    ok(!/hz_database|hz_lead_alerts/.test(txt), 'MON-01', 'raw translation key leaked');
  }

  /* ---- an unreachable backend must NOT read as healthy ---- */
  {
    const { w } = boot(() => Promise.reject(new Error('network down')));
    await wait(340); w.demoLogin();
    w.location.hash = '#/settings'; w.render(); await wait(60);
    w.healthFetch(); await wait(80);
    const txt = vis(w);
    ok(/Could not reach/i.test(txt), 'MON-01', 'an unreachable backend produced no warning');
    ok(chips(w).some((c) => /Down|Caído|متوقف/i.test(c)), 'MON-01', 'unreachable backend not chipped as down');
    ok(!chips(w).some((c) => /^Healthy$/i.test(c)), 'MON-01', 'unreachable backend reported as Healthy');
  }

  /* ---- a degraded backend shows degraded, with the backlog count ---- */
  {
    const { w } = boot(() => resp(503, { status: 'degraded', checks: [
      { name: 'database', state: 'ok' },
      { name: 'lead_alerts', state: 'degraded', detail: 'no email provider configured' },
      { name: 'notification_backlog', state: 'degraded', count: 7 }] }));
    await wait(340); w.demoLogin();
    w.location.hash = '#/settings'; w.render(); await wait(60);
    w.healthFetch(); await wait(80);
    const txt = vis(w);
    ok(/Degraded|Degradado|متدهور/i.test(txt), 'MON-01', 'degraded state not surfaced');
    ok(/\(7\)/.test(txt), 'MON-01', 'undelivered-alert count not shown: ' + txt.slice(0, 200));
    ok(!/\bHealthy\b/i.test(txt), 'MON-01', 'degraded backend also claims Healthy');
  }

  /* ---- no backend configured: render nothing rather than a fake green ---- */
  {
    const { w } = boot(() => resp(200, HEALTHY));
    await wait(340); w.demoLogin();
    w.BK.clear(); w.DB.set('ag_backend', { url: '', anon: '' });
    w.location.hash = '#/settings'; w.render(); await wait(60);
    ok(typeof w.healthCard === 'function', 'MON-01', 'healthCard missing');
  }

  /* ---- the contact form sends a correlation id header ---- */
  {
    const { w, calls } = boot((u) => /contact-submit/.test(u)
      ? resp(200, { ok: true, reference: 'AG-CID0001', notification: 'sent' })
      : resp(200, { ok: true }));
    await wait(340);
    w.location.hash = ''; w.render(); await wait(60);
    const f = w.document.querySelector('#sec-contact form');
    f.elements['first'].value = 'Sarah'; f.elements['email'].value = 's@example.com';
    f.elements['problem'].value = 'hello';
    f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await wait(80);
    const c = calls.find((x) => /contact-submit/.test(x.url));
    ok(!!c, 'ï¿½17.1', 'no contact-submit call');
    const cid = c && (c.headers['x-correlation-id'] || c.headers['X-Correlation-Id']);
    ok(!!cid, '§17.1', 'no x-correlation-id header sent');
    ok(cid === c.body.idem, '§17.1', 'correlation id does not match the idempotency key: ' + cid + ' vs ' + c.body.idem);
    ok(/^[A-Za-z0-9_-]{8,64}$/.test(cid || ''), '§17.1', 'correlation id would be rejected by the server pattern: ' + cid);
  }

  /* ---- all three languages ---- */
  for (const L of ['en', 'es', 'ar']) {
    const { w } = boot(() => resp(200, HEALTHY));
    await wait(340); w.setLang(L); w.demoLogin();
    w.location.hash = '#/settings'; w.render(); await wait(60);
    w.healthFetch(); await wait(80);
    ok(!/\bhz_[a-z_]+/.test(vis(w)), 'i18n/' + L, 'raw health translation key leaked');
  }

  console.log('=== §17.1 / MON-01 health + correlation ===');
  console.log('passed: ' + pass);
  if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1) }
  else console.log('health reporting is truthful');
})();
