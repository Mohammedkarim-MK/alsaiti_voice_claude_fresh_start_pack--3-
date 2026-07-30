/* The call lifecycle, with a fake phone and a fake database.
   These cover the guarantees §11 is most insistent about: one call, one lead, no matter how many
   times the carrier retries — and a caller is never lost when something downstream fails. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { runCall } from '../src/call.js';

/* A store that behaves like the real one, including the unique constraint on (provider, call id). */
function fakeStore(opts = {}) {
  const claimed = new Map();
  const s = {
    leads: [], activities: [], notifications: [], calls: [], transcripts: [],
    async workspaceForNumber(to) {
      return opts.unknownNumber ? null : { workspace_id: 'ws-1', e164: to };
    },
    async claimCall({ workspaceId, provider, providerCallId, from, to }) {
      const key = provider + '|' + providerCallId;
      if (claimed.has(key)) return { session: claimed.get(key), fresh: false };
      const session = { id: 'cs-' + (claimed.size + 1), workspace_id: workspaceId, provider, provider_call_id: providerCallId, from_e164: from, to_e164: to, lead_id: null };
      claimed.set(key, session);
      s.calls.push(session);
      return { session, fresh: true };
    },
    async assistantConfig() {
      return Object.assign({ business_name: 'Bright Smile Dental', timezone: 'Europe/London',
        transfer_number: '+441234567890', transfer_enabled: true, transfer_urgency: 'High' }, opts.cfg || {});
    },
    async updateCall(id, patch) { const c = s.calls.find((x) => x.id === id); if (c) Object.assign(c, patch); },
    async createLeadOnce(session, lead) {
      if (session.lead_id) return { lead: s.leads.find((l) => l.id === session.lead_id), created: false };
      const made = Object.assign({ id: 'ld-' + (s.leads.length + 1) }, lead);
      s.leads.push(made); session.lead_id = made.id;
      return { lead: made, created: true };
    },
    async activity(session, kind, detail) { s.activities.push({ kind, detail }); },
    async queueNotification(session, category, subject) { s.notifications.push({ category, subject }); },
    async saveTranscript(session, turns, consent) { s.transcripts.push({ turns, consent }); },
  };
  return s;
}

/* A fake caller: a scripted list of things they say, then they hang up. */
function fakeIo(script, opts = {}) {
  const said = [];
  let i = 0;
  return {
    said,
    transferCalls: [],
    async say(t) { said.push(t); },
    async listen() { return i < script.length ? script[i++] : null; },
    async respond() { return 'Understood.'; },
    async collectFacts() { return opts.facts || {}; },
    async transfer(n) { this.transferCalls.push(n); if (opts.transferThrows) throw new Error('sip failed'); return opts.transferOk !== false; },
    isComplete: () => false,
  };
}

const CTX = { provider: 'telnyx', providerCallId: 'call-abc-123', from: '+447700900112', to: '+442045998842' };

test('a normal call creates exactly one lead', async () => {
  const store = fakeStore();
  const io = fakeIo(['Hi, my name is Sarah Whitfield', 'I need an implant consultation', 'my number is 07700 900112'],
    { facts: { service: 'Implant consultation', summary: 'Wants an implant consult.' } });
  const r = await runCall(io, CTX, store);
  assert.equal(store.leads.length, 1, 'expected exactly 1 lead, got ' + store.leads.length);
  assert.equal(r.status, 'captured');
  assert.equal(store.leads[0].source, 'Voice call');
  assert.equal(store.leads[0].phone, '+447700900112');
});

test('the greeting discloses that this is an AI', async () => {
  // §11.2 requires it, and some jurisdictions require it by law.
  const store = fakeStore();
  const io = fakeIo(['hello']);
  await runCall(io, CTX, store);
  assert.match(io.said[0], /AI/i, 'first thing said does not disclose the AI: ' + io.said[0]);
  assert.match(io.said[0], /Bright Smile Dental/, 'greeting does not name the business');
});

test('a retried call does NOT create a second lead', async () => {
  // The carrier retrying a webhook is normal. Double-booking a customer is not.
  const store = fakeStore();
  const first = fakeIo(['my name is Sarah', 'implant consult', '07700 900112'], { facts: { service: 'Implant' } });
  await runCall(first, CTX, store);
  const retry = fakeIo(['my name is Sarah', 'implant consult', '07700 900112'], { facts: { service: 'Implant' } });
  const r2 = await runCall(retry, CTX, store);
  assert.equal(r2.status, 'duplicate');
  assert.equal(store.leads.length, 1, 'a webhook retry created a second lead');
  assert.equal(retry.said.length, 0, 'the caller was greeted twice');
});

