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
