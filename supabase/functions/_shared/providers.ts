// CRM provider registry + generic OAuth 2.0 operations (Deno / Edge Functions).
// VERIFY every URL/scope against the provider's CURRENT docs before production; some are
// region/environment specific (Zoho multi-DC, Salesforce sandbox, Dynamics per-org resource).

export type CrmProvider =
  | 'hubspot' | 'pipedrive' | 'highlevel' | 'google_sheets'
  | 'salesforce' | 'zoho' | 'dynamics';

export interface ProviderConfig {
  id: CrmProvider;
  displayName: string;
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  usePkce: boolean;
  tokenAuthStyle: 'body' | 'basic';         // Pipedrive uses HTTP Basic on the token endpoint
  extraAuthParams?: Record<string, string>; // e.g. access_type=offline, prompt=consent
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  tokenType?: string;
  apiDomain?: string;    // Zoho / Pipedrive
  instanceUrl?: string;  // Salesforce
  raw?: Record<string, unknown>;
}

function env(k: string): string {
  // deno-lint-ignore no-explicit-any
  const e = (globalThis as any).Deno?.env;
  const v = e ? e.get(k) : undefined;
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
}
function envOpt(k: string, d = ''): string {
  // deno-lint-ignore no-explicit-any
  const e = (globalThis as any).Deno?.env;
  return (e ? e.get(k) : undefined) || d;
}

// The single callback URL registered in every provider's developer app.
export function callbackUrl(provider: CrmProvider): string {
  const base = env('PUBLIC_FUNCTIONS_URL').replace(/\/$/, ''); // e.g. https://<ref>.supabase.co/functions/v1
  return `${base}/crm-callback/${provider}`;
}

