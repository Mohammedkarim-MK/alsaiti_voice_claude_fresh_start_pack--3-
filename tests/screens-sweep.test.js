/* Whole-app sweep: every route in every language, every onclick handler, every translation key. */
const REPO = require('path').join(__dirname, '..');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const FILE = REPO + '/docs/index.html';
const HTML = fs.readFileSync(FILE, 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + x : '')); } };

function boot() {
  const errors = [];
  const vc = new (require('jsdom').VirtualConsole)();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.message || e)));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.onerror = m => errors.push('window.onerror: ' + m);
  w.addEventListener('unhandledrejection', e => errors.push('unhandled: ' + e.reason));
  return { w, errors };
}
const wait = ms => new Promise(r => setTimeout(r, ms));

const ROUTES = ['#/dashboard', '#/leads', '#/voice', '#/analytics', '#/settings', '#/integrations', '#/phone', '#/new', '#/onboarding'];

(async () => {
  console.log('=== every route renders, in every language ===');
  for (const L of ['en', 'es', 'ar']) {
    const { w, errors } = boot();
    await wait(300);
    w.demoLogin();
    w.setLang(L);
    await wait(50);
    for (const r of ROUTES) {
      try { w.location.hash = r; w.render(); } catch (e) { errors.push(r + ' threw: ' + e.message); }
      await wait(25);
      const app = w.document.getElementById('app') || w.document.body;
      if (!app || app.innerHTML.trim().length < 80) errors.push(r + ' rendered empty');
    }
    ok(L + ': all ' + ROUTES.length + ' routes render cleanly', errors.length === 0, errors.slice(0, 6).join('\n        '));
  }

  console.log('\n=== every inline handler resolves to a real function ===');
  {
    const { w, errors } = boot();
    await wait(300);
    w.demoLogin();
    const seen = new Set();
    const collect = () => {
      const html = w.document.documentElement.innerHTML;
      const re = /\son(?:click|change|input|submit|keydown)="([^"]+)"/g;
      let m;
      while ((m = re.exec(html))) {
        // pull identifiers that are called as globals: name(  — skip obj.method(
        const re2 = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
        let c;
        while ((c = re2.exec(m[1]))) seen.add(c[2]);
      }
    };
    for (const r of ROUTES) { w.location.hash = r; w.render(); await wait(15); collect(); }
    // also the landing + auth screens
    w.doLogout(); w.location.hash = '#/'; w.render(); await wait(20); collect();
    w.location.hash = '#/signin'; w.render(); await wait(20); collect();
    const builtins = new Set(['if', 'for', 'while', 'return', 'typeof', 'function', 'catch', 'switch', 'String', 'Number', 'Boolean', 'parseInt', 'parseFloat', 'Math', 'JSON', 'Array', 'Object']);
    const missing = [...seen].filter(n => !builtins.has(n) && typeof w[n] !== 'function');
    ok('all ' + seen.size + ' handlers exist', missing.length === 0, 'missing: ' + missing.join(', '));
    ok('no errors while walking every screen', errors.length === 0, errors.slice(0, 5).join('\n        '));
  }

  console.log('\n=== translation coverage ===');
  {
    const { w } = boot();
    await wait(300);
    // every key the source asks for, from t('x') / tf('x', …)
    const used = new Set();
    const re = /\bt[f]?\('([a-z0-9_]+)'(\s*\+)?/g;
    let m; while ((m = re.exec(HTML))) { if (!m[2]) used.add(m[1]); }
    // the four families built at runtime: check every value they can actually take
    ['name', 'service', 'urgency', 'phone'].forEach(k => { used.add('v_re_' + k); used.add('v_got_' + k); });
    ['price', 'hours', 'where', 'services', 'human', 'when', 'email', 'book', 'who', 'thanks', 'bye', 'unknown'].forEach(k => used.add('v_a_' + k));
    ['name', 'phone', 'email', 'service', 'score', 'urgency', 'source', 'summary', 'callback'].forEach(k => used.add('lead_field_' + k));
    for (const L of ['en', 'es', 'ar']) {
      w.LANG = L;
      const missing = [...used].filter(k => w.t(k) === k);
      ok(L + ': ' + used.size + ' keys used, all translated', missing.length === 0, 'missing: ' + missing.join(', '));
    }
    // and no key is an empty string
    w.LANG = 'en';
    const blank = [...used].filter(k => String(w.t(k)).trim() === '');
    ok('no blank strings', blank.length === 0, blank.join(', '));
  }

  console.log('\n=== core journeys still work ===');
  {
    const { w, errors } = boot();
    await wait(300);
    w.demoLogin();
    const n0 = w.getLeads().length;
    // create a lead through the real form path
    w.location.hash = '#/new'; w.render(); await wait(20);
    const f = w.document.querySelector('form');
    ok('new-lead form present', !!f);
    if (f) {
      f.elements['name'].value = 'Test Person';
      f.elements['service'].value = 'Boiler service';
      if (f.elements['phone']) f.elements['phone'].value = '07700900999';
      f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
      await wait(30);
    }
    ok('lead created from the form', w.getLeads().length === n0 + 1, n0 + ' -> ' + w.getLeads().length);
    const lead = w.getLeads()[0];
    ok('form fields actually captured', lead && lead.name === 'Test Person', lead && lead.name);
    // status change
    w.openLead(lead.id); w.render(); await wait(20);
    w.moveStatus(lead.id, 'Qualified'); await wait(20);
    ok('status change persists', w.getLeads().filter(l => l.id === lead.id)[0].status === 'Qualified');
    // search
    w.location.hash = '#/leads'; w.render(); await wait(20);
    w.liveSearch('Test Person');
    const html = w.leadResults();
    ok('search finds the lead', /Test Person/.test(html) && !/No matching leads/.test(html));
    w.liveSearch('zzzz-nothing');
    ok('search shows an empty state when nothing matches', /No matching leads/.test(w.leadResults()));
    w.liveSearch('');
    // CRM demo connection end-to-end
    w.location.hash = '#/integrations'; w.render(); await wait(20);
    w.crmOpenWizard('hubspot');
    w.CRMWIZ.draft.authed = true; w.CRMWIZ.step = 1;
    w.crmSetCred('token', 'pat-eu1-' + 'b'.repeat(30)); w.crmSetCred('portal', '24123456');
    for (let i = 0; i < 8; i++) w.crmWizNext();
    await wait(30);
    const conns = w.crmState().conns.filter(c => c.provider === 'hubspot');
    ok('hubspot connection activated', conns.length >= 1, String(conns.length));
    ok('account labelled from the credentials', conns.some(c => /Hub 24123456/.test(c.account || '')), conns.map(c => c.account).join('|'));
    ok('no errors across the journey', errors.length === 0, errors.slice(0, 5).join('\n        '));
  }

  console.log('\n=== theme + language switches do not break anything ===');
  {
    const { w, errors } = boot();
    await wait(300);
    w.demoLogin();
    for (const r of ['#/dashboard', '#/voice', '#/integrations']) {
      w.location.hash = r;
      for (const L of ['en', 'ar', 'es', 'en']) { w.setLang(L); await wait(15); }
      w.toggleTheme(); await wait(15); w.toggleTheme(); await wait(15);
    }
    ok('rtl applied for arabic', (w.setLang('ar'), w.document.documentElement.dir === 'rtl'));
    w.setLang('en');
    ok('ltr restored', w.document.documentElement.dir === 'ltr');
    ok('no errors switching theme/language', errors.length === 0, errors.slice(0, 5).join('\n        '));
  }

  console.log('\n---------------------------------------------');
  console.log('PASS ' + pass + '   FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
