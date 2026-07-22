// ⚠️  DEPRECATED — DO NOT DEPLOY THIS AGAINST THE SAME DATABASE AS supabase/functions/.
//
// The LIVE implementation is `supabase/functions/_shared/crypto.ts` (Deno / Web Crypto).
// It stores ciphertext as TWO parts — "iv.ct" — because Web Crypto appends the 16-byte GCM
// auth tag to the ciphertext. This Node file stores THREE parts — "iv.tag.ct".
//
// The formats are NOT interchangeable. If both ever wrote to the same `crm_credentials`
// table, tokens written by one would be undecryptable by the other and every affected CRM
// connection would break with a decrypt error.
//
// Keep this file only as reference for the full VPS/vault architecture. If you deploy it,
// first align its encrypt()/decrypt() with the Deno version (or use a separate database).
//
// Alsaiti Voice — "serverless / MVP" Ports implementation (the LIGHTER go-live path).
// Implements the OAuth framework ports against hosted Supabase + envelope encryption
// (AES-256-GCM) instead of a separate secret vault. Runs in a Supabase Edge Function or
// a Next.js route — no VPS/vault to operate. Requires migrations 0001 + 0002 and:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OAUTH_CREDENTIAL_ENCRYPTION_KEY (32 bytes).
// Upgrade to a real vault (Infisical/OpenBao/KMS) before scale.

import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Ports, OAuthSession, OAuthSessionStore, CredentialVault, ConnectionStore, AuditLog,
  TokenSet, CrmConnectionRecord, CrmProvider, ConnectionStatus,
} from './types';

