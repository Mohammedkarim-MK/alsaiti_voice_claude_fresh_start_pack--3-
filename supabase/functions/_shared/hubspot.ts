// HubSpot connector — identity, metadata (pipelines/stages/owners/fields) and a REAL test
// (creates then archives a test contact). This is the reference adapter; others follow it.
// Docs: https://developers.hubspot.com/docs/api/crm/contacts

import type { TokenSet } from './providers.ts';

const API = 'https://api.hubapi.com';

function authHeaders(tokens: TokenSet): Record<string, string> {
  return { Authorization: `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/json' };
}

export interface ProviderIdentity {
  accountId: string;
  accountName: string;
  userId?: string;
  userName?: string;
}

export const hubspot = {
  async getIdentity(tokens: TokenSet): Promise<ProviderIdentity> {
    // Token metadata gives the hub (portal) id + user; account-info gives a friendlier name.
    const meta = await fetch(`${API}/oauth/v1/access-tokens/${encodeURIComponent(tokens.accessToken)}`);
    if (!meta.ok) throw new Error(`HubSpot token introspection failed (${meta.status})`);
    // deno-lint-ignore no-explicit-any
    const m: any = await meta.json();
    let accountName = m.hub_domain || `Portal ${m.hub_id}`;
    try {
      const info = await fetch(`${API}/account-info/v3/details`, { headers: authHeaders(tokens) });
      if (info.ok) {
        // deno-lint-ignore no-explicit-any
        const d: any = await info.json();
        accountName = d.companyName || d.uiDomain || accountName;
      }
    } catch { /* non-fatal: keep the token-introspection name */ }
    return {
      accountId: String(m.hub_id),
      accountName,
      userId: m.user_id ? String(m.user_id) : undefined,
      userName: m.user,
    };
  },

  async loadMetadata(tokens: TokenSet): Promise<{ pipelines: unknown[]; owners: unknown[]; fields: unknown[] }> {
    const h = authHeaders(tokens);
    const [pipesR, ownersR, propsR] = await Promise.all([
      fetch(`${API}/crm/v3/pipelines/deals`, { headers: h }),
      fetch(`${API}/crm/v3/owners`, { headers: h }),
      fetch(`${API}/crm/v3/properties/contacts`, { headers: h }),
    ]);
    // deno-lint-ignore no-explicit-any
    const pipes: any = pipesR.ok ? await pipesR.json() : { results: [] };
    // deno-lint-ignore no-explicit-any
    const owners: any = ownersR.ok ? await ownersR.json() : { results: [] };
    // deno-lint-ignore no-explicit-any
    const props: any = propsR.ok ? await propsR.json() : { results: [] };
    return {
      pipelines: (pipes.results || []).map((p: Record<string, unknown>) => ({
        id: p.id, label: p.label,
        stages: ((p.stages as Record<string, unknown>[]) || []).map((s) => ({ id: s.id, label: s.label })),
      })),
      owners: (owners.results || []).map((o: Record<string, unknown>) => ({
        id: o.id, name: [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email, email: o.email,
      })),
      fields: (props.results || [])
        .filter((p: Record<string, unknown>) => !p.hidden)
        .slice(0, 100)
        .map((p: Record<string, unknown>) => ({ name: p.name, label: p.label, type: p.type })),
    };
  },

  // Real round-trip: create a contact, then archive it. Only a success flips a card to 'connected'.
  async runTest(tokens: TokenSet): Promise<{ ok: boolean; operation: string; externalTestRecordId?: string; error?: string }> {
    const h = authHeaders(tokens);
    const email = `alsaiti-voice-test+${Date.now()}@example.com`;
    const create = await fetch(`${API}/crm/v3/objects/contacts`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ properties: { email, firstname: 'Alsaiti', lastname: 'Connection test' } }),
    });
    if (!create.ok) {
      return { ok: false, operation: 'contacts.create', error: `HTTP ${create.status}: ${(await create.text()).slice(0, 300)}` };
    }
    // deno-lint-ignore no-explicit-any
    const created: any = await create.json();
    const id = created.id as string;
    // Clean up so the test never litters the customer's CRM.
    try { await fetch(`${API}/crm/v3/objects/contacts/${id}`, { method: 'DELETE', headers: h }); } catch { /* best effort */ }
    return { ok: true, operation: 'contacts.create+archive', externalTestRecordId: id };
  },

  // Real lead sync: create (or update) a HubSpot contact from an Alsaiti lead, and optionally a
  // deal. Unlike runTest, these records are KEPT. Returns the real external IDs to store + link.
  async syncLead(
    tokens: TokenSet,
    lead: { name?: string; email?: string; phone?: string; service?: string; summary?: string; source?: string },
    opts: { createDeal?: boolean; pipeline?: string; stage?: string } = {},
  ): Promise<{ ok: boolean; operation: string; contactId?: string; dealId?: string; recordUrl?: string; error?: string }> {
    const h = authHeaders(tokens);
    const [firstname, ...rest] = (lead.name || 'Alsaiti Lead').trim().split(/\s+/);
    const lastname = rest.join(' ') || '(lead)';
    // Upsert the contact by email when we have one (avoids duplicates on re-sync); else create.
    let contactId: string | undefined;
    const props: Record<string, string> = { firstname, lastname };
    if (lead.email) props.email = lead.email;
    if (lead.phone) props.phone = lead.phone;
    if (lead.summary || lead.service) props.hs_content_membership_notes = (lead.service ? `${lead.service}. ` : '') + (lead.summary || '');

    if (lead.email) {
      // Try update-by-email first (idempotent), fall back to create.
      const up = await fetch(`${API}/crm/v3/objects/contacts/${encodeURIComponent(lead.email)}?idProperty=email`, {
        method: 'PATCH', headers: h, body: JSON.stringify({ properties: props }),
      });
      if (up.ok) { contactId = (await up.json()).id; }
    }
    if (!contactId) {
      const create = await fetch(`${API}/crm/v3/objects/contacts`, { method: 'POST', headers: h, body: JSON.stringify({ properties: props }) });
      if (!create.ok) return { ok: false, operation: 'contacts.upsert', error: `HTTP ${create.status}: ${(await create.text()).slice(0, 300)}` };
      contactId = (await create.json()).id;
    }

    let dealId: string | undefined;
    if (opts.createDeal) {
      const dealProps: Record<string, string> = { dealname: `${lead.name || 'Lead'} — ${lead.service || 'enquiry'}`, dealstage: opts.stage || 'appointmentscheduled' };
      const deal = await fetch(`${API}/crm/v3/objects/deals`, {
        method: 'POST', headers: h,
        body: JSON.stringify({
          properties: dealProps,
          associations: contactId ? [{ to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }] }] : undefined,
        }),
      });
      if (deal.ok) dealId = (await deal.json()).id;
    }
    return {
      ok: true, operation: opts.createDeal ? 'contact+deal.upsert' : 'contact.upsert',
      contactId, dealId,
      recordUrl: contactId ? `https://app.hubspot.com/contacts/0/record/0-1/${contactId}` : undefined,
    };
  },
};
