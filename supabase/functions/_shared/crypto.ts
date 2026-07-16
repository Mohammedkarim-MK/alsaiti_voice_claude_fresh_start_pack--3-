// Envelope encryption for OAuth tokens + provider API keys, using the Web Crypto API
// (available natively in Deno / Supabase Edge Functions — no npm dependency).
//
// Format stored in Postgres: "<iv_base64>.<ciphertext_base64>"  (AES-256-GCM; Web Crypto
// appends the 16-byte auth tag to the ciphertext). The 32-byte key lives ONLY in the
// function's environment (OAUTH_CREDENTIAL_ENCRYPTION_KEY), never in the database.

function envKey(name: string): string {
  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno?.env;
  const v = env ? env.get(name) : undefined;
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function keyBytes(): Uint8Array {
  const raw = envKey('OAUTH_CREDENTIAL_ENCRYPTION_KEY');
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? hexToBytes(raw) : b64ToBytes(raw);
  if (buf.length !== 32) throw new Error('OAUTH_CREDENTIAL_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)');
  return buf;
}

async function importKey(usage: KeyUsage): Promise<CryptoKey> {
  return await crypto.subtle.importKey('raw', keyBytes(), { name: 'AES-GCM' }, false, [usage]);
}

export async function encryptJson(obj: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey('encrypt');
  const pt = new TextEncoder().encode(JSON.stringify(obj));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt));
  return `${bytesToB64(iv)}.${bytesToB64(ct)}`;
}

export async function decryptJson<T = unknown>(blob: string): Promise<T> {
  const [ivB, ctB] = blob.split('.');
  if (!ivB || !ctB) throw new Error('malformed ciphertext');
  const key = await importKey('decrypt');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(ivB) }, key, b64ToBytes(ctB));
  return JSON.parse(new TextDecoder().decode(new Uint8Array(pt))) as T;
}

// ---- OAuth state + PKCE (base64url, SHA-256) ----
export function randomUrlSafe(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return base64url(b);
}
export async function sha256b64url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64url(new Uint8Array(digest));
}
export async function makeState(): Promise<{ state: string; stateHash: string }> {
  const state = randomUrlSafe(32);
  return { state, stateHash: await sha256b64url(state) };
}
export async function makePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomUrlSafe(48);
  return { verifier, challenge: await sha256b64url(verifier) };
}

function base64url(bytes: Uint8Array): string {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
