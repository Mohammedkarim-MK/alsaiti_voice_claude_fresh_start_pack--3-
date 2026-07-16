// POST /functions/v1/telnyx-search   { country, areaCode?, type?, limit? }
// Auth: verify_jwt = true. REAL Telnyx available-number search. Read-only — orders nothing.

import { preflight, json, fail } from '../_shared/http.ts';
import { resolveWorkspace } from '../_shared/store.ts';
import { telnyx } from '../_shared/telnyx.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  try {
    await resolveWorkspace(req); // gate on a signed-in member
    const { country, areaCode, type, limit } = await req.json().catch(() => ({}));
    if (!country || !/^[A-Za-z]{2}$/.test(country)) return fail('invalid_country', 400);

    const numbers = await telnyx.searchNumbers({ country: country.toUpperCase(), areaCode, type, limit });
    return json({ ok: true, count: numbers.length, numbers });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (msg === 'unauthenticated') return fail('unauthenticated', 401);
    if (msg.startsWith('Missing')) return fail('telnyx_not_configured', 501, msg);
    return fail('search_failed', 502, msg);
  }
});
