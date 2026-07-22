// Rate limiting for Edge Functions — atomic, race-safe, backed by Postgres (no Redis).
// Fails OPEN (allows the request) if the limiter itself errors, so a limiter outage can
// never take the product down — but logs loudly so it's visible.

import { serviceClient } from './store.ts';
import { json } from './http.ts';

export interface Limit { limit: number; windowSeconds: number }

// Sensible defaults per class of endpoint. Tighten as real traffic is observed.
export const LIMITS = {
  auth:     { limit: 10,  windowSeconds: 60 },   // starting an OAuth flow
  test:     { limit: 20,  windowSeconds: 60 },   // running a live connection test
  read:     { limit: 120, windowSeconds: 60 },   // status/metadata polling
  write:    { limit: 60,  windowSeconds: 60 },   // lead sync
  order:    { limit: 5,   windowSeconds: 300 },  // buying a phone number — deliberately strict
  webhook:  { limit: 600, windowSeconds: 60 },   // per-IP; carriers burst legitimately
} satisfies Record<string, Limit>;

/** Client IP, honouring the proxy headers Supabase sets. */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  return (xff.split(',')[0] || req.headers.get('cf-connecting-ip') || 'unknown').trim();
}

/**
 * Consume one token from `bucket`. Returns null when allowed, or a ready-to-return
 * 429 Response (with Retry-After) when the caller is over the limit.
 */
export async function enforceLimit(bucket: string, l: Limit): Promise<Response | null> {
  try {
    const sb = serviceClient();
    const { data, error } = await sb.rpc('rate_limit_hit', {
      p_bucket: bucket, p_limit: l.limit, p_window_seconds: l.windowSeconds,
    });
    if (error) { console.error('rate_limit_hit failed (failing open):', error.message); return null; }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.allowed === false) {
      const retry = Number(row.retry_after) || l.windowSeconds;
      return json(
        { ok: false, error: 'rate_limited', retry_after: retry },
        429,
        { 'Retry-After': String(retry), 'X-RateLimit-Limit': String(l.limit), 'X-RateLimit-Remaining': '0' },
      );
    }
    return null;
  } catch (e) {
    console.error('rate limiter error (failing open):', e);
    return null;
  }
}

/** Per-signed-in-user limit — the right key for authenticated endpoints. */
export function userBucket(userId: string, fn: string): string { return `user:${userId}:${fn}`; }
/** Per-IP limit — for public endpoints that have no user. */
export function ipBucket(req: Request, fn: string): string { return `ip:${clientIp(req)}:${fn}`; }
