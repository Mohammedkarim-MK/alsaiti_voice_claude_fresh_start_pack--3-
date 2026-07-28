/* The double-voice bug, head on: neural TTS + device fallback must NEVER both be audible,
   and each distinct line must cost exactly one network request. */
const REPO = require('path').join(__dirname, '..');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const HTML = fs.readFileSync(REPO + '/docs/index.html', 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' :: ' + x : '')); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

/* A audio-channel monitor: anything that makes a sound must be exclusive. */
function boot(ttsDelay, ttsMode) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', e => errors.push(String(e.message || e)));
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.onerror = m => errors.push(String(m));
  const channel = { playing: null, timeline: [], overlaps: 0, requests: [] };
  const startSound = (src, id) => {
    if (channel.playing) { channel.overlaps++; channel.timeline.push('OVERLAP(' + channel.playing.src + ' + ' + src + ')'); }
    channel.playing = { src, id };
    channel.timeline.push('start:' + src);
  };
  const stopSound = () => { if (channel.playing) { channel.timeline.push('stop:' + channel.playing.src); channel.playing = null; } };

  // device voice
  let live = [];
  w.SpeechSynthesisUtterance = function (t) { this.text = t; };
  w.speechSynthesis = {
    getVoices: () => [{ name: 'Google UK English Female', lang: 'en-GB', localService: false }],
    cancel() { live.forEach(u => u.cancelled = true); live = []; stopSound(); },
    speak(u) {
      live.push(u);
      // the silent iOS audio-unlock utterance (volume 0) makes no sound
      const audible = u.volume !== 0;
      if (audible) startSound('device');
      setTimeout(() => { if (u.cancelled) return; if (audible) stopSound(); if (u.onend) u.onend(); }, 30);
    }
  };
  // neural voice
  w.Audio = function (src) {
    const self = this; this.onended = null; this.onerror = null;
    this.play = () => { startSound('neural'); setTimeout(() => { if (self.stopped) return; stopSound(); if (self.onended) self.onended(); }, 30); return Promise.resolve(); };
    this.pause = () => { self.stopped = true; stopSound(); };
  };
  // backend
  w.fetch = (url, opts) => {
    channel.requests.push({ url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : null });
    return new Promise(res => setTimeout(() => {
      const body = ttsMode === 'error' ? { error: 'no_tts_provider' } : { ok: true, audio: 'QUJD', mime: 'audio/mpeg' };
      res({ ok: ttsMode !== 'http500', status: ttsMode === 'http500' ? 500 : 200, json: () => Promise.resolve(body) });
    }, ttsDelay));
  };
  // scripted caller
  const queue = [];
  w.__say = t => queue.push(t);
  w.__recStarts = 0;
  function SR() { }
  SR.prototype.start = function () {
    w.__recStarts++;
    const self = this;
    setTimeout(() => {
      if (self.aborted) return;
      const n = queue.shift();
      if (n != null && self.onresult) self.onresult({ resultIndex: 0, results: [{ 0: { transcript: n }, isFinal: true, length: 1 }] });
      if (self.onend) self.onend();
    }, 4);
  };
  SR.prototype.stop = function () { if (this.onend) this.onend(); };
  SR.prototype.abort = function () { this.aborted = true; };
  w.SpeechRecognition = SR;
  return { w, channel, errors };
}

