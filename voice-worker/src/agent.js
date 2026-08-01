/* The LiveKit seam.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *  THIS IS THE ONE FILE IN THE WORKER THAT HAS NEVER BEEN RUN.
 *
 *  Everything else — extraction, qualification, transfer rules, the exactly-once guarantee —
 *  is covered by 40 tests that run without a network. This file cannot be, because it needs a
 *  real LiveKit deployment, a real SIP trunk and a real phone call. Expect to adjust it against
 *  the SDK version you actually install; treat the surrounding modules as settled and this one
 *  as a first draft.
 *
 *  It is deliberately thin for that reason. All it does is translate LiveKit's events into the
 *  seven-method `io` interface that call.js consumes, so that when the SDK changes, the rules
 *  do not.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import { runCall } from './call.js';

/**
 * Build the `io` object call.js expects from a LiveKit session.
 * Keeping this mapping in one function is what makes the rest of the worker SDK-agnostic.
 */
function ioFromSession(session) {
  const facts = {};
  let done = false;

  return {
    async say(text) {
      await session.say(text, { allowInterruptions: true });
    },

    /** Resolve with what the caller said, '' on silence, or null if they hung up. */
    async listen() {
      const TIMEOUT = Number(process.env.SILENCE_MS || 7000);
      return await new Promise((resolve) => {
        let settled = false;
        const finish = (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } };
        const timer = setTimeout(() => finish(''), TIMEOUT);
        session.once('user_speech_committed', (ev) => finish(ev?.text || ev?.alternatives?.[0]?.text || ''));
        session.once('close', () => finish(null));
        session.once('disconnected', () => finish(null));
      });
    },

    /** One assistant turn. The LLM plugin owns the wording; we own the rules. */
    async respond(heard, turns) {
      const r = await session.generateReply({
        userInput: heard,
        // Turn history is passed so the model does not re-ask for what it already has —
        // §11.2 is explicit that repeating questions is a defect.
        chatCtx: turns.map((t) => ({ role: t.role === 'caller' ? 'user' : 'assistant', content: t.text })),
      });
      const text = r?.text || r?.content || '';
      if (/\b(goodbye|thanks for calling|speak soon)\b/i.test(text)) done = true;
      return text;
    },

    /** Ask the model for structured facts. call.js reconciles this against the transcript. */
    async collectFacts(turns) {
      try {
        const r = await session.generateReply({
          userInput: 'Return ONLY JSON with keys name, phone, email, service, urgency ' +
                     '(High|Medium|Low), summary, spam (boolean). Use null for anything not said.',
          chatCtx: turns.map((t) => ({ role: t.role === 'caller' ? 'user' : 'assistant', content: t.text })),
          responseFormat: { type: 'json_object' },
        });
        const raw = r?.text || r?.content || '{}';
        return Object.assign(facts, JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '')));
      } catch {
        // A model that returns nothing usable must not cost us the call. The deterministic
        // extractor in extract.js still reads the transcript.
        return facts;
      }
    },

    /** SIP REFER to a human. Returns false rather than throwing on a normal refusal. */
    async transfer(number) {
      try {
        const r = await session.transferSip?.({ transferTo: 'tel:' + number, playDialtone: true });
        return r !== false;
      } catch {
        return false;
      }
    },

    isComplete: () => done,
  };
}

export async function start({ mark, bump, log }) {
  const agents = await import('@livekit/agents');
  const openai = await import('@livekit/agents-plugin-openai');

  const worker = new agents.WorkerOptions({
    agent: async (job) => {
      await job.connect();
      const room = job.room;

      /* SIP puts the call metadata on the participant. Without a call id there is no
         exactly-once guarantee, so fall back to the room name, which is unique per call. */
      const p = await job.waitForParticipant();
      const attrs = p?.attributes || {};
      const ctx = {
        provider: 'telnyx',
        providerCallId: attrs['sip.callID'] || room?.name,
        from: attrs['sip.phoneNumber'] || attrs['sip.from'] || null,
        to: attrs['sip.trunkPhoneNumber'] || attrs['sip.to'] || null,
      };

      const session = new agents.voice.AgentSession({
        stt: new openai.STT(),
        llm: new openai.LLM({ model: process.env.LLM_MODEL || 'gpt-4o-mini' }),
        tts: new openai.TTS({ voice: process.env.TTS_VOICE || 'nova' }),
      });
      await session.start({ room });

      mark({ agent: 'connected' });
      const result = await runCall(ioFromSession(session), ctx);
      // Increment through the counters, never assign — passing `undefined` here would wipe
      // the running total and report `calls_handled: undefined` on the health endpoint.
      bump(result.status === 'error' ? 'callsFailed' : 'callsHandled');
      mark({ lastCallAt: new Date().toISOString() });
      log('info', 'job_finished', { status: result.status, call: ctx.providerCallId });
      try { await session.close(); } catch { /* the room may already be gone */ }
    },
  });

  mark({ agent: 'connected' });
  await agents.cli.runApp(worker);
}
