/* Deterministic extraction from a call transcript.
 *
 * The LLM does the talking and is asked to return structured facts, but an LLM will
 * occasionally return nothing, or hallucinate a number that was never said. This module is the
 * safety net: it reads the caller's own words and pulls out what is verifiably there. Where the
 * two disagree about a phone number, this wins — a wrong callback number is a lost lead.
 *
 * Pure functions, no I/O, so the behaviour is testable without a phone call.
 */

/** UK and international dialling formats, as a person actually says or types them. */
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?){2,5}\d{2,4}/g;
const EMAIL_RE = /[^\s@<>()]+@[^\s@<>().]+(?:\.[^\s@<>().]+)+/g;

/** Spoken digits, because callers read numbers aloud on the phone. */
const SPOKEN = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', double: 'x2', triple: 'x3',
};

/**
 * Turn "oh seven seven double oh nine" into "0770099".
 * Callers do this constantly and a raw regex misses all of it.
 */
export function digitsFromWords(text) {
  const words = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
  let out = '', repeat = 0;
  for (const w of words) {
    if (/^\d+$/.test(w)) { out += w; repeat = 0; continue; }
    const m = SPOKEN[w];
    if (!m) { repeat = 0; continue; }
    if (m === 'x2') { repeat = 2; continue; }
    if (m === 'x3') { repeat = 3; continue; }
    out += repeat ? m.repeat(repeat) : m;
    repeat = 0;
  }
  return out;
}

/** Digits only, so two spellings of the same number compare equal. */
const bare = (s) => String(s || '').replace(/\D/g, '');

/**
 * Normalise to E.164 where we can do so safely.
 * Returns the original when the country is genuinely ambiguous — a wrong prefix is worse than
 * an unnormalised number, because it dials someone else.
 */
export function toE164(raw, defaultCountry = 'GB') {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^\+/.test(s)) return '+' + bare(s);
  const d = bare(s);
  if (!d) return null;
  if (defaultCountry === 'GB') {
    if (d.length === 11 && d.startsWith('0')) return '+44' + d.slice(1);   // 07700 900112
    if (d.length === 10 && d.startsWith('7')) return '+44' + d;            // 7700 900112
    if (d.startsWith('44') && d.length >= 12) return '+' + d;
  }
  return d.length >= 7 ? s : null;                                        // too short to be real
}

/** The best phone number in a body of text, preferring one long enough to dial. */
export function findPhone(text, defaultCountry = 'GB') {
  const candidates = [];
  for (const m of String(text || '').matchAll(PHONE_RE)) {
    const d = bare(m[0]);
    if (d.length >= 9 && d.length <= 15) candidates.push(m[0].trim());
  }
  const spoken = digitsFromWords(text);
  if (spoken.length >= 9 && spoken.length <= 15) candidates.push(spoken);
  if (!candidates.length) return null;
  // longest wins: a caller who corrects themselves usually gives the full number second
  candidates.sort((a, b) => bare(b).length - bare(a).length);
  return toE164(candidates[0], defaultCountry);
}

export function findEmail(text) {
  const m = String(text || '')
    // "sarah at example dot com" — how people say an address out loud
    .replace(/\s+at\s+/gi, '@').replace(/\s+dot\s+/gi, '.')
    .match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

const NAME_CUES = [
  /(?:my name is|this is|it'?s|i am|i'?m|speaking,?\s*)\s+([a-z][a-z'’-]+(?:\s+[a-z][a-z'’-]+){0,2})/i,
  /^([a-z][a-z'’-]+(?:\s+[a-z][a-z'’-]+){0,2})\s+(?:here|calling)/i,
];
const NOT_NAMES = /^(yes|no|hello|hi|hey|thanks|thank|okay|ok|sure|please|sorry|calling|there|good|morning|afternoon|evening)$/i;

/** A caller's name, from how they actually introduce themselves. */
export function findName(text) {
  const s = String(text || '').trim();
  for (const re of NAME_CUES) {
    const m = s.match(re);
    if (!m) continue;
    const words = m[1].trim().split(/\s+/).filter((w) => !NOT_NAMES.test(w));
    if (!words.length) continue;
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  return null;
}

/**
 * Merge what the model reported with what the caller demonstrably said.
 *
 * Precedence is deliberate. For a phone number the transcript wins outright, because an
 * invented number silently breaks the callback. For everything else the model's version is
 * kept when it has one, since it has the conversational context to know which of three
 * mentioned services the caller actually wants.
 */
export function reconcile(modelFacts, transcriptText, defaultCountry = 'GB') {
  const f = Object.assign({}, modelFacts || {});
  const heard = {
    phone: findPhone(transcriptText, defaultCountry),
    email: findEmail(transcriptText),
    name: findName(transcriptText),
  };
  const modelPhone = f.phone ? toE164(f.phone, defaultCountry) : null;
  f.phone = heard.phone || modelPhone || null;
  if (modelPhone && heard.phone && bare(modelPhone) !== bare(heard.phone)) {
    f.phone_conflict = { model: modelPhone, transcript: heard.phone };
  }
  f.email = f.email || heard.email || null;
  f.name = f.name || heard.name || null;
  return f;
}
