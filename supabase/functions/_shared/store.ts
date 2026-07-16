// Supabase access for the Edge Functions. Two clients:
//   * serviceClient() — service role, bypasses RLS, used for all secret writes.
//   * userClient(req) — carries the caller's JWT so we can resolve WHO they are under RLS.
// Plus typed helpers for oauth sessions, credentials, connections and audit.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { encryptJson, decryptJson } from './crypto.ts';
import type { CrmProvider, TokenSet } from './providers.ts';

function env(k: string): string {
  // deno-lint-ignore no-explicit-any
  const e = (globalThis as any).Deno?.env;
  const v = e ? e.get(k) : undefined;
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
}

export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

export function userClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization') || '';
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
}

// Resolve the caller's user id + a workspace they belong to (owner or member).
// Throws if unauthenticated or not a member of any workspace.
export async function resolveWorkspace(req: Request): Promise<{ userId: string; workspaceId: string }> {
  const uc = userClient(req);
  const { data: userData, error: userErr } = await uc.auth.getUser();
  if (userErr || !userData?.user) throw new Error('unauthenticated');
  const userId = userData.user.id;
  // RLS lets a member see only their own workspaces; take the first (owned first).
  const { data: ws, error } = await uc.from('workspaces').select('id, owner_id').order('created_at', { ascending: true }).limit(1);
  if (error) throw error;
  if (!ws || !ws.length) throw new Error('no_workspace');
  return { userId, workspaceId: ws[0].id };
}

const CRED_PREFIX = 'crmcred://';

export const store = {
  // ---- OAuth sessions (service role only) ----
  async createSession(s: {
    workspaceId: string; userId: string; provider: CrmProvider; stateHash: string;
    pkceVerifierCiphertext?: string; requestedScopes: string[]; redirectUri: string; returnUrl?: string; expiresAt: string;
  }): Promise<string> {
    const sb = serviceClient();
    const { data, error } = await sb.from('oauth_authorisation_sessions').insert({
      workspace_id: s.workspaceId, user_id: s.userId, provider: s.provider, state_hash: s.stateHash,
      pkce_verifier_ciphertext: s.pkceVerifierCiphertext, requested_scopes: s.requestedScopes,
      redirect_uri: s.redirectUri, return_url: s.returnUrl, status: 'authorising', expires_at: s.expiresAt,
    }).select('id').single();
    if (error) throw error;
    return data.id;
  },
  // deno-lint-ignore no-explicit-any
  async findSessionByStateHash(hash: string): Promise<any | null> {
    const sb = serviceClient();
    const { data } = await sb.from('oauth_authorisation_sessions').select('*').eq('state_hash', hash).maybeSingle();
    return data || null;
  },
  // Atomic single-use claim: only one callback can flip 'authorising' -> 'callback_received'.
  async claimSession(id: string): Promise<boolean> {
    const sb = serviceClient();
    const { data, error } = await sb.from('oauth_authorisation_sessions')
      .update({ status: 'callback_received' }).eq('id', id).eq('status', 'authorising').select('id');
    if (error) throw error;
    return !!(data && data.length);
  },
  async completeSession(id: string): Promise<void> {
    const sb = serviceClient();
    await sb.from('oauth_authorisation_sessions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
  },
  async errorSession(id: string, code: string, message: string): Promise<void> {
    const sb = serviceClient();
    await sb.from('oauth_authorisation_sessions').update({ status: 'error', error_code: code, error_message: message }).eq('id', id);
  },

  // ---- Credentials vault (envelope-encrypted; service role only) ----
  async storeCredential(existingRef: string | null, tokens: TokenSet): Promise<string> {
    const sb = serviceClient();
    const ciphertext = await encryptJson(tokens);
    if (existingRef) {
      const id = existingRef.replace(CRED_PREFIX, '');
      const { data, error } = await sb.from('crm_credentials').update({ ciphertext, updated_at: new Date().toISOString() }).eq('id', id).select('id');
      if (error) throw error;
      if (!data || !data.length) throw new Error(`credential row not found for ${existingRef}`);
      return existingRef;
    }
    const { data, error } = await sb.from('crm_credentials').insert({ ciphertext }).select('id').single();
    if (error) throw error;
    return `${CRED_PREFIX}${data.id}`;
  },
  async readCredential(ref: string): Promise<TokenSet> {
    const sb = serviceClient();
    const id = ref.replace(CRED_PREFIX, '');
    const { data, error } = await sb.from('crm_credentials').select('ciphertext').eq('id', id).single();
    if (error) throw error;
    return await decryptJson<TokenSet>(data.ciphertext);
  },
  async destroyCredential(ref: string): Promise<void> {
    const sb = serviceClient();
    await sb.from('crm_credentials').delete().eq('id', ref.replace(CRED_PREFIX, ''));
  },

  // ---- CRM connections (service role writes; members read via RLS) ----
  // deno-lint-ignore no-explicit-any
  async findConnectionByAccount(workspaceId: string, provider: CrmProvider, externalAccountId: string): Promise<any | null> {
    const sb = serviceClient();
    const { data } = await sb.from('crm_connections').select('*')
      .eq('workspace_id', workspaceId).eq('provider', provider).eq('external_account_id', externalAccountId).maybeSingle();
    return data || null;
  },
  // deno-lint-ignore no-explicit-any
  async getConnection(id: string): Promise<any | null> {
    const sb = serviceClient();
    const { data } = await sb.from('crm_connections').select('*').eq('id', id).maybeSingle();
    return data || null;
  },
  // deno-lint-ignore no-explicit-any
  async upsertConnection(rec: Record<string, any>): Promise<any> {
    const sb = serviceClient();
    const { data, error } = await sb.from('crm_connections')
      .upsert({ ...rec, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id,provider,external_account_id' })
      .select().single();
    if (error) throw error;
    return data;
  },
  async setConnectionStatus(id: string, status: string, extra: Record<string, unknown> = {}): Promise<void> {
    const sb = serviceClient();
    const { error } = await sb.from('crm_connections').update({ status, ...extra, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },
  async recordRefresh(id: string, tokenExpiresAt?: string): Promise<void> {
    const sb = serviceClient();
    const now = new Date().toISOString();
    await sb.from('crm_connections').update({ token_expires_at: tokenExpiresAt, last_refreshed_at: now, updated_at: now }).eq('id', id);
  },

  async audit(workspaceId: string | null, provider: string, eventType: string, detail: Record<string, unknown> = {}): Promise<void> {
    const sb = serviceClient();
    const { error } = await sb.from('provider_oauth_events').insert({ workspace_id: workspaceId, provider, event_type: eventType, detail });
    if (error) console.error('audit insert failed', eventType, error.message);
  },
};
