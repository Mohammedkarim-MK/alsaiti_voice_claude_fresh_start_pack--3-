# Security posture — Alsaiti Growth

Last audited: 2026-07-21. Scope: the whole repo — web app (`docs/index.html`), native app
(`alsaiti-go/`), backend (`supabase/`), and full git history.

---

## What was verified (and how)

| Area | Result | How it was proven |
|---|---|---|
| Leaked secrets | **Clean** | Pattern scan of every tracked file **and the entire git history**. No API key, service-role key, private key or `.env` was ever committed. |
| XSS / injection | **Clean** | Live penetration test (`pentest.js`): 10 hostile payloads (script tags, attribute breakout, `onerror`, `javascript:`, `</textarea>` escape) fired at **every input surface** — lead fields, search, voice, settings, CRM wizard, backend panel. Nothing executed; payloads render as inert text. |
| Prototype pollution | **Clean** | Crafted `__proto__` JSON injected into storage; `Object.prototype` stayed clean. |
| Password handling | **Sound (for a demo)** | Stored as a **salted hash** (32-char salt, 2048 SHA-256 iterations, 64-hex output). No plaintext anywhere; session record holds no password material. |
| Secrets in the browser bundle | **Clean** | No service-role key, provider client secret, or Telnyx key in the shipped file. |
| Row-Level Security | **Enforced** | RLS enabled on **all 14 tables**. Members can only read their own workspace's rows. |
| Credential isolation | **Enforced** | `crm_credentials`, `telephony_credentials`, `oauth_authorisation_sessions`, `telephony_webhook_events` have **no client policy** and are explicitly `revoke`d from `anon`/`authenticated` — service-role only. |
| IDOR (accessing someone else's data) | **Blocked** | Every ID-taking Edge Function re-checks `workspace_id` against the caller's workspace. |
| Public endpoints | **Authenticated** | Only 2 functions are public: `crm-callback` (single-use OAuth state + expiry + provider match) and `telnyx-webhook` (Ed25519 signature + 5-min replay window; unsigned → 401). |
| Token leakage | **Blocked** | `crm-status` never returns `credential_reference` or tokens. OAuth tokens are AES-256-GCM encrypted at rest; the key lives in function env, never the DB. |
| Privilege escalation via SQL | **Guarded** | `is_member()` is `SECURITY DEFINER` with a pinned `search_path = public`. |
| Dependencies | **Acceptable** | 12 moderate advisories, **all in Expo build/CLI tooling** (`@expo/cli`, `prebuild-config`, `postcss`, `xcode`). None ship in the app users run. |

---

## Bug found and fixed in this audit

**Content-Security-Policy blocked all backend calls (would have broken the CRM/phone integration in production).**
The page declared `default-src 'none'` but no `connect-src`. CSP falls back to `default-src`, so
`connect-src` resolved to `'none'` and **the browser blocked every `fetch()`** — Supabase Auth and
all Edge Function calls. Unit tests mock `fetch` and don't enforce CSP, so it passed tests while
being broken in a real browser.
**Fix:** `connect-src 'self' https://*.supabase.co` added. **Regression test:** `csptest.js` now
asserts the CSP permits every endpoint the app actually calls, and fails if `connect-src` is ever
left to inherit a restrictive default again.

---

## Deliberate design decisions (not bugs)

- **The Supabase publishable key is in the frontend — that is correct.** `sb_publishable_…` keys are
  designed to be public and are protected by RLS. The **secret** key (`sb_secret_…`) and
  service-role key must never appear in frontend code — and they don't.
- **`Access-Control-Allow-Origin: *` on the Edge Functions is safe here.** The API authenticates with
  a **Bearer JWT**, not cookies, so CORS is not a CSRF boundary. An attacker without the token gets
  401 from any origin; one *with* the token can call it from `curl` regardless of CORS. Tokens live in
  `localStorage`, which no other origin can read.
- **The demo login is not real authentication.** `demo@alsaiti.app` and any account created in the
  browser live in `localStorage`. This is fine for a public demo, but **real customer data must use
  Supabase Auth** (already wired) — never the demo login.

---

## Known limitations / remaining work before real customer data

1. **Clickjacking** — `frame-ancestors` only works as an HTTP header, which GitHub Pages cannot set.
   Add `Content-Security-Policy: frame-ancestors 'none'` (or `X-Frame-Options: DENY`) at the host/CDN
   when this moves off GitHub Pages.
2. **No rate limiting** on Edge Functions — add per-IP/per-user throttling before public launch to
   limit brute-force and abuse.
3. **Token refresh under concurrency** — refresh should be wrapped in a distributed lock (Postgres
   advisory lock or Redis) so simultaneous requests can't invalidate each other's tokens.
4. **Expo tooling advisories** — resolved by future Expo SDK upgrades. Do **not** run
   `npm audit fix --force`: it breaks the pinned SDK 54.
5. **Secrets rotation** — if the Supabase project ever held a real secret key, rotate it in the
   dashboard. (None was ever committed here.)

---

## Rules for contributors

- Never commit a `.env`, a `service_role`/`sb_secret_` key, or a provider client secret.
  Only `.env.example` (names, no values) belongs in git.
- All user-supplied text rendered into HTML **must** pass through `esc()`. The app builds markup by
  string concatenation, so an unescaped interpolation is a stored-XSS bug.
- Anything holding a secret is **service-role only**: no RLS client policy, and `revoke`d from
  `anon`/`authenticated`.
- A CRM shows **Connected** only after a real backend test passes; a phone number shows **Active**
  only after a verified real inbound call. Never fake a trusted state.
- Re-run the security suites before shipping: `pentest.js`, `csptest.js`, `deepcheck2.js`.
