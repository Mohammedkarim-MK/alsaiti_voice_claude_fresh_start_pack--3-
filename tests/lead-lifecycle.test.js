/* Drives docs/index.html in jsdom: hands-free call loop, one-voice guarantee,
   smart answers, extraction, and CRM credential validation. */
const REPO = require('path').join(__dirname, '..');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const FILE = REPO + '/docs/index.html';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); } };

function boot() {
  const html = fs.readFileSync(FILE, 'utf8');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true });
  const w = dom.window;
  const errors = [];
  w.addEventListener('error', e => errors.push(String(e.message || e)));
  w.onerror = (m) => { errors.push(String(m)); };
  return { dom, w, errors };
}

// ---- speech mocks -----------------------------------------------------------
function installSpeechMocks(w, log) {
  // speechSynthesis: records utterances, ends them asynchronously
  let live = [];
  w.SpeechSynthesisUtterance = function (txt) { this.text = txt; this.onend = null; this.onerror = null; };
  w.speechSynthesis = {
    speaking: false,
    getVoices: () => [{ name: 'Google UK English Female', lang: 'en-GB', localService: false }],
    cancel() { live.forEach(u => { u.cancelled = true; }); live = []; log.push({ ev: 'cancel' }); },
    speak(u) {
      live.push(u);
      log.push({ ev: 'speak', text: u.text, at: log.length });
      setTimeout(() => { if (!u.cancelled && u.onend) u.onend(); }, 5);
    }
  };
  // Audio (neural path) — not used unless a backend is configured
  w.Audio = function (src) {
    this.src = src; this.onended = null; this.onerror = null;
    this.play = () => { log.push({ ev: 'audio', src: String(src).slice(0, 24) }); setTimeout(() => this.onended && this.onended(), 5); return Promise.resolve(); };
    this.pause = () => { };
  };
  // SpeechRecognition: a scripted caller
  const queue = [];
  w.__say = (text) => queue.push(text);
  w.__recStarts = 0;
  function SR() { this.lang = ''; this.continuous = false; this.interimResults = false; }
  SR.prototype.start = function () {
    w.__recStarts++;
    const self = this;
    setTimeout(() => {
      if (self.aborted) return;
      const next = queue.shift();
      if (next != null) {
        if (self.onresult) self.onresult({ resultIndex: 0, results: [{ 0: { transcript: next }, isFinal: true, length: 1 }] });
      }
      if (self.onend) self.onend();
    }, 4);
  };
  SR.prototype.stop = function () { if (this.onend) this.onend(); };
  SR.prototype.abort = function () { this.aborted = true; };
  w.SpeechRecognition = SR;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\n=== 1. page boots clean ===');
  {
    const { w, errors } = boot();
    await wait(400);
    ok('no runtime errors on load', errors.length === 0, errors.join(' | '));
    ok('app rendered', !!w.document.querySelector('.brand, .landing, #app'), '');
    console.log('\n=== 2. logo ===');
    const a = w.aLogo(), b = w.aLogo();
    ok('aLogo returns svg', /^<svg /.test(a));
    ok('28 facets', (a.match(/<polygon/g) || []).length === 28, String((a.match(/<polygon/g) || []).length));
    ok('instances are identical (gradients are shared, not duplicated)', a === b);
    // fills come from one shared defs block, so every facet class must resolve to a real gradient
    const defsEl = w.document.getElementById('agdefs');
    ok('shared defs block present', !!defsEl);
    const classes = (a.match(/class="f(\d+)"/g) || []).map(x => x.match(/\d+/)[0]);
    const unresolved = classes.filter(i => !defsEl.querySelector('[id="agl_' + i + '"]') || !defsEl.querySelector('[id="agd_' + i + '"]'));
    ok('every facet resolves in both themes', unresolved.length === 0, 'unresolved: ' + unresolved.join(','));
    // it must actually be the brand palette: deep forest greens + polished gold
    const stops = [...defsEl.querySelectorAll('[id^="agl_"] stop')].map(x => x.getAttribute('stop-color'));
    const warm = h => { const r = parseInt(h.substr(1, 2), 16), g = parseInt(h.substr(3, 2), 16), bl = parseInt(h.substr(5, 2), 16); return r > bl * 1.6 && g > bl * 1.6; };
    ok('gold facets present', stops.filter(warm).length >= 8, 'gold stops=' + stops.filter(warm).length);
  }

  console.log('\n=== 3. translations resolve in all three languages ===');
  {
    const { w } = boot();
    await wait(250);
    const keys = ['v_live_off', 'v_speaking', 'v_listening_now', 'v_thinking', 'v_hands_hint', 'v_intro_live',
      'v_still_there', 'v_no_answer', 'v_re_name', 'v_re_service', 'v_re_urgency', 'v_re_phone',
      'v_got_name', 'v_got_phone', 'v_got_urgency', 'v_got_service',
      'v_a_price', 'v_a_hours', 'v_a_where', 'v_a_services', 'v_a_human', 'v_a_when', 'v_a_email',
      'v_a_book', 'v_a_who', 'v_a_thanks', 'v_a_bye', 'v_a_unknown',
      'cx_fail_t', 'cx_fail_b', 'cx_check', 'cx_try_again', 'cx_step', 'cx_step_s', 'cx_required',
      'cx_bad', 'cx_bad_url', 'cx_bad_len', 'cx_bad_email', 'cx_bad_domain', 'cx_bad_prefix', 'cx_bad_digits',
      'cx_demo_note', 'cx_ok_t', 'bk_bad_url', 'bk_bad_anon', 'v_no_mic_hint'];
    ['en', 'es', 'ar'].forEach(L => {
      w.LANG = L;
      const missing = keys.filter(k => w.t(k) === k);
      ok(L + ': all new keys translated', missing.length === 0, missing.join(','));
    });
  }

  console.log('\n=== 4. hands-free call: no buttons, one voice, lead created ===');
  {
    const { w, errors } = boot();
    const log = [];
    installSpeechMocks(w, log);
    await wait(250);
    w.demoLogin();
    w.location.hash = '#/voice';
    w.render();
    await wait(60);
    ok('speech input detected', w.vRecAvailable() === true);
    w.__say("Hello, my name is Sarah");
    w.__say("my boiler is leaking");
    w.__say("yes it is urgent");
    w.__say("07700 900123");
    const before = w.getLeads().length;
    w.voiceStart();
    await wait(4200);
    ok('hands-free armed the mic without a click', w.__recStarts >= 4, 'starts=' + w.__recStarts);
    const spoken = log.filter(x => x.ev === 'speak');
    ok('assistant spoke every turn', spoken.length >= 5, 'utterances=' + spoken.length);
    // one-voice guarantee: no two utterances overlapping (each is cancelled/ended before the next)
    let overlap = 0;
    for (let i = 1; i < log.length; i++) {
      if (log[i].ev === 'speak') {
        // find previous speak; there must be a cancel or completion between
        let j = i - 1; while (j >= 0 && log[j].ev !== 'speak') j--;
        if (j >= 0) { let cancelled = false; for (let k = j + 1; k < i; k++) if (log[k].ev === 'cancel') cancelled = true; if (!cancelled) overlap++; }
      }
    }
    ok('never two voices at once', overlap === 0, 'overlaps=' + overlap);
    const leads = w.getLeads();
    ok('a lead was created', leads.length === before + 1, before + ' -> ' + leads.length);
    const L = leads[0] || {};
    ok('name captured', /sarah/i.test(L.name || ''), L.name);
    ok('service captured', /boiler/i.test(L.service || ''), L.service);
    ok('urgency High', L.urgency === 'High', L.urgency);
    ok('phone captured', (String(L.phone).match(/\d/g) || []).length >= 9, L.phone);
    ok('source is Voice call', L.source === 'Voice call', L.source);
    ok('no errors during the call', errors.length === 0, errors.join(' | '));
  }

  console.log('\n=== 5. it understands a caller who says everything at once ===');
  {
    const { w } = boot();
    const log = [];
    installSpeechMocks(w, log);
    await wait(250);
    w.demoLogin(); w.location.hash = '#/voice'; w.render(); await wait(60);
    w.__say("Hi, it's Daniel Okafor, I need an emergency drain unblocking today, call me on 07911 123456");
    const before = w.getLeads().length;
    w.voiceStart();
    await wait(3200);
    const L = w.getLeads()[0] || {};
    ok('one lead from one sentence', w.getLeads().length === before + 1);
    ok('name from mid-sentence', /daniel/i.test(L.name || ''), L.name);
    ok('service from mid-sentence', /drain/i.test(L.service || ''), L.service);
    ok('urgency inferred High', L.urgency === 'High', L.urgency);
    ok('phone from mid-sentence', /911/.test(String(L.phone)), L.phone);
    ok('did not ask all four questions', w.__recStarts <= 3, 'mic opened ' + w.__recStarts + 'x');
  }

  console.log('\n=== 6. it answers the caller\'s own questions, then carries on ===');
  {
    const { w } = boot();
    const log = [];
    installSpeechMocks(w, log);
    await wait(250);
    w.demoLogin(); w.location.hash = '#/voice'; w.render(); await wait(60);
    w.__say("how much does this cost?");
    w.__say("ok, I'm Priya");
    w.__say("website chat assistant");
    w.__say("no rush, just planning");
    w.__say("0161 496 0123");
    w.voiceStart();
    await wait(5200);
    const texts = log.filter(x => x.ev === 'speak').map(x => x.text).join(' || ');
    ok('answered the price question', /499|799|1,200|1200/.test(texts), texts.slice(0, 160));
    ok('went back to asking the name', /name/i.test(texts));
    const L = w.getLeads()[0] || {};
    ok('still captured the lead', /priya/i.test(L.name || ''), L.name);
    ok('urgency Low for a planner', L.urgency === 'Low', L.urgency);
    // a question must not be recorded as the answer
    ok('question not stored as the name', !/how much/i.test(L.name || ''), L.name);
  }

  console.log('\n=== 7. intents ===');
  {
    const { w } = boot(); await wait(250);
    const cases = [['what are your opening hours', 'hours'], ['can I speak to a real person', 'human'],
    ['are you a robot?', 'who'], ['how soon can someone come out', 'when'],
    ['what do you offer', 'services'], ['sorry, say that again', 'repeat'],
    ['goodbye', 'bye'], ['thanks', 'thanks'], ['where are you based', 'where'],
    ['my boiler is broken', ''], ['Sarah', ''], ['07700 900123', '']];
    cases.forEach(([txt, want]) => ok('intent "' + txt + '" -> ' + (want || 'none'), w.vIntent(txt) === want, 'got ' + w.vIntent(txt)));
  }

  console.log('\n=== 8. CRM credentials: wrong details are caught and pinpointed ===');
  {
    const { w } = boot(); await wait(250);
    let p = w.crmCredProblems('pipedrive', { token: 'not-a-real-token', domain: 'gmail.com' });
    ok('pipedrive: both fields flagged', p.length === 2, JSON.stringify(p));
    ok('pipedrive: token problem named', /API token/i.test(p[0].field), p[0] && p[0].field);
    ok('pipedrive: domain problem explains the format', /pipedrive\.com/i.test(p[1].msg), p[1] && p[1].msg);
    p = w.crmCredProblems('pipedrive', { token: 'a'.repeat(39), domain: 'acme.pipedrive.com' });
    ok('pipedrive: 39-char token rejected', p.length === 1 && /40/.test(p[0].msg), JSON.stringify(p));
    p = w.crmCredProblems('pipedrive', { token: 'a1b2c3d4e5'.repeat(4), domain: 'https://acme.pipedrive.com/' });
    ok('pipedrive: correct details pass', p.length === 0, JSON.stringify(p));
    p = w.crmCredProblems('hubspot', { token: 'abc123', portal: 'xyz' });
    ok('hubspot: prefix + digits flagged', p.length === 2 && /pat-/.test(p[0].msg) && /digit/i.test(p[1].msg), JSON.stringify(p));
    p = w.crmCredProblems('hubspot', { token: 'pat-eu1-' + 'a'.repeat(30), portal: '24123456' });
    ok('hubspot: correct details pass', p.length === 0, JSON.stringify(p));
    p = w.crmCredProblems('generic_webhook', { account: 'http://insecure.example.com' });
    ok('webhook: http rejected, https required', p.length === 1 && /https/i.test(p[0].msg), JSON.stringify(p));
    p = w.crmCredProblems('generic_webhook', { account: 'https://api.yourapp.com/hooks/alsaiti' });
    ok('webhook: valid https passes', p.length === 0);
    p = w.crmCredProblems('pipedrive', {});
    ok('empty fields report as required', p.length === 2 && /required/i.test(p[0].msg), JSON.stringify(p));
  }

  console.log('\n=== 9. the failure popup actually appears in the DOM ===');
  {
    const { w } = boot(); await wait(250);
    w.location.hash = '#/integrations'; w.render(); await wait(40);
    w.crmOpenWizard('pipedrive');
    w.CRMWIZ.step = 1; w.CRMWIZ.draft.authed = true;
    w.crmSetCred('token', 'oops'); w.crmSetCred('domain', 'wrong');
    w.crmWizNext();
    const modal = w.document.getElementById('crmmodal').innerHTML;
    ok('popup says Pipedrive did not connect', /Pipedrive did not connect/i.test(modal), modal.slice(0, 200));
    ok('popup tells them to check their details', /correct details/i.test(modal));
    ok('popup pinpoints both fields', /API token/i.test(modal) && /Company domain/i.test(modal));
    ok('wizard did not advance', w.CRMWIZ.step === 1, 'step=' + w.CRMWIZ.step);
    // now fix them and continue
    w.crmSetCred('token', 'a1b2c3d4e5'.repeat(4)); w.crmSetCred('domain', 'acme.pipedrive.com');
    w.crmRenderWizard();
    w.crmWizNext();
    ok('wizard advances once details are right', w.CRMWIZ.step === 2, 'step=' + w.CRMWIZ.step);
  }

  console.log('\n=== 10. backend panel validation ===');
  {
    const { w } = boot(); await wait(250);
    w.bkOpenPanel(); await wait(20);
    w.document.getElementById('bkurl').value = 'supabase.co';
    w.document.getElementById('bkanon').value = 'short';
    w.bkConnect();
    const modal = w.document.getElementById('crmmodal').innerHTML;
    ok('supabase popup shown', /Supabase did not connect/i.test(modal), modal.slice(0, 160));
    ok('URL format explained', /YOUR_REF\.supabase\.co/.test(modal));
    ok('anon key problem explained', /publishable key/i.test(modal));
  }

  console.log('\n=== 11. ending a call stops everything ===');
  {
    const { w } = boot();
    const log = [];
    installSpeechMocks(w, log);
    await wait(250);
    w.demoLogin(); w.location.hash = '#/voice'; w.render(); await wait(60);
    w.__say("hello");
    w.voiceStart();
    await wait(400);
    w.voiceEnd();
    const startsAtEnd = w.__recStarts;
    await wait(900);
    ok('mic does not re-open after End call', w.__recStarts === startsAtEnd, startsAtEnd + ' -> ' + w.__recStarts);
    ok('call marked inactive', w.VOICE.active === false);
    ok('phase reset to idle', w.VOICE.phase === 'idle', w.VOICE.phase);
  }

  console.log('\n=== 12. answering the wrong question does not lose the detail ===');
  {
    const { w } = boot();
    const log = [];
    installSpeechMocks(w, log);
    await wait(250);
    w.demoLogin(); w.location.hash = '#/voice'; w.render(); await wait(60);
    w.__say("Hi it's Sarah, my boiler is leaking and it's urgent");
    w.__say('07700 900123');            // answers the SERVICE question with a phone number
    w.__say('emergency boiler repair');
    w.voiceStart();
    await wait(5000);
    const L = w.getLeads()[0] || {};
    ok('lead created', /sarah/i.test(L.name || ''), L.name);
    ok('the early phone number was kept', /900123/.test(String(L.phone)), L.phone);
    ok('the phone was not stored as the service', !/^[\d +]+$/.test(String(L.service)), L.service);
    ok('service captured on the retry', /boiler/i.test(L.service || ''), L.service);
    ok('urgency High', L.urgency === 'High', L.urgency);
  }

  console.log('\n---------------------------------------------');
  console.log('PASS ' + pass + '   FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
