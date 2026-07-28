/* The three gaps just filled: CSV export, editing a lead, and password reset. */
const REPO = require('path').join(__dirname, '..');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const HTML = fs.readFileSync(REPO + '/docs/index.html', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' :: ' + x : '')); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

function boot(fetchImpl) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.onerror = m => errors.push(String(m));
  w.scrollTo = () => { }; w.scrollBy = () => { };
  w.SpeechSynthesisUtterance = function (t) { this.text = t; };
  w.speechSynthesis = { getVoices: () => [], cancel() { }, speak(u) { setTimeout(() => u.onend && u.onend(), 1); } };
  w.Audio = function () { return { play: () => Promise.resolve(), pause() { } }; };
  // capture the download instead of performing it
  w.__downloads = [];
  w.URL.createObjectURL = b => { w.__lastBlob = b; return 'blob:fake'; };
  w.URL.revokeObjectURL = () => { };
  const realCreate = w.document.createElement.bind(w.document);
  w.document.createElement = tag => {
    const el = realCreate(tag);
    if (String(tag).toLowerCase() === 'a') el.click = function () { w.__downloads.push({ name: el.download, href: el.href }); };
    return el;
  };
  if (fetchImpl) w.fetch = fetchImpl;
  return { w, errors };
}

(async () => {
  console.log('=== 1. CSV export ===');
  {
    const { w, errors } = boot(); await wait(320);
    w.demoLogin();
    // a lead whose fields would break naive CSV, plus a spreadsheet-formula payload
    const leads = w.getLeads();
    leads.unshift({ id: 'LD-CSV', name: 'O\'Brien, "Bob"\nSecond line', service: '=cmd|calc', urgency: 'High',
      source: 'Voice call', status: 'New', score: 88, at: Date.now(), phone: '+44 7700 900123',
      email: 'b@x.com', summary: 'has, commas "and" quotes', notes: '@SUM(1+1)', assignee: 'Front desk' });
    w.setLeads(leads);
    w.location.hash = '#/leads'; w.render(); await wait(30);
    ok('an Export button is on the leads screen', /exportLeads\(\)/.test(w.document.querySelector('.content').innerHTML));
    w.exportLeads(); await wait(30);
    ok('a file was produced', w.__downloads.length === 1, JSON.stringify(w.__downloads));
    ok('named with today\'s date', /^alsaiti-leads-\d{4}-\d{2}-\d{2}\.csv$/.test(w.__downloads[0].name), w.__downloads[0].name);
    const csv = w.leadsToCsv(w.getLeads());
    const lines = csv.split('\r\n');
    ok('header + one row per lead', lines.length === w.getLeads().length + 1, lines.length + ' vs ' + (w.getLeads().length + 1));
    ok('every field is quoted', lines[1].startsWith('"') && lines[1].endsWith('"'));
    ok('embedded quotes are doubled', /""Bob""/.test(csv), csv.slice(0, 200));
    ok('a newline inside a value stays inside its quotes', /Second line/.test(csv));
    // the important one: spreadsheet formula injection
    ok('=formula is neutralised', /"'=cmd\|calc"/.test(csv), (csv.match(/"[^"]*cmd[^"]*"/) || [''])[0]);
    ok('@formula is neutralised', /"'@SUM\(1\+1\)"/.test(csv), (csv.match(/"[^"]*SUM[^"]*"/) || [''])[0]);
    ok('a normal value is untouched', /"Front desk"/.test(csv));
    ok('empty export is refused politely', (function () { w.setLeads([]); const before = w.__downloads.length; w.exportLeads(); return w.__downloads.length === before; })());
    ok('no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  }

  console.log('\n=== 2. editing a lead ===');
  {
    const { w, errors } = boot(); await wait(320);
    w.demoLogin();
    const lead = w.getLeads()[0];
    const id = lead.id, origStatus = 'Qualified', origNotes = 'keep me';
    w.moveStatus(id, origStatus);
    let ls = w.getLeads(); ls.forEach(l => { if (l.id === id) l.notes = origNotes; }); w.setLeads(ls);
    const origScore = w.getLeads().find(l => l.id === id).score;
    const origAt = w.getLeads().find(l => l.id === id).at;

    w.editLead(id); await wait(30);
    ok('opens the form', /new/.test(w.location.hash), w.location.hash);
    const f = w.document.querySelector('form');
    ok('form is prefilled with the name', f.elements['name'].value === lead.name, f.elements['name'].value);
    ok('form is prefilled with the service', f.elements['service'].value === lead.service);
    ok('urgency is preselected', f.elements['urgency'].value === lead.urgency, f.elements['urgency'].value);
    f.elements['name'].value = 'Renamed Person';
    f.elements['phone'].value = '07999 111222';
    f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await wait(40);
    const after = w.getLeads().find(l => l.id === id);
    ok('the edit saved', after.name === 'Renamed Person', after.name);
    ok('the phone saved', /111222/.test(after.phone), after.phone);
    ok('it did NOT create a duplicate', w.getLeads().filter(l => l.id === id).length === 1);
    ok('status was preserved', after.status === origStatus, after.status);
    ok('notes were preserved', after.notes === origNotes, after.notes);
    ok('score was preserved', after.score === origScore, String(after.score));
    ok('created-at was preserved', after.at === origAt);
    ok('editing a missing lead is handled', (function () { w.editLead('nope-does-not-exist'); return true; })());
    ok('no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  }

  console.log('\n=== 3. password reset ===');
  {
    const calls = [];
    const { w, errors } = boot((u, o) => {
      calls.push({ url: String(u), body: o && o.body ? JSON.parse(o.body) : null });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    await wait(320);
    w.doLogout(); w.location.hash = '#/login'; w.render(); await wait(30);
    const html = w.document.querySelector('.authcard').innerHTML;
    ok('a "Forgot your password?" link is on sign-in', /authForgot\(\)/.test(html));
    // with no email typed it must ask, not silently call the server
    w.authForgot(); await wait(20);
    ok('refuses without an email address', calls.length === 0, JSON.stringify(calls));
    const errBox = w.document.querySelector('#authErr');
    ok('and says why', /email/i.test(errBox.textContent || ''), errBox.textContent);
    // now with a real address
    w.document.querySelector('.authcard').elements['email'].value = 'owner@business.com';
    w.authForgot(); await wait(60);
    ok('calls the Supabase recover endpoint', calls.some(c => /\/auth\/v1\/recover$/.test(c.url)), calls.map(c => c.url).join(','));
    ok('sends the address', calls.some(c => c.body && c.body.email === 'owner@business.com'));
    ok('shows the check-your-inbox screen', /confirm/.test(w.location.hash), w.location.hash);
    ok('signup screen has no forgot link', (function () { w.location.hash = '#/signup'; w.render(); return !/authForgot\(\)/.test(w.document.querySelector('.authcard').innerHTML); })());
    ok('no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  }

  console.log('\n=== 4. notification prefs are honest about delivery ===');
  {
    const { w } = boot(); await wait(320);
    w.demoLogin(); w.location.hash = '#/settings'; w.render(); await wait(30);
    const html = w.document.querySelector('.content').innerHTML;
    ok('says delivery needs an email provider', /email provider/i.test(html));
    ok('the toggles still persist', (function () { w.setPref('lead_urgent', false); return w.getPrefs().lead_urgent === false; })());
    w.setPref('lead_urgent', true);
  }

  console.log('\n---------------------------------------------');
  console.log('PASS ' + pass + '   FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
