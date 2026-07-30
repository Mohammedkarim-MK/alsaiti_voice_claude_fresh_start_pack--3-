/* The decisions a business will hold us to, tested without a phone line, a LiveKit credential
   or a network. If these are wrong, real callers are lost — so they are tested properly rather
   than left to be discovered on a live call. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { digitsFromWords, toE164, findPhone, findEmail, findName, reconcile } from '../src/extract.js';
import { urgencyOf, scoreOf, isQualified, transferDecision, withinHours, disposition, leadFromCall } from '../src/qualify.js';

/* ---------------------------------------------------------------- extraction */

test('spoken digits become a number', () => {
  assert.equal(digitsFromWords('oh seven seven double oh nine'), '077009');
  assert.equal(digitsFromWords('triple eight two'), '8882');
  assert.equal(digitsFromWords('no digits here'), '');
});

test('UK numbers normalise to E.164', () => {
  assert.equal(toE164('07700 900112'), '+447700900112');
  assert.equal(toE164('7700900112'), '+447700900112');
  assert.equal(toE164('+44 7700 900112'), '+447700900112');
  assert.equal(toE164('  '), null);
});

test('an ambiguous number is left alone rather than given a wrong country code', () => {
  // Better to store something a human can read than to dial a stranger.
  const out = toE164('555 0199 22', 'GB');
  assert.ok(out === null || !out.startsWith('+44'), 'guessed +44 for an ambiguous number: ' + out);
});

test('a number that is too short is rejected, not padded', () => {
  assert.equal(toE164('12345'), null);
  assert.equal(findPhone('call me on 123'), null);
});

test('the longest candidate wins when a caller corrects themselves', () => {
  const said = "it's 7700 900 — sorry, 07700 900112";
  assert.equal(findPhone(said), '+447700900112');
});

test('emails survive being read aloud', () => {
  assert.equal(findEmail('sarah at example dot com'), 'sarah@example.com');
  assert.equal(findEmail('s.whitfield@example.co.uk please'), 's.whitfield@example.co.uk');
  assert.equal(findEmail('no address here'), null);
});

test('names come from how people introduce themselves', () => {
  assert.equal(findName('Hi, my name is Sarah Whitfield'), 'Sarah Whitfield');
  assert.equal(findName("it's james okoro calling"), 'James Okoro');
  assert.equal(findName('hello there'), null, 'greeting mistaken for a name');
  assert.equal(findName('yes please'), null, 'filler mistaken for a name');
});

test('the transcript beats the model on phone numbers', () => {
  // An invented callback number silently breaks the follow-up, so the caller's own words win.
  const f = reconcile({ phone: '+447000000000', name: 'Sarah' }, 'you can reach me on 07700 900112');
  assert.equal(f.phone, '+447700900112');
  assert.ok(f.phone_conflict, 'a disagreement should be recorded for review');
});

test('the model keeps precedence on service, where it has the context', () => {
  const f = reconcile({ service: 'Invisalign consult' }, 'I asked about whitening and implants and Invisalign');
  assert.equal(f.service, 'Invisalign consult');
});

/* ---------------------------------------------------------------- qualification */

test('urgency reads the words a caller actually uses', () => {
  assert.equal(urgencyOf('my kitchen is flooding right now'), 'High');
  assert.equal(urgencyOf('I have severe pain'), 'High');
  assert.equal(urgencyOf('sometime this week would be fine'), 'Medium');
  assert.equal(urgencyOf('just browsing options for next year'), 'Low');
});

test('contactability outweighs urgency in the score', () => {
  const reachableCalm = scoreOf({ phone: '+447700900112', name: 'A', service: 'x', urgency: 'Low' });
  const unreachableUrgent = scoreOf({ name: 'B', service: 'x', urgency: 'High' });
  assert.ok(reachableCalm > unreachableUrgent,
    `a reachable calm caller (${reachableCalm}) should outrank an unreachable urgent one (${unreachableUrgent})`);
});

