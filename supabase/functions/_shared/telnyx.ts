// Telnyx telephony adapter (Deno / Edge Functions) — the PRIMARY phone provider.
// Needs a funded Telnyx account + TELNYX_API_KEY (+ TELNYX_PUBLIC_KEY for webhooks).
// VERIFY every endpoint/field against current Telnyx docs before production.

const BASE = 'https://api.telnyx.com/v2';

function apiKey(): string {
  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno?.env;
  const k = env ? env.get('TELNYX_API_KEY') : undefined;
  if (!k) throw new Error('Missing TELNYX_API_KEY');
  return k;
}
function auth(): Record<string, string> {
  return { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' };
}

export interface AvailableNumber {
  phoneNumber: string;
  country: string;
  type: string;
  monthlyCost?: string;
  currency?: string;
  capabilities: string[];
}
export interface NumberOrder {
  id: string;
  status: string;
  phoneNumbers: string[];
}

export const telnyx = {
  // Real account check — a valid key can read the balance.
  async verifyConnection(): Promise<{ ok: boolean; detail?: string; balance?: string; currency?: string }> {
    const r = await fetch(`${BASE}/balance`, { headers: auth() });
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json();
    return { ok: true, balance: j.data?.balance, currency: j.data?.currency };
  },

  async searchNumbers(input: { country: string; areaCode?: string; type?: string; limit?: number }): Promise<AvailableNumber[]> {
    const p = new URLSearchParams({
      'filter[country_code]': input.country,
      'filter[limit]': String(input.limit || 20),
    });
    if (input.areaCode) p.set('filter[national_destination_code]', input.areaCode);
    if (input.type) p.set('filter[phone_number_type]', input.type);
    const r = await fetch(`${BASE}/available_phone_numbers?${p.toString()}`, { headers: auth() });
    if (!r.ok) throw new Error(`Telnyx number search failed (${r.status})`);
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json();
    // deno-lint-ignore no-explicit-any
    return (j.data || []).map((n: any) => ({
      phoneNumber: n.phone_number,
      country: input.country,
      type: n.phone_number_type,
      monthlyCost: n.cost_information?.monthly_cost,
      currency: n.cost_information?.currency,
      capabilities: (n.features || []).map((f: { name: string }) => f.name),
    }));
  },

  // Idempotency-Key prevents duplicate orders on repeated clicks / retries.
  async orderNumber(input: { phoneNumber: string; idempotencyKey: string }): Promise<NumberOrder> {
    const r = await fetch(`${BASE}/number_orders`, {
      method: 'POST',
      headers: { ...auth(), 'Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify({ phone_numbers: [{ phone_number: input.phoneNumber }] }),
    });
    if (!r.ok) throw new Error(`Telnyx order failed (${r.status}): ${await r.text()}`);
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json();
    return { id: j.data.id, status: j.data.status, phoneNumbers: (j.data.phone_numbers || []).map((x: { phone_number: string }) => x.phone_number) };
  },

  async getNumberOrder(orderId: string): Promise<NumberOrder> {
    const r = await fetch(`${BASE}/number_orders/${orderId}`, { headers: auth() });
    if (!r.ok) throw new Error(`Telnyx order status failed (${r.status})`);
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json();
    return { id: j.data.id, status: j.data.status, phoneNumbers: (j.data.phone_numbers || []).map((x: { phone_number: string }) => x.phone_number) };
  },

  // Route a number to a Voice API application / SIP connection so calls reach Alsaiti.
  async assignVoiceApplication(numberId: string, voiceApplicationId: string): Promise<void> {
    const r = await fetch(`${BASE}/phone_numbers/${numberId}`, {
      method: 'PATCH', headers: auth(),
      body: JSON.stringify({ connection_id: voiceApplicationId }),
    });
    if (!r.ok) throw new Error(`Telnyx assign failed (${r.status})`);
  },

  // Verify a Telnyx webhook: Ed25519 over `${timestamp}|${rawBody}` using TELNYX_PUBLIC_KEY
  // (the portal supplies the raw 32-byte key, base64). Enforce a freshness window against replay.
  // No unverified voice event may update a call or lead.
  async verifyWebhook(rawBody: string, signatureB64: string, timestamp: string, toleranceSeconds = 300): Promise<boolean> {
    // deno-lint-ignore no-explicit-any
    const env = (globalThis as any).Deno?.env;
    const pub = (env ? env.get('TELNYX_PUBLIC_KEY') : '') || '';
    try {
      const ts = parseInt(timestamp, 10);
      if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false;
      const rawKey = b64ToBytes(pub);
      const key = await crypto.subtle.importKey('raw', rawKey, { name: 'Ed25519' }, false, ['verify']);
      const data = new TextEncoder().encode(`${timestamp}|${rawBody}`);
      return await crypto.subtle.verify({ name: 'Ed25519' }, key, b64ToBytes(signatureB64), data);
    } catch (e) {
      console.error('telnyx webhook verify error', e);
      return false;
    }
  },
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
