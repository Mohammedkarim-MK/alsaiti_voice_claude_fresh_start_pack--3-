/* Handoff §5.6 — FORM-01..07 against the real page, with a scripted fake backend.
   Each test asserts the BEHAVIOUR the document demands, not merely the absence of an error. */
const REPO = require('path').join(__dirname, '..');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const HTML = fs.readFileSync(REPO + '/docs/index.html', 'utf8');

let pass = 0; const bad = [];
const ok = (cond, id, what) => { if (cond) pass++; else bad.push(id + ': ' + what) };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* `respond` receives the parsed request body and returns {status, json} — or throws to
   simulate the network itself failing. */
function boot(respond) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e.message || e)));
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.onerror = (m) => errors.push('onerror: ' + m);
  w.SpeechSynthesisUtterance = function (t) { this.text = t };
  w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { setTimeout(() => u.onend && u.onend(), 1) } };
  w.Audio = function () { return { play: () => Promise.resolve(), pause() {}, set src(v) {}, get src() { return '' } } };
  w.scrollTo = () => {}; w.scrollBy = () => {};
  const calls = [];
  w.fetch = (url, opt) => {
    const body = opt && opt.body ? JSON.parse(opt.body) : {};
    calls.push({ url: String(url), body });
    let r;
    try { r = respond(body, calls.length); } catch (e) { return Promise.reject(e); }
    return Promise.resolve({
      ok: r.status >= 200 && r.status < 300, status: r.status,
      json: () => Promise.resolve(r.json),
    });
  };
  return { w, calls, errors };
}

const okResp = (ref) => ({ status: 200, json: { ok: true, reference: ref || 'AG-DEADBEEF', notification: 'sent' } });

async function form(w) {
  w.location.hash = '';
  w.render && w.render();
  await wait(60);
  const f = w.document.querySelector('#sec-contact form');
  if (!f) throw new Error('contact form not rendered');
  return f;
}
const fill = (f, vals) => { for (const [k, v] of Object.entries(vals)) if (f.elements[k]) f.elements[k].value = v };
const submit = (w, f) => f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
const status = (w) => (w.document.getElementById('cfStatus') || {}).textContent || '';
const statusClass = (w) => (w.document.getElementById('cfStatus') || {}).className || '';

