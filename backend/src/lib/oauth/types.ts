// Alsaiti Voice — CRM OAuth framework: types & ports (reference scaffold).
// Tokens/keys are NEVER returned to the browser and NEVER persisted in app records
// beyond an opaque vault reference. See ../../../README.md.

export type CrmProvider =
  | 'hubspot' | 'pipedrive' | 'highlevel' | 'google_sheets'
  | 'salesforce' | 'zoho' | 'dynamics';

// Truthful connection states (spec §5.1). A card shows `connected` only after a real
// API test passes; simulated demo connections use `demo`.
export type ConnectionStatus =
  | 'not_connected' | 'authorisation_required' | 'authorising' | 'callback_received'
  | 'token_exchange_in_progress' | 'account_selection_required' | 'configuration_required'
  | 'metadata_loading' | 'test_required' | 'connected' | 'degraded' | 'attention_required'
  | 'authorisation_expired' | 'paused' | 'disconnecting' | 'disconnected' | 'error' | 'demo';

export interface ProviderConfig {
  id: CrmProvider;
  displayName: string;
  authorizeUrl: string;               // provider consent URL base
  tokenUrl: string;                   // code->token endpoint (override per-region for Zoho)
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  usePkce: boolean;
  tokenAuthStyle: 'body' | 'basic';   // Pipedrive uses HTTP Basic on the token endpoint
  extraAuthParams?: Record<string, string>; // e.g. access_type=offline, prompt=consent
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;                 // seconds
  scope?: string;
  tokenType?: string;
  apiDomain?: string;                 // Zoho / Pipedrive
  instanceUrl?: string;               // Salesforce
  raw?: Record<string, unknown>;
}

export interface ProviderIdentity {
  accountId: string;
  accountName: string;
  userId?: string;
  userName?: string;
  region?: string;
  environment?: string;               // production | sandbox
  instanceUrl?: string;
  apiDomain?: string;
}

// Persisted in Supabase (crm_connections). No secrets — only a vault reference.
export interface CrmConnectionRecord {
  id: string;
  businessId: string;
  provider: CrmProvider;
  status: ConnectionStatus;
  externalAccountId?: string;
  externalAccountName?: string;
  externalUserId?: string;
  externalUserName?: string;
  credentialReference?: string;       // vault://...
  tokenExpiresAt?: string;
  grantedScopes: string[];
  providerRegion?: string;
  providerEnvironment?: string;
  instanceUrl?: string;
  apiDomain?: string;
}

export interface OAuthSession {
  id: string;
  businessId: string;
  userId: string;
  provider: CrmProvider;
  stateHash: string;
  pkceVerifierCiphertext?: string;
  requestedScopes: string[];
  redirectUri: string;
  returnPath?: string;
  status: string;
  expiresAt: string;
}

// ---- Ports the app implements against Supabase + the secret vault ----
export interface OAuthSessionStore {
  create(session: Omit<OAuthSession, 'id'>): Promise<OAuthSession>;
  findByStateHash(stateHash: string): Promise<OAuthSession | null>;
  markCompleted(id: string): Promise<void>;
  markError(id: string, code: string, message: string): Promise<void>;
}

export interface CredentialVault {
  // Returns an opaque reference (vault://...). Only the reference is stored in Supabase.
  store(existingRef: string | null, tokens: TokenSet): Promise<string>;
  read(ref: string): Promise<TokenSet>;
  destroy(ref: string): Promise<void>;
}

export interface ConnectionStore {
  upsert(rec: Partial<CrmConnectionRecord> & { businessId: string; provider: CrmProvider }): Promise<CrmConnectionRecord>;
  get(connectionId: string): Promise<CrmConnectionRecord | null>;
  setStatus(connectionId: string, status: ConnectionStatus): Promise<void>;
}

export interface AuditLog {
  // eventType: authorisation_started|consent_granted|consent_denied|code_received|
  // token_exchange_succeeded|token_exchange_failed|token_refreshed|refresh_failed|access_revoked|disconnected
  record(businessId: string, provider: CrmProvider, eventType: string, detail?: Record<string, unknown>): Promise<void>;
}

// A provider adapter loads identity + metadata and runs a REAL test operation.
export interface CrmConnector {
  provider: CrmProvider;
  getIdentity(tokens: TokenSet): Promise<ProviderIdentity>;
  loadMetadata(tokens: TokenSet, identity: ProviderIdentity): Promise<{ pipelines?: unknown[]; owners?: unknown[]; fields?: unknown[] }>;
  runTest(tokens: TokenSet, identity: ProviderIdentity): Promise<{ ok: boolean; operation: string; externalTestRecordId?: string; error?: string }>;
}

export interface Ports {
  sessions: OAuthSessionStore;
  vault: CredentialVault;
  connections: ConnectionStore;
  audit: AuditLog;
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}