(async () => {
  console.log('=== fast neural voice (200ms): only the neural voice is heard ===');
  {
    const { w, channel, errors } = boot(200, 'ok');
    await wait(300);
    w.demoLogin(); w.location.hash = '#/voice'; w.render(); await wait(50);
    ok('backend is configured by default', w.humanVoiceOn() === true);
    w.__say('Sarah'); w.__say('boiler repair'); w.__say('yes urgent'); w.__say('07700 900123');
    w.voiceStart();
    await wait(5000);
    ok('no two voices ever overlapped', channel.overlaps === 0, channel.timeline.filter(x => /OVERLAP/.test(x)).join(' | '));
    const neural = channel.timeline.filter(x => x === 'start:neural').length;
    const device = channel.timeline.filter(x => x === 'start:device').length;
    ok('every line used the neural voice', neural >= 5, 'neural=' + neural);
    ok('the device voice never had to step in', device === 0, 'device=' + device);
    ok('a lead was created', w.getLeads()[0] && /sarah/i.test(w.getLeads()[0].name), w.getLeads()[0] && w.getLeads()[0].name);
    // one request per distinct line
    const lines = channel.requests.filter(r => /\/tts$/.test(r.url)).map(r => r.body.text);
    const dupes = lines.filter((l, i) => lines.indexOf(l) !== i);
    ok('no line was fetched twice', dupes.length === 0, 'duplicated: ' + dupes.join(' // '));
    ok('no errors', errors.length === 0, errors.join(' | '));
  }

  console.log('\n=== slow network (4s): device voice covers, neural must NOT double up ===');
  {
    const { w, channel, errors } = boot(4000, 'ok');
    await wait(300);
    w.demoLogin(); w.location.hash = '#/voice'; w.render(); await wait(50);
    w.__say('Priya');
    w.voiceStart();
    await wait(6000);
    ok('no overlap even when the neural audio lands late', channel.overlaps === 0, channel.timeline.filter(x => /OVERLAP/.test(x)).join(' | '));
    ok('the device voice covered the gap', channel.timeline.some(x => x === 'start:device'));
    ok('no errors', errors.length === 0, errors.join(' | '));
  }

  console.log('\n=== TTS unavailable: falls back cleanly, still one voice ===');
  {
    const { w, channel, errors } = boot(120, 'error');
    await wait(300);
    w.demoLogin(); w.location.hash = '#/voice'; w.render(); await wait(50);
    w.__say('Tom'); w.__say('gutter cleaning'); w.__say('no rush'); w.__say('01614960123');
    w.voiceStart();
    await wait(5000);
    ok('no overlap', channel.overlaps === 0, channel.timeline.filter(x => /OVERLAP/.test(x)).join(' | '));
    ok('device voice took over', channel.timeline.filter(x => x === 'start:device').length >= 4);
    ok('it stopped asking the backend once it said no provider', channel.requests.filter(r => /\/tts$/.test(r.url)).length <= 5,
      'requests=' + channel.requests.filter(r => /\/tts$/.test(r.url)).length);
    ok('lead still created', w.getLeads()[0] && /tom/i.test(w.getLeads()[0].name), w.getLeads()[0] && w.getLeads()[0].name);
    ok('no errors', errors.length === 0, errors.join(' | '));
  }

  console.log('\n=== backend 500: never silent, never doubled ===');
  {
    const { w, channel, errors } = boot(120, 'http500');
    await wait(300);
    w.demoLogin(); w.location.hash = '#/voice'; w.render(); await wait(50);
    w.__say('Ana');
    w.voiceStart();
    await wait(2500);
    ok('no overlap', channel.overlaps === 0);
    ok('still spoke', channel.timeline.some(x => /^start:/.test(x)));
    ok('no errors', errors.length === 0, errors.join(' | '));
  }

  console.log('\n=== interrupting the assistant mid-sentence stops it dead ===');
  {
    const { w, channel, errors } = boot(150, 'ok');
    await wait(300);
    w.demoLogin(); w.location.hash = '#/voice'; w.render(); await wait(50);
    w.voiceStart();
    await wait(500);              // assistant is speaking the greeting
    w.VOICE.phase = 'speaking';
    w.voiceMic();                 // barge in
    await wait(400);
    ok('barge-in silenced the assistant', channel.playing === null, JSON.stringify(channel.playing));
    ok('no overlap', channel.overlaps === 0);
    w.voiceEnd();
    await wait(300);
    ok('nothing is playing after End call', channel.playing === null);
    ok('no errors', errors.length === 0, errors.join(' | '));
  }

  console.log('\n---------------------------------------------');
  console.log('PASS ' + pass + '   FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
