/* The call lifecycle, independent of LiveKit.
 *
 * Everything that decides what happens to a caller lives here, driven through a small `io`
 * interface. agent.js supplies a real LiveKit implementation; the tests supply a fake one. That
 * split is the point: the rules a business is held to are testable without a phone line, an
 * SDK, or a credential.
 */

import { reconcile } from './extract.js';
import { urgencyOf, transferDecision, disposition, leadFromCall } from './qualify.js';
import * as realStore from './store.js';

const log = (level, event, fields) => console[level === 'error' ? 'error' : 'log'](
  JSON.stringify(Object.assign({ level, event, at: new Date().toISOString() }, fields || {})));

/**
 * Run one call start to finish.
 *
 * `io` must provide: say(text), listen(), onSpeechStart(cb), transfer(number), hangup(),
 * collectFacts(turns) — and nothing else. Keeping that surface small is what makes the
 * LiveKit layer thin enough to trust without being able to run it here.
 */
export async function runCall(io, ctx, storeImpl) {
  // Injected so the lifecycle — especially the exactly-once guarantee — can be tested without
  // a database. Defaults to the real Supabase-backed store.
  const store = storeImpl || realStore;
  const { provider, providerCallId, from, to } = ctx;
  const started = Date.now();
  const turns = [];
  let session = null;

  try {
    const number = await store.workspaceForNumber(to);
    if (!number) {
      // A call to a number we do not own must not be silently dropped on the floor.
      log('error', 'unknown_number', { to, provider_call_id: providerCallId });
      await io.say("Sorry, this number isn't in service. Goodbye.");
      return { status: 'unknown_number' };
    }

    const claim = await store.claimCall({
      workspaceId: number.workspace_id, provider, providerCallId, from, to,
    });
    session = claim.session;
    if (!claim.fresh) {
      // Another worker already owns this call — a webhook retry or a reconnect. Exactly-once
      // means we hang up here rather than greeting the caller a second time (§11.4 CALL-08).
      log('warn', 'duplicate_call_ignored', { provider_call_id: providerCallId, session: session.id });
      return { status: 'duplicate', session };
    }

    const cfg = await store.assistantConfig(number.workspace_id);
    await store.updateCall(session.id, { status: 'in_progress', answered_at: new Date().toISOString() });

    /* ---- greeting, with the AI disclosure §11.2 requires ---- */
    await io.say(`Thanks for calling ${cfg.business_name}. You're speaking to an AI assistant. ` +
                 `How can I help you today?`);

    /* ---- conversation ---- */
    const MAX_TURNS = 24;                 // a hard stop; nobody should be trapped on a loop
    let silences = 0;
    for (let i = 0; i < MAX_TURNS; i++) {
      const heard = await io.listen();
      if (heard === null) { log('info', 'caller_hung_up', { session: session.id }); break; }
      if (!heard || !heard.trim()) {
        silences++;
        // Two prompts, then stop pestering someone who may have put the phone down (CALL-04).
        if (silences >= 2) { await io.say("I'll let you go — call back any time and we'll pick this up."); break; }
        await io.say("Sorry, I didn't catch that. Are you still there?");
        continue;
      }
      silences = 0;
      turns.push({ role: 'caller', text: heard, at: Date.now() - started });
      const reply = await io.respond(heard, turns);
      if (reply) { turns.push({ role: 'assistant', text: reply, at: Date.now() - started }); await io.say(reply); }
      if (io.isComplete && io.isComplete()) break;
    }

    /* ---- what did we learn ---- */
    const transcriptText = turns.filter((t) => t.role === 'caller').map((t) => t.text).join('\n');
    const facts = reconcile(await io.collectFacts(turns), transcriptText);
    if (!facts.urgency) facts.urgency = urgencyOf(transcriptText);

    /* ---- transfer, if the rules say so ---- */
    const events = {};
    const decision = transferDecision(facts, cfg);
    if (decision.transfer) {
      events.transfer_attempted = true;
      await io.say('This sounds urgent — let me put you through to someone now.');
      try {
        events.transfer_succeeded = await io.transfer(decision.to);
      } catch (e) {
        events.transfer_succeeded = false;
        log('error', 'transfer_error', { session: session.id, error: String(e?.message || e) });
      }
      if (!events.transfer_succeeded) {
        // §11.2: if the transfer fails, the caller is not abandoned.
        await io.say("I couldn't reach the team just now, so I've flagged this as urgent and " +
                     'someone will call you straight back.');
      }
    }

    /* ---- outcome ---- */
    const outcome = disposition(facts, cfg, events);
    let lead = null;
    if (outcome.createLead) {
      const made = await store.createLeadOnce(session, leadFromCall(facts, session));
      lead = made.lead;
      if (made.created && outcome.notify) {
        await store.queueNotification(session, outcome.notify, `Call from ${facts.name || from || 'a caller'}`);
      }
    }
    if (outcome.callbackTask) {
      await store.activity(session, 'sync_failed', { reason: 'transfer_failed', callback_required: true, phone: facts.phone });
    }

    await store.saveTranscript(session, turns, facts.consent !== false);
    await store.updateCall(session.id, {
      status: outcome.status, ended_at: new Date().toISOString(),
    });

    log('info', 'call_complete', {
      session: session.id, provider_call_id: providerCallId, status: outcome.status,
      lead_id: lead?.id || null, turns: turns.length, duration_ms: Date.now() - started,
      transferred: !!events.transfer_succeeded, urgency: facts.urgency,
    });
    return { status: outcome.status, session, lead, facts, turns };
  } catch (e) {
    log('error', 'call_failed', { provider_call_id: providerCallId, error: String(e?.message || e) });
    // A crash mid-call must still leave a record that a call happened, or the business simply
    // never learns someone rang.
    if (session) {
      try {
        await store.updateCall(session.id, { status: 'error', ended_at: new Date().toISOString() });
        await store.activity(session, 'called', { error: String(e?.message || e), turns: turns.length });
      } catch { /* already failing; do not mask the original error */ }
    }
    try { await io.say('Sorry, something went wrong on our end. Please call back and we\'ll help.'); } catch { }
    return { status: 'error', session, error: String(e?.message || e) };
  }
}
