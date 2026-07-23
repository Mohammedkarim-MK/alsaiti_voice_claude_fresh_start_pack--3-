// POST /functions/v1/tts   { text, lang, gender }
// Auth: verify_jwt = false — callable with the anon key so the demo can speak without a login.
// The provider API key stays server-side. Protected by a strict per-IP rate limit + a text-length
// cap so it can't be abused to run up your TTS bill. Flip verify_jwt to true (config.toml) to
// restrict it to signed-in users in production.

import { preflight, json, fail } from '../_shared/http.ts';
import { enforceLimit, ipBucket } from '../_shared/ratelimit.ts';
import { synthesize, ttsProvider, Gender } from '../_shared/tts.ts';

const MAX_CHARS = 320;               // one receptionist line; keeps latency + cost bounded
const TTS_LIMIT = { limit: 40, windowSeconds: 60 }; // per IP

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  const limited = await enforceLimit(ipBucket(req, 'tts'), TTS_LIMIT);
  if (limited) return limited;

  try {
    if (!ttsProvider()) return fail('no_tts_provider', 501); // no ELEVENLABS/OPENAI key configured
    const body = await req.json().catch(() => ({}));
    let text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return fail('missing_text', 400);
    if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
    const lang = typeof body.lang === 'string' ? body.lang.slice(0, 5) : 'en';
    const gender: Gender = body.gender === 'male' ? 'male' : 'female';

    const out = await synthesize(text, lang, gender);
    return json({ ok: true, provider: out.provider, mime: out.mime, audio: out.audioB64 });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (msg === 'no_tts_provider') return fail('no_tts_provider', 501);
    return fail('tts_failed', 502, msg); // detail logged server-side only
  }
});
