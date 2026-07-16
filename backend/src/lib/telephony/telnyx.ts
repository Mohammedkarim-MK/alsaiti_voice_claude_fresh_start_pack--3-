// Alsaiti Voice — Telnyx telephony adapter (skeleton; spec §11/§13).
// Needs a funded Telnyx account + TELNYX_API_KEY (+ TELNYX_PUBLIC_KEY for webhooks).
// VERIFY every endpoint/field against current Telnyx docs before production.

import crypto from 'crypto';

const BASE = 'https://api.telnyx.com/v2';

function auth() {
  const k = process.env.TELNYX_API_KEY;
  if (!k) throw new Error('Missing TELNYX_API_KEY');
  return { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' };
}

export interface AvailableNumber {
  phoneNumber: string;
  country: string;
  type: string;
  monthlyCost?: string;
  capabilities: string[];
}
export interface NumberOrder {
  id: string;
  status: string;
  phoneNumbers: string[];
}

export const telnyx = {
  async verifyConnection(): Promise<{ ok: boolean; detail?: string }> {
    const r = await fetch(`${BASE}/balance`, { headers: auth() });
    return { ok: r.ok, detail: r.ok ? undefined : `HTTP ${r.status}` };
  },

  async searchNumbers(input: { country: string; areaCode?: string; type?: string }): Promise<AvailableNumber[]> {
    const p = new URLSearchParams({ 'filter[country_code]': input.country, 'filter[limit]': '20' });
    if (input.areaCode) p.set('filter[national_destination_code]', input.areaCode);
    if (input.type) p.set('filter[phone_number_type]', input.type);
    const r = await fetch(`${BASE}/available_phone_numbers?${p.toString()}`, { headers: auth() });
    if (!r.ok) throw new Error(`Telnyx number search failed (${r.status})`);
    const j: any = await r.json();
    return (j.data || []).map((n: any) => ({
      phoneNumber: n.phone_number,
      country: input.country,
      type: n.phone_number_type,
      monthlyCost: n.cost_information?.monthly_cost,
      capabilities: (n.features || []).map((f: any) => f.name),
    }));
  },

  // Idempotency-Key prevents duplicate orders on repeated clicks (spec §13.3).
  async orderNumber(input: { phoneNumber: string; idempotencyKey: string }): Promise<NumberOrder> {
    const r = await fetch(`${BASE}/number_orders`, {
      method: 'POST',
      headers: { ...auth(), 'Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify({ phone_numbers: [{ phone_number: input.phoneNumber }] }),
    });
    if (!r.ok) throw new Error(`Telnyx order failed (${r.status}): ${await r.text()}`);
    const j: any = await r.json();
    return { id: j.data.id, status: j.data.status, phoneNumbers: (j.data.phone_numbers || []).map((x: any) => x.phone_number) };
  },

  async getNumberOrder(orderId: string): Promise<NumberOrder> {
    const r = await fetch(`${BASE}/number_orders/${orderId}`, { headers: auth() });
    if (!r.ok) throw new Error(`Telnyx order status failed (${r.status})`);
    const j: any = await r.json();
    return { id: j.data.id, status: j.data.status, phoneNumbers: (j.data.phone_numbers || []).map((x: any) => x.phone_number) };
  },

  // Assign a number to a Voice API application (or SIP connection) so calls route to Alsaiti.
  async assignVoiceApplication(numberId: string, voiceApplicationId: string): Promise<void> {
    const r = await fetch(`${BASE}/phone_numbers/${numberId}`, {
      method: 'PATCH', headers: auth(),
      body: JSON.stringify({ connection_id: voiceApplicationId }),
    });
    if (!r.ok) throw new Error(`Telnyx assign failed (${r.status})`);
  },

  // Verify a Telnyx webhook (Ed25519 over `${timestamp}|${rawBody}`) using TELNYX_PUBLIC_KEY.
  // The portal supplies the key as base64 of the RAW 32-byte Ed25519 key, so it must be
  // wrapped in an SPKI header before createPublicKey can parse it. Also enforce a freshness
  // window: a validly signed payload must not verify forever (replay). No unverified voice
  // event may update a call or lead (spec §16). Confirm both against current Telnyx docs.
  verifyWebhook(rawBody: string, signatureB64: string, timestamp: string, toleranceSeconds = 300): boolean {
    const pub = process.env.TELNYX_PUBLIC_KEY || '';
    try {
      const ts = parseInt(timestamp, 10);
      if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false;
      const raw = Buffer.from(pub, 'base64');
      const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
      const der = raw.length === 32 ? Buffer.concat([SPKI_ED25519_PREFIX, raw]) : raw;
      const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
      return crypto.verify(null, Buffer.from(`${timestamp}|${rawBody}`), key, Buffer.from(signatureB64, 'base64'));
    } catch {
      return false;
    }
  },
};