function key32(): Buffer {
  const raw = process.env.OAUTH_CREDENTIAL_ENCRYPTION_KEY || '';
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('OAUTH_CREDENTIAL_ENCRYPTION_KEY must be 32 bytes (hex or base64)');
  return buf;
}
function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key32(), iv);
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}
function decrypt(blob: string): string {
  const [iv, tag, ct] = blob.split('.');
  const d = crypto.createDecipheriv('aes-256-gcm', key32(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}

const REF_PREFIX = 'sb://crm_credentials/';

export function makeSupabasePorts(): Ports {
  const sb: SupabaseClient = createClient(
    process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } },
  );

  const sessions: OAuthSessionStore = {
    async create(s) {
      const { data, error } = await sb.from('oauth_authorisation_sessions').insert({
        business_id: s.businessId, user_id: s.userId, provider: s.provider, state_hash: s.stateHash,
        pkce_verifier_ciphertext: s.pkceVerifierCiphertext, requested_scopes: s.requestedScopes,
        redirect_uri: s.redirectUri, return_path: s.returnPath, status: s.status, expires_at: s.expiresAt,
      }).select().single();
      if (error) throw error;
      return mapSession(data);
    },
    async findByStateHash(h) {
      const { data } = await sb.from('oauth_authorisation_sessions').select('*').eq('state_hash', h).maybeSingle();
      return data ? mapSession(data) : null;
    },
    // Atomic single-use claim: the status guard in the WHERE clause means only ONE
    // callback (of any replayed/concurrent set) can flip 'authorising' -> 'callback_received'.
    async claim(id) {
      const { data, error } = await sb.from('oauth_authorisation_sessions')
        .update({ status: 'callback_received' }).eq('id', id).eq('status', 'authorising').select('id');
      if (error) throw error;
      return !!(data && data.length);
    },
    async markCompleted(id) {
      const { error } = await sb.from('oauth_authorisation_sessions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    async markError(id, code, message) {
      const { error } = await sb.from('oauth_authorisation_sessions').update({ status: 'error', error_code: code, error_message: message }).eq('id', id);
      if (error) throw error;
    },
  };

  const vault: CredentialVault = {
    async store(existingRef, tokens) {
      const ciphertext = encrypt(JSON.stringify(tokens));
      if (existingRef) {
        const id = existingRef.replace(REF_PREFIX, '');
        // A silent failure here would strand the connection on stale tokens — surface it.
        const { data, error } = await sb.from('crm_credentials')
          .update({ ciphertext, updated_at: new Date().toISOString() }).eq('id', id).select('id');
        if (error) throw error;
        if (!data || !data.length) throw new Error(`credential row not found for ${existingRef}`);
        return existingRef;
      }
      const { data, error } = await sb.from('crm_credentials').insert({ ciphertext }).select('id').single();
      if (error) throw error;
      return `${REF_PREFIX}${data.id}`;
    },
    async read(ref) {
      const id = ref.replace(REF_PREFIX, '');
      const { data, error } = await sb.from('crm_credentials').select('ciphertext').eq('id', id).single();
      if (error) throw error;
      return JSON.parse(decrypt(data.ciphertext)) as TokenSet;
    },
    async destroy(ref) {
      const { error } = await sb.from('crm_credentials').delete().eq('id', ref.replace(REF_PREFIX, ''));
      if (error) throw error;
    },
  };

  const connections: ConnectionStore = {
    async upsert(rec) {
      const row = {
        business_id: rec.businessId, provider: rec.provider, status: rec.status,
        external_account_id: rec.externalAccountId, external_account_name: rec.externalAccountName,
        external_user_id: rec.externalUserId, external_user_name: rec.externalUserName,
        credential_reference: rec.credentialReference, token_expires_at: rec.tokenExpiresAt,
        granted_scopes: rec.grantedScopes || [], instance_url: rec.instanceUrl, api_domain: rec.apiDomain,
        last_authorised_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      const { data, error } = await sb.from('crm_connections')
        .upsert(row, { onConflict: 'business_id,provider,external_account_id' }).select().single();
      if (error) throw error;
      return mapConnection(data);
    },
    async get(id) {
      const { data } = await sb.from('crm_connections').select('*').eq('id', id).maybeSingle();
      return data ? mapConnection(data) : null;
    },
    async findByAccount(businessId, provider, externalAccountId) {
      const { data } = await sb.from('crm_connections').select('*')
        .eq('business_id', businessId).eq('provider', provider)
        .eq('external_account_id', externalAccountId).maybeSingle();
      return data ? mapConnection(data) : null;
    },
    async setStatus(id, status: ConnectionStatus) {
      const { error } = await sb.from('crm_connections').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    async recordRefresh(id, tokenExpiresAt) {
      const now = new Date().toISOString();
      const { error } = await sb.from('crm_connections')
        .update({ token_expires_at: tokenExpiresAt, last_refreshed_at: now, updated_at: now }).eq('id', id);
      if (error) throw error;
    },
  };

  const audit: AuditLog = {
    async record(businessId, provider, eventType, detail) {
      // Audit failures are logged but never break the OAuth flow itself.
      const { error } = await sb.from('provider_oauth_events').insert({ business_id: businessId, provider, event_type: eventType, detail: detail || {} });
      if (error) console.error('audit insert failed', eventType, error.message);
    },
  };

  return {
    sessions, vault, connections, audit,
    encrypt: async (s) => encrypt(s),
    decrypt: async (s) => decrypt(s),
  };
}

function mapSession(d: any): OAuthSession {
  return {
    id: d.id, businessId: d.business_id, userId: d.user_id, provider: d.provider as CrmProvider,
    stateHash: d.state_hash, pkceVerifierCiphertext: d.pkce_verifier_ciphertext,
    requestedScopes: d.requested_scopes || [], redirectUri: d.redirect_uri, returnPath: d.return_path,
    status: d.status, expiresAt: d.expires_at,
  };
}
function mapConnection(d: any): CrmConnectionRecord {
  return {
    id: d.id, businessId: d.business_id, provider: d.provider as CrmProvider, status: d.status as ConnectionStatus,
    externalAccountId: d.external_account_id, externalAccountName: d.external_account_name,
    externalUserId: d.external_user_id, externalUserName: d.external_user_name,
    credentialReference: d.credential_reference, tokenExpiresAt: d.token_expires_at,
    grantedScopes: d.granted_scopes || [], instanceUrl: d.instance_url, apiDomain: d.api_domain,
  };
}
