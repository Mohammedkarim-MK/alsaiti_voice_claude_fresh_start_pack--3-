// Neural text-to-speech — genuinely human voices (ElevenLabs or OpenAI), chosen by whichever
// API key is set. The key lives ONLY in the Edge Function env, never in the browser.
// Returns base64 MP3 the frontend plays with <audio>. Multilingual: EN / ES / AR, male + female.

function env(k: string): string | undefined {
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).Deno?.env.get(k) || undefined;
}

export type Gender = 'male' | 'female';
export interface TtsResult { audioB64: string; mime: string; provider: string }

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
  return btoa(bin);
}

/* ---- ElevenLabs: the most human, multilingual (one voice timbre speaks every language) ---- */
const EL_DEFAULT = {
  female: 'EXAVITQu4vr4xnSDxMaL', // "Sarah" — warm female
  male: 'onwK4e9ZLuTAKqWW03F9',   // "Daniel" — warm male
};
async function elevenlabs(text: string, gender: Gender): Promise<TtsResult> {
  const key = env('ELEVENLABS_API_KEY')!;
  const voice = env(gender === 'male' ? 'ELEVENLABS_VOICE_MALE' : 'ELEVENLABS_VOICE_FEMALE') || EL_DEFAULT[gender];
  const model = env('ELEVENLABS_MODEL') || 'eleven_multilingual_v2';
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: model,
      // Warm, expressive, human — a touch of style, high similarity for consistency.
      voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    }),
  });
  if (!r.ok) throw new Error(`elevenlabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  return { audioB64: bytesToB64(buf), mime: 'audio/mpeg', provider: 'elevenlabs' };
}

/* ---- OpenAI TTS: cheaper, very good, language inferred from the text ---- */
async function openai(text: string, gender: Gender): Promise<TtsResult> {
  const key = env('OPENAI_API_KEY')!;
  const voice = env(gender === 'male' ? 'OPENAI_VOICE_MALE' : 'OPENAI_VOICE_FEMALE') || (gender === 'male' ? 'onyx' : 'nova');
  const model = env('OPENAI_TTS_MODEL') || 'tts-1-hd';
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text, voice, response_format: 'mp3' }),
  });
  if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  return { audioB64: bytesToB64(buf), mime: 'audio/mpeg', provider: 'openai' };
}

export function ttsProvider(): 'elevenlabs' | 'openai' | null {
  if (env('ELEVENLABS_API_KEY')) return 'elevenlabs';
  if (env('OPENAI_API_KEY')) return 'openai';
  return null;
}

export async function synthesize(text: string, _lang: string, gender: Gender): Promise<TtsResult> {
  const p = ttsProvider();
  if (p === 'elevenlabs') return elevenlabs(text, gender);
  if (p === 'openai') return openai(text, gender);
  throw new Error('no_tts_provider'); // no key set
}
