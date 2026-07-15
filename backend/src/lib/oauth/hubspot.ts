// Alsaiti Voice — HubSpot connector (the reference vertical; spec Phase 2).
// Implement this fully first; the pattern generalises to the other providers.
// VERIFY endpoints/fields against current HubSpot docs before production.

import { CrmConnector, ProviderIdentity, TokenSet } from './types';

const H = (t: TokenSet) => ({ Authorization: `Bearer ${t.accessToken}` });

export const hubspotConnector: CrmConnector = {
  provider: 'hubspot',

  async getIdentity(tokens: TokenSet): Promise<ProviderIdentity> {
    const res = await fetch('https://api.hubapi.com/account-info/v3/details', { headers: H(tokens) });
    if (!res.ok) throw new Error(`HubSpot identity failed (${res.status})`);
    const j: any = await res.json();
    return {
      accountId: String(j.portalId),
      accountName: j.companyName || `HubSpot ${j.portalId}`,
      environment: 'production',
    };
  },

  async loadMetadata(tokens: TokenSet) {
    const headers = H(tokens);
    const [pipelines, owners] = await Promise.all([
      fetch('https://api.hubapi.com/crm/v3/pipelines/deals', { headers }).then((r) => r.json()).catch(() => ({})),
      fetch('https://api.hubapi.com/crm/v3/owners', { headers }).then((r) => r.json()).catch(() => ({})),
    ]);
    return {
      pipelines: (pipelines as any).results || [],
      owners: (owners as any).results || [],
    };
  },

  async runTest(tokens: TokenSet) {
    // Real test: create a clearly-marked test contact, then archive it so nothing residual remains.
    const headers = { ...H(tokens), 'Content-Type': 'application/json' };
    const email = `alsaiti.connection.test+${Date.now()}@example.com`;
    const create = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers,
      body: JSON.stringify({ properties: { email, firstname: 'Alsaiti', lastname: 'Connection Test' } }),
    });
    if (!create.ok) {
      return { ok: false, operation: 'upsert_test_contact', error: `HTTP ${create.status}: ${await create.text()}` };
    }
    const created: any = await create.json();
    await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${created.id}`, { method: 'DELETE', headers })
      .catch(() => {/* archive best-effort */});
    return { ok: true, operation: 'upsert_test_contact', externalTestRecordId: created.id };
  },
};