(async () => {
  const GOOD = { first: 'Sarah', last: 'Whitfield', biz: 'Bright Smile', email: 's@example.com', phone: '+44 7700 900112', problem: 'Need an AI receptionist.' };

  /* ---- FORM-01: valid submission → one call, success only after the server confirms ---- */
  {
    const { w, calls } = boot(() => okResp('AG-11112222'));
    const f = await form(w); fill(f, GOOD); submit(w, f);
    // Before the promise resolves the UI must NOT already claim success.
    ok(!/received/i.test(status(w)), 'FORM-01', 'claimed success before the server replied');
    ok(f.elements.first.value === 'Sarah', 'FORM-01', 'cleared the form before the server replied');
    await wait(60);
    const contact = calls.filter((c) => /contact-submit/.test(c.url));
    ok(contact.length === 1, 'FORM-01', 'expected 1 contact-submit call, got ' + contact.length);
    ok(/AG-11112222/.test(status(w)), 'FORM-01', 'reference not shown to the user: ' + JSON.stringify(status(w)));
    ok(/good/.test(statusClass(w)), 'FORM-01', 'success not styled as success');
    ok(f.elements.first.value === '', 'FORM-01', 'form not cleared after a confirmed save');
    // consent + idempotency actually travel to the server
    ok(!!contact[0].body.consent, 'FORM-01', 'consent text not sent');
    ok(/^cf_[0-9a-f]{32}$/.test(contact[0].body.idem || ''), 'FORM-01', 'idempotency key malformed: ' + contact[0].body.idem);
  }

  /* ---- FORM-02: double-click → exactly one request, same key on a manual retry ---- */
  {
    let seen = 0;
    const { w, calls } = boot(() => { seen++; return okResp() });
    const f = await form(w); fill(f, GOOD);
    submit(w, f); submit(w, f); submit(w, f);          // three clicks, one intent
    await wait(60);
    const contact = calls.filter((c) => /contact-submit/.test(c.url));
    ok(contact.length === 1, 'FORM-02', 'double-click produced ' + contact.length + ' submissions');
  }
  {
    // A failed attempt then a retry must reuse the key so the server can dedupe.
    let n = 0;
    const { w, calls } = boot(() => { n++; return n === 1 ? { status: 502, json: { ok: false, error: 'store_failed' } } : okResp() });
    const f = await form(w); fill(f, GOOD);
    submit(w, f); await wait(60);
    submit(w, f); await wait(60);
    const c = calls.filter((x) => /contact-submit/.test(x.url));
    ok(c.length === 2, 'FORM-02', 'retry did not reach the server');
    ok(c[0].body.idem === c[1].body.idem, 'FORM-02', 'retry used a NEW idempotency key — server cannot dedupe');
  }
  {
    // Two genuinely separate enquiries must NOT share a key.
    const { w, calls } = boot(() => okResp());
    const f = await form(w); fill(f, GOOD);
    submit(w, f); await wait(60);
    fill(f, GOOD); submit(w, f); await wait(60);
    const c = calls.filter((x) => /contact-submit/.test(x.url));
    ok(c.length === 2 && c[0].body.idem !== c[1].body.idem, 'FORM-02', 'a second enquiry reused the first key — it would be silently dropped');
  }

  /* ---- FORM-03: invalid email / missing required → no call, values kept ---- */
  {
    const { w, calls } = boot(() => okResp());
    const f = await form(w); fill(f, { ...GOOD, email: 'notanemail' }); submit(w, f);
    await wait(40);
    ok(calls.filter((c) => /contact-submit/.test(c.url)).length === 0, 'FORM-03', 'sent an invalid email to the server');
    ok(/bad/.test(statusClass(w)), 'FORM-03', 'no error shown for an invalid email');
    ok(f.elements.email.value === 'notanemail', 'FORM-03', 'wiped the value the user typed');
    ok(f.elements.problem.value === GOOD.problem, 'FORM-03', 'wiped the message');
  }
  {
    const { w, calls } = boot(() => okResp());
    const f = await form(w); fill(f, { first: '', biz: '', email: 's@example.com' }); submit(w, f);
    await wait(40);
    ok(calls.filter((c) => /contact-submit/.test(c.url)).length === 0, 'FORM-03', 'submitted with no name at all');
    ok(/bad/.test(statusClass(w)), 'FORM-03', 'no error shown for a missing name');
  }
  {
    const { w, calls } = boot(() => okResp());
    const f = await form(w); fill(f, { first: 'Sarah', email: '', phone: '', wa: '' }); submit(w, f);
    await wait(40);
    ok(calls.filter((c) => /contact-submit/.test(c.url)).length === 0, 'FORM-03', 'submitted with no way to reply');
  }

  /* ---- FORM-04: database unavailable → no false success, values retained ---- */
  {
    const { w } = boot(() => ({ status: 502, json: { ok: false, error: 'store_failed' } }));
    const f = await form(w); fill(f, GOOD); submit(w, f); await wait(60);
    ok(!/received|reference/i.test(status(w)), 'FORM-04', 'claimed success while the database was down: ' + JSON.stringify(status(w)));
    ok(/bad/.test(statusClass(w)), 'FORM-04', 'failure not surfaced to the user');
    ok(f.elements.first.value === 'Sarah' && f.elements.problem.value === GOOD.problem, 'FORM-04', 'cleared the form on failure — the enquiry is lost');
    ok(!f.querySelector('button[type="submit"]').disabled, 'FORM-04', 'submit button left disabled — user cannot retry');
  }
  {
    // Network itself fails (fetch rejects), not just a bad status.
    const { w } = boot(() => { throw new Error('network down') });
    const f = await form(w); fill(f, GOOD); submit(w, f); await wait(60);
    ok(!/received/i.test(status(w)), 'FORM-04', 'claimed success on a network failure');
    ok(f.elements.first.value === 'Sarah', 'FORM-04', 'cleared the form on a network failure');
    ok(!f.querySelector('button[type="submit"]').disabled, 'FORM-04', 'button stuck disabled after a network failure');
  }

  /* ---- FORM-05: email provider down → lead still saved, user still confirmed ---- */
  {
    const { w } = boot(() => ({ status: 200, json: { ok: true, reference: 'AG-55556666', notification: 'retry_required' } }));
    const f = await form(w); fill(f, GOOD); submit(w, f); await wait(60);
    ok(/AG-55556666/.test(status(w)), 'FORM-05', 'a failed alert email downgraded a saved enquiry');
    ok(/good/.test(statusClass(w)), 'FORM-05', 'saved enquiry shown as an error because the email failed');
    ok(f.elements.first.value === '', 'FORM-05', 'form not cleared even though the enquiry was saved');
  }

  /* ---- FORM-06: honeypot travels to the server so it can contain it ---- */
  {
    const { w, calls } = boot(() => okResp());
    const f = await form(w); fill(f, { ...GOOD, company_website: 'http://spam.example' }); submit(w, f);
    await wait(60);
    const c = calls.filter((x) => /contact-submit/.test(x.url));
    ok(c.length === 1 && c[0].body.company_website === 'http://spam.example', 'FORM-06', 'honeypot value not forwarded for server-side containment');
  }

  /* ---- FORM-07: accessibility + loading state ---- */
  {
    const { w } = boot(() => okResp());
    const f = await form(w);
    const live = w.document.getElementById('cfStatus');
    ok(!!live, 'FORM-07', 'no status region exists');
    ok(live.getAttribute('aria-live') === 'polite' && live.getAttribute('role') === 'status', 'FORM-07', 'status region is not announced by screen readers');
    fill(f, GOOD);
    submit(w, f);
    const btn = f.querySelector('button[type="submit"]');
    ok(btn.disabled === true, 'FORM-07', 'submit button not disabled during the request');
    ok(/Sending|Enviando|جارٍ/.test(status(w)), 'FORM-07', 'no loading state announced');
    await wait(60);
    ok(btn.disabled === false, 'FORM-07', 'submit button not re-enabled after success');
    // every label is tied to its control
    const orphan = [...f.querySelectorAll('input,textarea,select')]
      .filter((x) => x.type !== 'hidden' && x.name !== 'company_website')
      .filter((x) => !x.labels || x.labels.length === 0);
    ok(orphan.length === 0, 'FORM-07', orphan.length + ' field(s) have no associated <label>: ' + orphan.map((x) => x.name).join(','));
  }

  /* ---- all three languages render the new strings ---- */
  for (const L of ['en', 'es', 'ar']) {
    const { w } = boot(() => ({ status: 502, json: { ok: false, error: 'store_failed' } }));
    await wait(40); w.setLang(L); await wait(40);
    const f = await form(w); fill(f, { ...GOOD, email: 'nope' }); submit(w, f); await wait(40);
    const msg = status(w);
    ok(msg && !/^form_err/.test(msg), 'i18n(' + L + ')', 'missing translation, showed the raw key: ' + JSON.stringify(msg));
  }

  console.log('=== §5.6 contact-form acceptance ===');
  console.log('passed: ' + pass);
  if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1) }
  else console.log('all green');
})();
