// Alsaiti Voice — provider registry + generic OAuth operations.
// VERIFY every URL/scope against the provider's CURRENT docs (see ../../../README.md links)
// before production. Endpoints occasionally change and some are region/environment specific.

import crypto from 'crypto';
import { ProviderConfig, CrmProvider, TokenSet } from './types';

function env(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
}
function envOpt(k: string, d = ''): string {
  return process.env[k] || d;
}

export function getProviderConfig(provider: CrmProvider): ProviderConfig {
  switch (provider) {
    case 'hubspot':
      return {
        id: 'hubspot', displayName: 'HubSpot',
        authorizeUrl: 'https://app.hubspot.com/oauth/authorize',
        tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
        clientId: env('HUBSPOT_CLIENT_ID'), clientSecret: env('HUBSPOT_CLIENT_SECRET'),
        redirectUri: env('HUBSPOT_REDIRECT_URI'),
        scopes: ['oauth', 'crm.objects.contacts.write', 'crm.objects.deals.write', 'crm.schemas.contacts.read'],
        usePkce: false, tokenAuthStyle: 'body',
      };
    case 'pipedrive':
      return {
        id: 'pipedrive', displayName: 'Pipedrive',
        authorizeUrl: 'https://oauth.pipedrive.com/oauth/authorize',
        tokenUrl: 'https://oauth.pipedrive.com/oauth/token',
        clientId: env('PIPEDRIVE_CLIENT_ID'), clientSecret: env('PIPEDRIVE_CLIENT_SECRET'),
        redirectUri: env('PIPEDRIVE_REDIRECT_URI'),
        scopes: [], usePkce: false, tokenAuthStyle: 'basic',
      };
    case 'highlevel':
      return {
        id: 'highlevel', displayName: 'GoHighLevel',
        authorizeUrl: 'https://marketplace.gohighlevel.com/oauth/chooselocation',
        tokenUrl: 'https://services.leadconnectorhq.com/oauth/token',
        clientId: env('HIGHLEVEL_CLIENT_ID'), clientSecret: env('HIGHLEVEL_CLIENT_SECRET'),
        redirectUri: env('HIGHLEVEL_REDIRECT_URI'),
        scopes: ['contacts.write', 'opportunities.write', 'locations.readonly'],
        usePkce: false, tokenAuthStyle: 'body',
      };
    case 'google_sheets':
      return {
        id: 'google_sheets', displayName: 'Google Sheets',
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientId: env('GOOGLE_CLIENT_ID'), clientSecret: env('GOOGLE_CLIENT_SECRET'),
        redirectUri: env('GOOGLE_REDIRECT_URI'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        usePkce: true, tokenAuthStyle: 'body',
        extraAuthParams: { access_type: 'offline', prompt: 'consent' },
      };
    case 'salesforce':
      // Sandbox: swap login.salesforce.com -> test.salesforce.com for the selected environment.
      return {
        id: 'salesforce', displayName: 'Salesforce',
        authorizeUrl: 'https://login.salesforce.com/services/oauth2/authorize',
        tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
        clientId: env('SALESFORCE_CLIENT_ID'), clientSecret: env('SALESFORCE_CLIENT_SECRET'),
        redirectUri: env('SALESFORCE_REDIRECT_URI'),
        scopes: ['api', 'refresh_token', 'offline_access'],
        usePkce: true, tokenAuthStyle: 'body',
      };
    case 'zoho':
      // Multi-DC: use the accounts-server returned during auth; do NOT hard-code .com for every customer.
      return {
        id: 'zoho', displayName: 'Zoho CRM',
        authorizeUrl: 'https://accounts.zoho.com/oauth/v2/auth',
        tokenUrl: 'https://accounts.zoho.com/oauth/v2/token',
        clientId: env('ZOHO_CLIENT_ID'), clientSecret: env('ZOHO_CLIENT_SECRET'),
        redirectUri: env('ZOHO_REDIRECT_URI'),
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
        redirectUri: env('MICROSOFT_REDIRECT_URI'),
        // The Dataverse resource scope is per-environment; set the org URL at connect time.
        scopes: ['offline_access', 'https://org.crm.dynamics.com/user_impersonation'],
        usePkce: true, tokenAuthStyle: 'body',
      };
    }
    default:
      throw new Error(`Unknown provider ${provider}`);
  }
}

// ---- state + PKCE ----
export function randomUrlSafe(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}
export function sha256b64url(input: string): string {
  return crypto.createHash('sha256').update(input).digest('base64url');
}
export function makeState(): { state: string; stateHash: string } {
  const state = randomUrlSafe(32);
  return { state, stateHash: sha256b64url(state) };
}
export function makePkce(): { verifier: string; challenge: string } {
  const verifier = randomUrlSafe(48);
  return { verifier, challenge: sha256b64url(verifier) };
}

export function buildAuthorizeUrl(cfg: ProviderConfig, state: string, challenge?: string): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
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
    headers.Authorization = 'Basic ' + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  } else {
    params.set('client_id', cfg.clientId);
    params.set('client_secret', cfg.clientSecret);
  }
  const res = await fetch(cfg.tokenUrl, { method: 'POST', headers, body: params.toString() });
  if (!res.ok) throw new Error(`Token endpoint ${cfg.id} failed (${res.status}): ${await res.text()}`);
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

export function exchangeCode(cfg: ProviderConfig, code: string, verifier?: string): Promise<TokenSet> {
  const params = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri });
  if (cfg.usePkce && verifier) params.set('code_verifier', verifier);
  return postToken(cfg, params);
}

export function refreshTokens(cfg: ProviderConfig, refreshToken: string): Promise<TokenSet> {
  const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  return postToken(cfg, params);
}