export function getProviderConfig(provider: CrmProvider): ProviderConfig {
  switch (provider) {
    case 'hubspot':
      return {
        id: 'hubspot', displayName: 'HubSpot',
        authorizeUrl: 'https://app.hubspot.com/oauth/authorize',
        tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
        clientId: env('HUBSPOT_CLIENT_ID'), clientSecret: env('HUBSPOT_CLIENT_SECRET'),
        scopes: ['oauth', 'crm.objects.contacts.write', 'crm.objects.contacts.read', 'crm.objects.deals.write', 'crm.schemas.contacts.read'],
        usePkce: false, tokenAuthStyle: 'body',
      };
    case 'pipedrive':
      return {
        id: 'pipedrive', displayName: 'Pipedrive',
        authorizeUrl: 'https://oauth.pipedrive.com/oauth/authorize',
        tokenUrl: 'https://oauth.pipedrive.com/oauth/token',
        clientId: env('PIPEDRIVE_CLIENT_ID'), clientSecret: env('PIPEDRIVE_CLIENT_SECRET'),
        scopes: [], usePkce: false, tokenAuthStyle: 'basic',
      };
    case 'highlevel':
      return {
        id: 'highlevel', displayName: 'GoHighLevel',
        authorizeUrl: 'https://marketplace.gohighlevel.com/oauth/chooselocation',
        tokenUrl: 'https://services.leadconnectorhq.com/oauth/token',
        clientId: env('HIGHLEVEL_CLIENT_ID'), clientSecret: env('HIGHLEVEL_CLIENT_SECRET'),
        scopes: ['contacts.write', 'opportunities.write', 'locations.readonly'],
        usePkce: false, tokenAuthStyle: 'body',
      };
    case 'google_sheets':
      return {
        id: 'google_sheets', displayName: 'Google Sheets',
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientId: env('GOOGLE_CLIENT_ID'), clientSecret: env('GOOGLE_CLIENT_SECRET'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        usePkce: true, tokenAuthStyle: 'body',
        extraAuthParams: { access_type: 'offline', prompt: 'consent' },
      };
    case 'salesforce':
      return {
        id: 'salesforce', displayName: 'Salesforce',
        authorizeUrl: `${envOpt('SALESFORCE_LOGIN_URL', 'https://login.salesforce.com')}/services/oauth2/authorize`,
        tokenUrl: `${envOpt('SALESFORCE_LOGIN_URL', 'https://login.salesforce.com')}/services/oauth2/token`,
        clientId: env('SALESFORCE_CLIENT_ID'), clientSecret: env('SALESFORCE_CLIENT_SECRET'),
        scopes: ['api', 'refresh_token', 'offline_access'],
        usePkce: true, tokenAuthStyle: 'body',
      };
    case 'zoho':
      return {
        id: 'zoho', displayName: 'Zoho CRM',
        authorizeUrl: `${envOpt('ZOHO_ACCOUNTS_URL', 'https://accounts.zoho.com')}/oauth/v2/auth`,
        tokenUrl: `${envOpt('ZOHO_ACCOUNTS_URL', 'https://accounts.zoho.com')}/oauth/v2/token`,
        clientId: env('ZOHO_CLIENT_ID'), clientSecret: env('ZOHO_CLIENT_SECRET'),
        scopes: ['ZohoCRM.modules.ALL', 'ZohoCRM.settings.READ', 'ZohoCRM.users.READ'],
        usePkce: false, tokenAuthStyle: 'body',
        extraAuthParams: { access_type: 'offline', prompt: 'consent' },
      };
    case 'dynamics': {
      const tenant = envOpt('MICROSOFT_TENANT_MODE', 'common');
      return {
        id: 'dynamics', displayName: 'Microsoft Dynamics 365',
        authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        clientId: env('MICROSOFT_CLIENT_ID'), clientSecret: env('MICROSOFT_CLIENT_SECRET'),
        scopes: ['offline_access', `${envOpt('DYNAMICS_RESOURCE', 'https://org.crm.dynamics.com')}/.default`],
        usePkce: true, tokenAuthStyle: 'body',
      };
    }
    default:
      throw new Error(`Unknown provider ${provider}`);
  }
}

export function buildAuthorizeUrl(cfg: ProviderConfig, state: string, redirectUri: string, challenge?: string): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    state,
  });
  if (cfg.scopes.length) p.set('scope', cfg.scopes.join(' '));
  if (cfg.usePkce && challenge) {
    p.set('code_challenge', challenge);
    p.set('code_challenge_method', 'S256');
  }
  for (const [k, v] of Object.entries(cfg.extraAuthParams || {})) p.set(k, v);
  return `${cfg.authorizeUrl}?${p.toString()}`;
}

async function postToken(cfg: ProviderConfig, params: URLSearchParams): Promise<TokenSet> {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (cfg.tokenAuthStyle === 'basic') {
    headers.Authorization = 'Basic ' + btoa(`${cfg.clientId}:${cfg.clientSecret}`);
  } else {
    params.set('client_id', cfg.clientId);
    params.set('client_secret', cfg.clientSecret);
  }
  const res = await fetch(cfg.tokenUrl, { method: 'POST', headers, body: params.toString() });
  if (!res.ok) throw new Error(`Token endpoint ${cfg.id} failed (${res.status}): ${await res.text()}`);
  // deno-lint-ignore no-explicit-any
  const j: any = await res.json();
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresIn: j.expires_in,
    scope: j.scope,
    tokenType: j.token_type,
    apiDomain: j.api_domain,
    instanceUrl: j.instance_url,
    raw: j,
  };
}

export function exchangeCode(cfg: ProviderConfig, code: string, redirectUri: string, verifier?: string): Promise<TokenSet> {
  const params = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  if (cfg.usePkce && verifier) params.set('code_verifier', verifier);
  return postToken(cfg, params);
}

export function refreshTokens(cfg: ProviderConfig, refreshToken: string): Promise<TokenSet> {
  const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  return postToken(cfg, params);
}

// When a provider omits expires_in but the token is refreshable, assume 1h so the refresh
// path still runs (callers should also retry once on a 401).
export function tokenExpiryIso(tokens: TokenSet): string | undefined {
  const secs = tokens.expiresIn || (tokens.refreshToken ? 3600 : undefined);
  return secs ? new Date(Date.now() + secs * 1000).toISOString() : undefined;
}
