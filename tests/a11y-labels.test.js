/* A11Y-01: every form control on every screen must be announced with a name. */
const REPO = require('path').join(__dirname, '..');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const HTML = fs.readFileSync(REPO + '/docs/index.html', 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function boot() {
  const vc = new VirtualConsole();
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.SpeechSynthesisUtterance = function (t) { this.text = t };
  w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { setTimeout(() => u.onend && u.onend(), 1) } };
  w.Audio = function () { return { play: () => Promise.resolve(), pause() {}, set src(v) {}, get src() { return '' } } };
  w.scrollTo = () => {}; w.scrollBy = () => {};
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
  return w;
}

/* A control is "named" if it has a <label for>, a wrapping label, aria-label, aria-labelledby,
   or (for buttons) its own text. Placeholders do NOT count — they vanish once typing starts. */
function unnamed(w) {
  return [...w.document.querySelectorAll('input,textarea,select')]
    .filter((el) => el.type !== 'hidden')
    .filter((el) => !(el.getAttribute('aria-hidden') === 'true'))
    .filter((el) => {
      if (el.labels && el.labels.length) return false;
      if (el.getAttribute('aria-label')) return false;
      const lb = el.getAttribute('aria-labelledby');
      if (lb && lb.split(/\s+/).some((id) => w.document.getElementById(id))) return false;
      if (el.closest('label')) return false;
      return true;
    })
    .map((el) => (el.tagName + '[' + (el.name || el.id || el.type || '?') + ']'));
}

(async () => {
  const SCREENS = ['landing', 'login', 'signup', 'dashboard', 'leads', 'new', 'voice', 'analytics', 'settings', 'integrations', 'phone'];
  const w = boot(); await wait(340);
  const bad = [];
  let checked = 0;

  for (const screen of SCREENS) {
    if (screen !== 'landing' && screen !== 'login' && screen !== 'signup') { try { w.demoLogin() } catch (e) {} }
    w.location.hash = '#/' + screen; w.render(); await wait(50);
    const controls = [...w.document.querySelectorAll('input,textarea,select')].filter((e) => e.type !== 'hidden');
    checked += controls.length;
    const miss = unnamed(w);
    if (miss.length) bad.push(screen + ': ' + miss.join(', '));
  }

  console.log('=== A11Y-01 form control names ===');
  console.log('controls checked across ' + SCREENS.length + ' screens: ' + checked);
  if (bad.length) { console.log('UNNAMED:'); bad.forEach((b) => console.log('   ' + b)); process.exit(1) }
  else console.log('every control has an accessible name');
})();
