// Shared HTTP helpers for every Edge Function: CORS, preflight, JSON + redirect responses.
// The browser app is served from GitHub Pages (a different origin), so CORS is required.

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
  });
}

export function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { ...corsHeaders, Location: location } });
}

// Never leak internals to the client; log the real error server-side.
export function fail(message: string, status = 400, detail?: unknown): Response {
  if (detail) console.error(message, detail);
  return json({ ok: false, error: message }, status);
}

/**
 * OPEN-REDIRECT GUARD. `returnUrl` arrives from the client and we later 302 the browser to it,
 * so it must never be trusted: an attacker could otherwise craft a link that passes through our
 * trusted domain and lands on a phishing site. Anything not on our own app origin is discarded
 * and replaced with PUBLIC_APP_URL.
 */
export function safeReturnUrl(candidate?: string): string | undefined {
  // deno-lint-ignore no-explicit-any
  const appUrl = ((globalThis as any).Deno?.env.get('PUBLIC_APP_URL') || '').trim();
  if (!appUrl) return undefined;
  let base: URL;
  try { base = new URL(appUrl); } catch { return undefined; }
  if (!candidate || typeof candidate !== 'string') return appUrl;
  try {
    const u = new URL(candidate, base);                 // resolves relative paths against our app
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return appUrl; // no javascript:/data:
    if (u.origin !== base.origin) return appUrl;        // foreign origin → refuse
    return u.toString();
  } catch { return appUrl; }
}
