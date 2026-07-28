/* Dark-mode logo, the Settings rebuild, and the tightened auth / integrations sign-in. */
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
  if (fetchImpl) w.fetch = fetchImpl;
  return { w, errors };
}
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };

(async () => {
  console.log('=== 1. the logo now has a real dark-mode palette ===');
  {
    const { w, errors } = boot(); await wait(350);
    const defs = w.document.getElementById('agdefs');
    ok('shared gradient defs exist once', !!defs);
    const light = defs.querySelectorAll('[id^="agl_"]'), dark = defs.querySelectorAll('[id^="agd_"]');
    ok('28 light + 28 dark gradients', light.length === 28 && dark.length === 28, light.length + '/' + dark.length);
    const a = w.aLogo();
    ok('markup carries no baked fills', !/fill=/.test(a));
    ok('28 classed facets', (a.match(/class="f\d+"/g) || []).length === 28);
    // every facet class must be styled in BOTH themes
    const css = HTML.slice(HTML.indexOf('<style'), HTML.indexOf('</style>'));
    let missL = [], missD = [];
    for (let i = 0; i < 28; i++) {
      if (css.indexOf('.aM .f' + i + '{fill:url(#agl_' + i + ')}') < 0) missL.push(i);
      if (css.indexOf(':root[data-theme="dark"] .aM .f' + i + '{fill:url(#agd_' + i + ')}') < 0) missD.push(i);
    }
    ok('every facet styled in light', missL.length === 0, missL.join(','));
    ok('every facet styled in dark', missD.length === 0, missD.join(','));
    // contrast: the dark palette must actually read on the dark background
    const grab = id => { const g = defs.querySelector('[id="' + id + '"]'); return g ? [...g.querySelectorAll('stop')].map(x => x.getAttribute('stop-color')) : []; };
    let darkMin = 99, lightOnDarkMin = 99, worst = '';
    for (let i = 0; i < 28; i++) {
      grab('agd_' + i).forEach(c => { const r = ratio(c, '#0c100e'); if (r < darkMin) { darkMin = r; worst = c; } });
      grab('agl_' + i).forEach(c => { const r = ratio(c, '#0c100e'); if (r < lightOnDarkMin) lightOnDarkMin = r; });
    }
    ok('dark facets all clear 3:1 on charcoal', darkMin >= 3.0, 'worst ' + worst + ' = ' + darkMin.toFixed(2));
    ok('and they beat the old light-on-dark badly', darkMin > lightOnDarkMin * 2, darkMin.toFixed(2) + ' vs ' + lightOnDarkMin.toFixed(2));
    ok('no errors', errors.length === 0, errors.join(' | '));
  }

  console.log('\n=== 2. language + theme moved out of the app chrome ===');
  {
    const { w } = boot(); await wait(300);
    w.demoLogin(); w.location.hash = '#/dashboard'; w.render(); await wait(30);
    const top = w.document.querySelector('.topbar').innerHTML;
    ok('no language pill in the top bar', top.indexOf('langsw') < 0);
    ok('no theme toggle in the top bar', top.indexOf('themebtn') < 0);
    w.location.hash = '#/voice'; w.render(); await wait(30);
    ok('no language pill on the voice screen', w.document.querySelector('.voicecard').innerHTML.indexOf('langsw') < 0);
    // still reachable on the public landing, where there is no Settings to go to
    w.doLogout(); w.location.hash = '#/landing'; w.render(); await wait(30);
    ok('still available on the public landing', w.document.body.innerHTML.indexOf('langsw') >= 0);
  }

  console.log('\n=== 3. settings actually contains them, and they work ===');
  {
    const { w, errors } = boot(); await wait(300);
    w.demoLogin(); w.location.hash = '#/settings'; w.render(); await wait(40);
    const html = w.document.querySelector('.content').innerHTML;
    ok('appearance card', /Appearance/i.test(html));
    ok('theme options', /setTheme\('light'\)/.test(html) && /setTheme\('dark'\)/.test(html));
    ok('all three languages', /setLang\('en'\)/.test(html) && /setLang\('es'\)/.test(html) && /setLang\('ar'\)/.test(html));
    ok('voice pack options', /voiceGender\('female'\)/.test(html) && /voiceGender\('male'\)/.test(html));
    ok('notification switches', (html.match(/class="swrow/g) || []).length >= 3, String((html.match(/class="swrow/g) || []).length));
    ok('security card', /Account &amp; security|Account & security/.test(html));
    ok('shows the session policy', /days of inactivity/.test(html));
    // theme switch from settings
    w.setTheme('dark'); w.render(); await wait(20);
    ok('theme applies from settings', w.document.documentElement.getAttribute('data-theme') === 'dark');
    ok('and the dark option shows as selected', /optbtn on[^>]*>[^<]*<span class="optck">/.test(w.document.querySelector('.content').innerHTML) || w.document.querySelectorAll('.optbtn.on').length >= 2);
    w.setTheme('light'); w.render(); await wait(20);
    // language switch from settings
    w.setLang('ar'); await wait(20);
    ok('language applies from settings', w.LANG === 'ar' && w.document.documentElement.dir === 'rtl');
    w.setLang('en'); await wait(20);
    // notification preference persists
    w.setPref('daily', true); await wait(20);
    ok('notification preference saved', w.getPrefs().daily === true);
    w.setPref('daily', false); await wait(20);
    ok('and can be turned back off', w.getPrefs().daily === false);
    ok('no errors', errors.length === 0, errors.join(' | '));
  }

  console.log('\n=== 4. passwords are actually checked ===');
  {
    const { w } = boot(); await wait(300);
    const bad = [['short1', 'too short'], ['password123', 'common'], ['abcdefghijk', 'no digit'], ['1234567890123', 'no letter'], ['Password1', 'only 9 chars']];
    bad.forEach(([p, why]) => ok('rejects "' + p + '" (' + why + ')', w.passOK(p) === false));
    const good = ['alsaiti-lead-42', 'Str0ngEnough1', 'correct7horse7battery'];
    good.forEach(p => ok('accepts "' + p + '"', w.passOK(p) === true));
    ok('strength score rises with quality', w.passScore('short1') < w.passScore('Str0ngEnough1') && w.passScore('Str0ngEnough1') <= w.passScore('L0ng3r&Str0nger!Pass'));
    ok('a common password scores zero', w.passScore('password123') === 0);
    ok('the meter renders', /pbars/.test(w.passMeter('Str0ngEnough1')));
    // the seeded demo account is exempt, so the demo button keeps working on a fresh device
    ok('no session before the demo button', !w.AUTH.session());
    w.demoLogin();
    ok('demo sign-in still works on a fresh device', !!w.AUTH.session(), 'no session');
    ok('demo password would fail the new rule', w.passOK('demo1234') === false);
  }

  console.log('\n=== 5. sign-up form verifies before it calls the server ===');
  {
    let called = 0;
    const { w } = boot((u, o) => { called++; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }); });
    await wait(300);
    w.doLogout();
    /* Public sign-up is OFF on the project (handoff §6.1), so #/signup now renders an
       invitation panel instead of a form the server would reject. Assert that first, then
       force the flag on so the validation coverage below survives for the day it reopens. */
    w.location.hash = '#/signup'; w.render(); await wait(30);
    ok('closed sign-up shows no password field', !w.document.querySelector('input[name="pass"]'));
    ok('closed sign-up explains it is invitation-only', /invitation/i.test(w.document.body.textContent || ''));
    w.SIGNUPS_OPEN = true; w.render(); await wait(30);
    const f = w.document.querySelector('form');
    ok('confirm-password field present', !!f.elements['pass2']);
    ok('strength meter present', !!w.document.getElementById('pmeterbox'));
    const fire = () => f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    const errText = () => (f.querySelector('#authErr .err') || {}).textContent || '';
    f.elements['name'].value = 'A B'; f.elements['biz'].value = 'Biz';
    f.elements['email'].value = 'not-an-email'; f.elements['pass'].value = 'Str0ngEnough1'; f.elements['pass2'].value = 'Str0ngEnough1';
    fire(); await wait(20);
    ok('bad email blocked locally', /valid email|email address/i.test(errText()), errText());
    ok('nothing was sent to the server', called === 0, String(called));
    f.elements['email'].value = 'real@example.com'; f.elements['pass2'].value = 'Different1x';
    fire(); await wait(20);
    ok('mismatched passwords blocked', /do not match|no coinciden/i.test(errText()), errText());
    f.elements['pass'].value = 'password123'; f.elements['pass2'].value = 'password123';
    fire(); await wait(20);
    ok('common password blocked', /too common/i.test(errText()), errText());
    f.elements['pass'].value = 'weak1'; f.elements['pass2'].value = 'weak1';
    fire(); await wait(20);
    ok('weak password blocked', /10 characters/i.test(errText()), errText());
    ok('still nothing sent to the server', called === 0, String(called));
  }

  console.log('\n=== 6. unverified email gets a real confirmation screen ===');
  {
    const { w } = boot((u, o) => {
      if (/\/auth\/v1\/signup/.test(String(u))) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ user: { id: 'x' } }) }); // no access_token
      if (/\/auth\/v1\/resend/.test(String(u))) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });
    await wait(300);
    w.doLogout();
    w.SIGNUPS_OPEN = true;          /* this path only exists once sign-ups reopen (§6.1) */
    w.location.hash = '#/signup'; w.render(); await wait(30);
    const f = w.document.querySelector('form');
    f.elements['name'].value = 'A B'; f.elements['biz'].value = 'Biz';
    f.elements['email'].value = 'newuser@example.com';
    f.elements['pass'].value = 'Str0ngEnough1'; f.elements['pass2'].value = 'Str0ngEnough1';
    f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await wait(120);
    const body = w.document.body.innerHTML;
    ok('routed to the confirm screen', w.location.hash === '#/confirm', w.location.hash);
    ok('tells them to check their inbox', /Check your inbox/i.test(body));
    ok('names the address', /newuser@example\.com/.test(body));
    ok('offers to resend', /authResend\(\)/.test(body));
    ok('was NOT signed in', !w.AUTH.session());
  }

  console.log('\n=== 7. integrations reuse the signed-in account ===');
  {
    const { w } = boot(); await wait(300);
    w.demoLogin();
    // demo (not verified) -> still asks, and says why
    w.BK.signOut();
    w.bkOpenPanel(); await wait(20);
    let m = w.document.getElementById('crmmodal').innerHTML;
    ok('demo account is asked to sign in properly', /bkpass/.test(m) && /authorise CRM/i.test(m), m.slice(0, 120));
    // verified session -> no second password anywhere
    const c = w.BK.cfg(); c.email = 'owner@business.com'; c.token = 'jwt-token'; w.BK.save(c);
    w.bkOpenPanel(); await wait(20);
    m = w.document.getElementById('crmmodal').innerHTML;
    ok('no password field once signed in', !/id="bkpass"/.test(m));
    ok('no email field either', !/id="bkemail"/.test(m));
    ok('names the account being used', /owner@business\.com/.test(m));
    ok('says it is the same account', /no separate password|same account/i.test(m));
    ok('advanced project override still available', /bkSaveProject\(\)/.test(m));
  }

  console.log('\n---------------------------------------------');
  console.log('PASS ' + pass + '   FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