test('spam scores near zero and never qualifies', () => {
  assert.ok(scoreOf({ spam: true, phone: '+447700900112', service: 'x' }) < 20);
  assert.equal(isQualified({ spam: true, phone: '+447700900112', service: 'x' }), false);
});

test('no way to reply is not a lead', () => {
  assert.equal(isQualified({ service: 'implant consult', summary: 'wants a quote' }), false);
  assert.equal(isQualified({ phone: '+447700900112', service: 'implant consult' }), true);
});

/* ---------------------------------------------------------------- transfer */

const CFG = { transfer_number: '+441234567890', transfer_enabled: true, transfer_urgency: 'High' };

test('an urgent caller is transferred', () => {
  const d = transferDecision({ urgency: 'High' }, CFG);
  assert.equal(d.transfer, true);
  assert.equal(d.to, '+441234567890');
});

test('a non-urgent caller is not', () => {
  assert.equal(transferDecision({ urgency: 'Low' }, CFG).transfer, false);
});

test('no configured number means no transfer, whatever the urgency', () => {
  const d = transferDecision({ urgency: 'High' }, { transfer_enabled: true });
  assert.equal(d.transfer, false);
  assert.equal(d.reason, 'no_transfer_number');
});

test('spam is never put through to a human', () => {
  assert.equal(transferDecision({ urgency: 'High', spam: true }, CFG).transfer, false);
});

test('opening hours are respected', () => {
  const hours = { mon: [['09:00', '17:00']], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
  const monday10 = new Date('2026-07-27T10:00:00');   // a Monday
  const monday20 = new Date('2026-07-27T20:00:00');
  const tuesday10 = new Date('2026-07-28T10:00:00');
  assert.equal(withinHours(hours, null, monday10), true);
  assert.equal(withinHours(hours, null, monday20), false, 'transferred outside opening hours');
  assert.equal(withinHours(hours, null, tuesday10), false, 'transferred on a closed day');
});

test('no configured hours means always available', () => {
  assert.equal(withinHours(null, null, new Date()), true);
});

/* ---------------------------------------------------------------- disposition */

test('a successful transfer still creates the lead', () => {
  // The person is on the phone with a human, but the record must exist regardless.
  const d = disposition({ phone: '+447700900112', service: 'x', urgency: 'High' }, CFG, { transfer_attempted: true, transfer_succeeded: true });
  assert.equal(d.createLead, true);
  assert.equal(d.status, 'transferred');
});

test('a FAILED transfer creates the lead and a callback task', () => {
  // The failure mode that loses customers: nobody answered, and nobody wrote it down.
  const d = disposition({ phone: '+447700900112', service: 'x', urgency: 'High' }, CFG, { transfer_attempted: true, transfer_succeeded: false });
  assert.equal(d.createLead, true);
  assert.equal(d.callbackTask, true);
  assert.equal(d.notify, 'urgent_lead');
});

test('a caller who hangs up early still leaves a lead if we can reach them', () => {
  const d = disposition({ phone: '+447700900112' }, CFG, {});
  assert.equal(d.createLead, true);
  assert.equal(d.status, 'partial');
});

test('a call with nothing usable creates no lead and no noise', () => {
  const d = disposition({}, CFG, {});
  assert.equal(d.createLead, false);
  assert.equal(d.notify, null);
});

test('spam creates no lead', () => {
  assert.equal(disposition({ spam: true, phone: '+447700900112' }, CFG, {}).createLead, false);
});

/* ---------------------------------------------------------------- the lead row */

test('the lead falls back to the calling number when no name was given', () => {
  const l = leadFromCall({ phone: null, urgency: 'High' }, { from_e164: '+447700900112' });
  assert.equal(l.phone, '+447700900112', 'lost the only way to call them back');
  assert.equal(l.source, 'Voice call');
  assert.equal(l.status, 'New');
});

test('the lead score stays inside the column constraint', () => {
  for (const f of [{}, { spam: true }, { phone: '1', email: '1', name: '1', service: '1', urgency: 'High' }]) {
    const s = leadFromCall(f, {}).score;
    assert.ok(s >= 0 && s <= 100, 'score ' + s + ' would violate the leads.score CHECK constraint');
  }
});