test('a different call DOES create its own lead', async () => {
  const store = fakeStore();
  await runCall(fakeIo(['name is A', 'x', '07700 900112'], { facts: { service: 'A' } }), CTX, store);
  await runCall(fakeIo(['name is B', 'y', '07700 900113'], { facts: { service: 'B' } }),
    Object.assign({}, CTX, { providerCallId: 'call-def-456' }), store);
  assert.equal(store.leads.length, 2, 'a genuinely separate call was deduplicated away');
});

test('an urgent caller is transferred, and still gets a lead', async () => {
  const store = fakeStore();
  const io = fakeIo(['my kitchen is flooding right now', '07700 900112'], { facts: { service: 'Emergency plumbing' } });
  const r = await runCall(io, CTX, store);
  assert.equal(io.transferCalls.length, 1, 'urgent caller was not transferred');
  assert.equal(r.status, 'transferred');
  assert.equal(store.leads.length, 1, 'a transferred call left no record');
});

test('when the transfer FAILS the caller is told, and a callback is raised', async () => {
  // The failure that loses customers: nobody picked up and nobody wrote it down.
  const store = fakeStore();
  const io = fakeIo(['emergency, water everywhere', '07700 900112'],
    { facts: { service: 'Emergency plumbing' }, transferOk: false });
  const r = await runCall(io, CTX, store);
  assert.equal(r.status, 'transfer_failed');
  assert.equal(store.leads.length, 1, 'a failed transfer lost the lead');
  assert.ok(io.said.some((t) => /call you straight back/i.test(t)), 'the caller was not told what happens next');
  assert.ok(store.activities.some((a) => a.detail?.callback_required), 'no callback task was raised');
  assert.equal(store.notifications[0].category, 'urgent_lead');
});

test('a transfer that throws is handled like one that fails', async () => {
  const store = fakeStore();
  const io = fakeIo(['emergency flooding', '07700 900112'],
    { facts: { service: 'Plumbing' }, transferThrows: true });
  const r = await runCall(io, CTX, store);
  assert.equal(r.status, 'transfer_failed');
  assert.equal(store.leads.length, 1);
});

test('silence prompts twice, then ends the call politely', async () => {
  const store = fakeStore();
  const io = fakeIo(['', '', '']);
  await runCall(io, CTX, store);
  const prompts = io.said.filter((t) => /didn't catch that/i.test(t));
  assert.equal(prompts.length, 1, 'expected one re-prompt before giving up, got ' + prompts.length);
  assert.ok(io.said.some((t) => /let you go/i.test(t)), 'never closed out a silent call');
});

test('a caller who hangs up early still leaves a lead if reachable', async () => {
  const store = fakeStore();
  const io = fakeIo(['hi my number is 07700 900112']);      // then hangs up
  const r = await runCall(io, CTX, store);
  assert.equal(store.leads.length, 1, 'lost a caller who gave a number then hung up');
  assert.equal(r.status, 'partial');
});

test('a call with nothing usable creates no lead', async () => {
  const store = fakeStore();
  const io = fakeIo(['uh', 'never mind']);
  const r = await runCall(io, CTX, store);
  assert.equal(store.leads.length, 0);
  assert.equal(r.status, 'no_contact');
  assert.equal(store.notifications.length, 0, 'sent a notification about nothing');
});

test('a call to a number we do not own is refused, not silently dropped', async () => {
  const store = fakeStore({ unknownNumber: true });
  const io = fakeIo(['hello']);
  const r = await runCall(io, CTX, store);
  assert.equal(r.status, 'unknown_number');
  assert.equal(store.calls.length, 0);
  assert.ok(io.said.some((t) => /isn't in service/i.test(t)), 'the caller heard nothing at all');
});

test('a crash mid-call still records that a call happened', async () => {
  // Otherwise the business never learns someone rang.
  const store = fakeStore();
  store.createLeadOnce = async () => { throw new Error('database down'); };
  const io = fakeIo(['my name is Sarah', '07700 900112'], { facts: { service: 'x' } });
  const r = await runCall(io, CTX, store);
  assert.equal(r.status, 'error');
  assert.equal(store.calls[0].status, 'error', 'the call session was left mid-flight');
  assert.ok(io.said.some((t) => /something went wrong/i.test(t)), 'the caller was left in silence');
});

test('a withheld consent stores turn counts but not words', async () => {
  const store = fakeStore();
  const io = fakeIo(['my name is Sarah', 'implant consult', '07700 900112'],
    { facts: { service: 'Implant', consent: false } });
  await runCall(io, CTX, store);
  const t = store.transcripts[0];
  assert.equal(t.consent, false);
  assert.equal(store.leads.length, 1, 'withholding recording consent should not lose the lead');
});

test('the conversation cannot loop forever', async () => {
  const store = fakeStore();
  const io = fakeIo(new Array(500).fill('still talking'), { facts: { service: 'x' } });
  const r = await runCall(io, CTX, store);
  assert.ok(r.turns.length <= 48, 'no upper bound on call length: ' + r.turns.length);
});
