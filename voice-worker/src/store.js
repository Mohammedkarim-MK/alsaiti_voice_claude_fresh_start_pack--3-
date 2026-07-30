/* Persistence for a call — handoff §11.2, §7.2.
 *
 * The rule this file exists to guarantee: ONE call produces exactly ONE call_session and at most
 * ONE lead, no matter how many times the carrier retries a webhook or the worker reconnects.
 *
 * That is enforced by the database, not by a flag in memory. call_sessions has
 * `unique (provider, provider_call_id)`, so a duplicate insert loses the race and we read back
 * the winner instead of creating a second record. Memory-based deduplication would not survive
 * the restart that a reconnect usually implies.
 */

import { createClient } from '@supabase/supabase-js';

let sb = null;
export function db() {
  if (sb) return sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');
  sb = createClient(url, key, { auth: { persistSession: false } });
  return sb;
}

const UNIQUE_VIOLATION = '23505';

/**
 * Claim this call. Returns { session, fresh } where fresh=false means another worker (or an
 * earlier attempt) already owns it — in which case do not greet, do not create a second lead.
 */
export async function claimCall({ workspaceId, provider, providerCallId, from, to, direction = 'inbound' }) {
  const c = db();
  const row = {
    workspace_id: workspaceId, provider, provider_call_id: providerCallId,
    direction, status: 'ringing', from_e164: from || null, to_e164: to || null,
    started_at: new Date().toISOString(),
  };
  const { data, error } = await c.from('call_sessions').insert(row).select('*').single();
  if (!error) return { session: data, fresh: true };
  if (error.code !== UNIQUE_VIOLATION) throw new Error('claim_failed: ' + error.message);

  const { data: existing, error: readErr } = await c.from('call_sessions')
    .select('*').eq('provider', provider).eq('provider_call_id', providerCallId).maybeSingle();
  if (readErr || !existing) throw new Error('claim_conflict_unreadable: ' + (readErr?.message || 'not found'));
  return { session: existing, fresh: false };
}

/** Which workspace owns the number that was dialled. */
export async function workspaceForNumber(e164) {
  const { data, error } = await db().from('phone_numbers')
    .select('workspace_id, e164, assistant, routing').eq('e164', e164).maybeSingle();
  if (error) throw new Error('number_lookup_failed: ' + error.message);
  return data || null;
}

/** The assistant configuration for a workspace: greeting, hours, transfer rules, services. */
export async function assistantConfig(workspaceId) {
  const { data } = await db().from('workspaces')
    .select('id, name, timezone').eq('id', workspaceId).maybeSingle();
  return {
    workspace_id: workspaceId,
    business_name: data?.name || 'the business',
    timezone: data?.timezone || 'Europe/London',
    transfer_number: process.env.DEFAULT_TRANSFER_NUMBER || null,
    transfer_enabled: process.env.TRANSFER_ENABLED !== 'false',
    transfer_urgency: process.env.TRANSFER_URGENCY || 'High',
    transfer_hours: null,
  };
}

export async function updateCall(sessionId, patch) {
  const { error } = await db().from('call_sessions')
    .update(Object.assign({ updated_at: new Date().toISOString() }, patch)).eq('id', sessionId);
  if (error) throw new Error('call_update_failed: ' + error.message);
}

/**
 * Create the lead for a call, exactly once.
 *
 * Re-entrant on purpose: if the session already carries a lead_id we return that instead of
 * inserting again. A reconnect part-way through the wrap-up must not double-book.
 */
export async function createLeadOnce(session, lead) {
  const c = db();
  if (session.lead_id) {
    const { data } = await c.from('leads').select('*').eq('id', session.lead_id).maybeSingle();
    if (data) return { lead: data, created: false };
  }
  const { data: made, error } = await c.from('leads')
    .insert(Object.assign({ workspace_id: session.workspace_id }, lead)).select('*').single();
  if (error) throw new Error('lead_insert_failed: ' + error.message);

  await updateCall(session.id, { lead_id: made.id });
  await c.from('lead_activities').insert({
    workspace_id: session.workspace_id, lead_id: made.id, kind: 'created',
    actor_label: 'voice agent',
    detail: { call_session: session.id, provider_call_id: session.provider_call_id },
    correlation_id: session.provider_call_id || null,
  });
  return { lead: made, created: true };
}

/** Append to the immutable timeline. Never throws into the call path — a missing audit line
 *  must not drop a caller. */
export async function activity(session, kind, detail) {
  try {
    await db().from('lead_activities').insert({
      workspace_id: session.workspace_id, lead_id: session.lead_id || null,
      kind, actor_label: 'voice agent', detail: detail || {},
      correlation_id: session.provider_call_id || null,
    });
  } catch (e) { console.error(JSON.stringify({ level: 'warn', event: 'activity_failed', error: String(e?.message || e) })); }
}

/** Record that someone should be told. Delivery is the notification service's job. */
export async function queueNotification(session, category, subject) {
  try {
    await db().from('notifications').insert({
      workspace_id: session.workspace_id, channel: 'email', category,
      subject: subject || null, status: 'pending',
      related_table: 'call_sessions', related_id: session.id,
      correlation_id: session.provider_call_id || null,
    });
  } catch (e) { console.error(JSON.stringify({ level: 'warn', event: 'notify_queue_failed', error: String(e?.message || e) })); }
}

/**
 * Store the transcript, subject to consent.
 * With consent withheld we keep the shape of the conversation — how many turns, how long — and
 * discard the words. That is enough to debug a bad call without retaining what was said (§18).
 */
export async function saveTranscript(session, turns, consent) {
  const payload = consent
    ? { consent: true, turns }
    : { consent: false, turn_count: turns.length, redacted: true };
  await updateCall(session.id, { transcript: payload });
}
