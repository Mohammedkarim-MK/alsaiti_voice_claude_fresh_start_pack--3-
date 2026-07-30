/* Qualification and routing decisions — handoff §11.2.
 *
 * Kept pure and separate from the LiveKit plumbing so the rules that decide whether a caller
 * gets put through to a human can be tested without making a phone call. These are the
 * decisions a business will hold us to; they should not be buried in an event handler.
 */

export const URGENT_WORDS = [
  'emergency', 'urgent', 'asap', 'right now', 'straight away', 'immediately',
  'burst', 'flood', 'flooding', 'leak', 'leaking', 'no heating', 'no hot water',
  'bleeding', 'severe pain', 'a lot of pain', 'swollen', 'swelling', 'broken tooth',
  'knocked out', 'can not wait', "can't wait", 'today', 'tonight',
];
export const SOON_WORDS = [
  'this week', 'tomorrow', 'soon', 'quickly', 'as soon as', 'few days', 'painful', 'pain',
];

/** High / Medium / Low from what the caller said and how they said it. */
export function urgencyOf(text) {
  const s = String(text || '').toLowerCase();
  if (URGENT_WORDS.some((w) => s.includes(w))) return 'High';
  if (SOON_WORDS.some((w) => s.includes(w))) return 'Medium';
  return 'Low';
}

/**
 * 0–100, and it means something specific: how likely this is to become real work.
 *
 * Contactability dominates. An urgent caller we cannot ring back is worth less than a relaxed
 * one we can, because the second becomes revenue and the first becomes a missed opportunity.
 */
export function scoreOf(facts) {
  const f = facts || {};
  let n = 30;
  if (f.phone) n += 28;                       // the single biggest factor
  if (f.email) n += 8;
  if (f.name) n += 8;
  if (f.service) n += 12;
  if (f.urgency === 'High') n += 14;
  else if (f.urgency === 'Medium') n += 7;
  if (f.consent === false) n -= 20;           // cannot follow up lawfully
  if (f.spam) n -= 60;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Enough to be worth a human's time, and reachable afterwards. */
export function isQualified(facts) {
  const f = facts || {};
  if (f.spam) return false;
  if (!f.phone && !f.email) return false;     // no way to reply is not a lead
  return !!(f.service || f.summary);
}

/**
 * Should this call be transferred to a person right now?
 *
 * Deliberately conservative. A transfer that rings out during a busy clinic is worse than a
 * clean promise of a callback, so we only transfer when the workspace has configured a number,
 * says it is open, and the call clears the urgency bar.
 */
export function transferDecision(facts, cfg) {
  const c = cfg || {};
  const f = facts || {};
  if (!c.transfer_number) return { transfer: false, reason: 'no_transfer_number' };
  if (c.transfer_enabled === false) return { transfer: false, reason: 'transfer_disabled' };
  if (!withinHours(c.transfer_hours, c.timezone)) return { transfer: false, reason: 'outside_hours' };
  if (f.spam) return { transfer: false, reason: 'spam' };
  const bar = c.transfer_urgency || 'High';
  const rank = { High: 3, Medium: 2, Low: 1 };
  if ((rank[f.urgency] || 1) < (rank[bar] || 3)) return { transfer: false, reason: 'below_threshold' };
  return { transfer: true, reason: 'urgent', to: c.transfer_number };
}

/**
 * Opening-hours check.
 * `hours` is { mon: [['09:00','17:00']], ... }. No configuration means always available, which
 * matches how a 24/7 AI receptionist is sold.
 */
export function withinHours(hours, timezone, now) {
  if (!hours) return true;
  const d = now || new Date();
  let local = d;
  if (timezone) {
    try {
      local = new Date(d.toLocaleString('en-US', { timeZone: timezone }));
    } catch { /* an unknown zone must not close the business */ }
  }
  const key = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][local.getDay()];
  const windows = hours[key];
  if (!windows || !windows.length) return false;
  const mins = local.getHours() * 60 + local.getMinutes();
  return windows.some(([from, to]) => {
    const [fh, fm] = String(from).split(':').map(Number);
    const [th, tm] = String(to).split(':').map(Number);
    return mins >= fh * 60 + fm && mins <= th * 60 + tm;
  });
}

/**
 * What to do when the call ends. One decision point, so the outcome of every call is
 * explainable after the fact rather than emergent from scattered branches.
 */
export function disposition(facts, cfg, events) {
  const e = events || {};
  const f = facts || {};
  if (e.transfer_succeeded) return { status: 'transferred', createLead: true, notify: 'urgent_lead' };
  if (e.transfer_attempted) {
    // §11.2: a failed transfer must never lose the caller.
    return { status: 'transfer_failed', createLead: true, notify: 'urgent_lead', callbackTask: true };
  }
  if (f.spam) return { status: 'spam', createLead: false, notify: null };
  if (isQualified(f)) return { status: 'captured', createLead: true, notify: f.urgency === 'High' ? 'urgent_lead' : 'new_lead' };
  if (f.phone || f.email || f.name) {
    // Partial, but there is a person on the other end we can reach. Keep it (§11.4 CALL-07).
    return { status: 'partial', createLead: true, notify: 'new_lead' };
  }
  return { status: 'no_contact', createLead: false, notify: null };
}

/** The lead row a captured call becomes. */
export function leadFromCall(facts, call) {
  const f = facts || {}, c = call || {};
  return {
    name: f.name || 'Caller ' + (f.phone || c.from_e164 || '').slice(-4) || 'Unknown caller',
    service: f.service || null,
    phone: f.phone || c.from_e164 || null,
    email: f.email || null,
    urgency: f.urgency || 'Medium',
    source: 'Voice call',
    status: 'New',
    score: scoreOf(f),
    summary: f.summary || null,
    notes: null,
    assignee: null,
  };
}
