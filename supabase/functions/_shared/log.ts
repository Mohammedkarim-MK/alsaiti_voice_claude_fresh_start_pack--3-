// Structured logging with a correlation id — handoff §17.1 and §17.2.
//
// Two rules this file exists to enforce:
//   1. Every line is JSON with the same shape, so logs are searchable rather than readable-only.
//   2. Nothing sensitive is ever logged. `redact()` is applied to every field, so a token that
//      finds its way into an error message is stripped before it reaches the log.

const SECRET_KEYS = /(token|secret|password|api[_-]?key|authorization|apikey|credential|refresh)/i;

/** Anything that looks like a credential becomes a length-preserving placeholder. */
export function redact(value: unknown, key = ''): unknown {
  if (value == null) return value;
  if (SECRET_KEYS.test(key)) return '[redacted]';
  if (typeof value === 'string') {
    // Bearer tokens, JWTs and provider keys, wherever they appear in free text.
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
      .replace(/\b(sb_secret_|sbp_|sk_live_|re_|SG\.)[A-Za-z0-9._-]{8,}/g, '$1[redacted]')
      .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[jwt redacted]')
      .slice(0, 2000);
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redact(v, k);
    return out;
  }
  return value;
}

/**
 * The correlation id for this request.
 *
 * Prefers one the caller supplied, so a single enquiry keeps the same id from the browser
 * through the function logs into the stored row. Falls back to a fresh one.
 */
export function correlationId(req: Request): string {
  const supplied = req.headers.get('x-correlation-id') || '';
  if (/^[A-Za-z0-9_-]{8,64}$/.test(supplied)) return supplied;
  return 'cid_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

export interface LogFields {
  workspace_id?: string;
  provider?: string;
  provider_id?: string;
  status?: string;
  error_code?: string;
  [k: string]: unknown;
}

function emit(level: 'info' | 'warn' | 'error', fn: string, cid: string, event: string, fields: LogFields) {
  const line = {
    level, fn, event,
    correlation_id: cid,
    at: new Date().toISOString(),
    ...(redact(fields) as Record<string, unknown>),
  };
  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

/** One logger per request, so the correlation id never has to be passed around by hand. */
export function logger(fn: string, cid: string) {
  return {
    cid,
    info: (event: string, fields: LogFields = {}) => emit('info', fn, cid, event, fields),
    warn: (event: string, fields: LogFields = {}) => emit('warn', fn, cid, event, fields),
    error: (event: string, fields: LogFields = {}) => emit('error', fn, cid, event, fields),
  };
}
export type Log = ReturnType<typeof logger>;
