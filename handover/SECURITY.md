# Security

Handoff §4, §17.2, §19 (SEC-01..03). What is enforced, what was checked, and what to do when
something leaks.

## Where secrets are allowed to live

| Place | May hold | Must never hold |
|---|---|---|
| `docs/index.html` (browser) | `sb_publishable_…`, the project URL | Any `sb_secret_`, service role key, or provider key |
| `alsaiti-go/App.js` (native) | `sb_publishable_…` | Same |
| Supabase function secrets | Every provider credential | — |
| A future voice worker | Its own credentials, from container secret storage | Anything baked into the image |
| Git | Nothing secret, ever | — |

The browser and the native app hold a **publishable** key. That is by design: it is protected by
Row Level Security, and it is meant to be public. It is not a leak.

## Audit result — 27 July 2026

**SEC-01 — no server secret reaches a client.** Scanned `docs/index.html` and `alsaiti-go/App.js`
for `sb_secret_`, `sbp_`, `service_role`, provider key names, PEM blocks and JWT-shaped literals.
The only key-shaped literal in either file is `sb_publishable_fTj566JdyWy…`. Two JWT-shaped hits
turned out to be truncated placeholder text showing users what a GoHighLevel API key looks like.

**Git history — clean.** All 72 commits scanned for `sb_secret_`, `sbp_`, SendGrid `SG.`, Resend
`re_`, Stripe `sk_live_`, PEM blocks and long key-shaped strings. Matches for `sb_secret_` exist
only as documentation prose, never followed by a key value. The only key ever committed is the
publishable one.

**SEC-02 — the legacy-key trap.** See below. This was the significant finding.

**SEC-03 — tenant isolation.** RLS is enabled on all 17 tables and policies resolve membership
through the `SECURITY DEFINER` function `is_member()` rather than trusting a client-supplied
`business_id`. **This has not been tested with two real accounts** — that needs a live project and
is an owner action.

## SEC-02: migrating off the legacy keys, without an outage

Supabase injects `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` into every hosted function
automatically. Those are the **legacy** keys, and until recently every function in this project
read them directly. Clicking *Disable legacy API keys* in the dashboard would have taken the whole
backend down at once — contact form, TTS, CRM, telephony.

`supabase/functions/_shared/store.ts` now resolves keys in preference order, so the switch is
reversible:

```
serviceClient() → SUPABASE_SECRET_KEY      ?? SUPABASE_SERVICE_ROLE_KEY
userClient()    → SUPABASE_PUBLISHABLE_KEY ?? SUPABASE_ANON_KEY
```

Do it in this order, and do not skip step 3:

1. **Set the new secrets.** Supabase → Project Settings → API → create `sb_secret_…`, then
   `supabase secrets set SUPABASE_SECRET_KEY=… SUPABASE_PUBLISHABLE_KEY=…`. Every function starts
   using them immediately.
2. **Smoke-test.** Submit the contact form; open Integrations; play a TTS line. If anything
   misbehaves, `supabase secrets unset SUPABASE_SECRET_KEY` and the legacy path resumes at once.
3. **Only then** disable the legacy keys in the dashboard. Check the API Keys *last used*
   indicator first — it should show no recent legacy use.

## Rate limiting

Postgres-backed, atomic, via the `rate_limit_hit` RPC (migration `0003`). It **fails open**: if
the limiter itself errors the request is allowed and the failure logged, so a limiter outage
cannot take the product down.

| Endpoint class | Limit |
|---|---|
| Contact form (per IP) | 8 / minute |
| OAuth start | 10 / minute |
| Connection test | 20 / minute |
| Status + metadata reads | 120 / minute |
| Lead sync | 60 / minute |
| Phone number ordering | 5 / 5 minutes |
| Provider webhooks (per IP) | 600 / minute |

## Webhook verification

`telnyx-webhook` verifies the Ed25519 signature against `TELNYX_PUBLIC_KEY` before doing anything
with the payload, and deduplicates by provider event id. An unsigned or tampered event is
rejected. `crm-callback` runs without a JWT — it is reached by the provider's browser redirect —
and is protected by a single-use `state` value plus an open-redirect guard (`safeReturnUrl`) that
refuses any return URL not on our own origin.

## Token storage

CRM OAuth tokens are envelope-encrypted with AES-256-GCM under
`OAUTH_CREDENTIAL_ENCRYPTION_KEY` before they touch the database, and are never returned to a
browser or the native app.

## Logging rules

Log the event name, timestamp, workspace id, correlation id, provider id, status and error code.
Never log tokens, passwords, full payment data, or message bodies unless genuinely needed. `fail()`
in `_shared/http.ts` logs the real error server-side and returns only a short code to the client,
so internals never reach the browser.

## What counts as personal data here

Contact-form enquiries, lead records, call metadata, and `ip_hash`. Note that `ip_hash` is written
**only** when `CONTACT_IP_HASH_SALT` is set. Without a salt the column stays NULL, because a bare
SHA-256 of an IPv4 address can be brute-forced in seconds and storing one would be false
anonymisation.

## If a secret leaks

1. **Rotate first, investigate second.** Revoke at the provider before anything else.
2. Check what it could reach — Supabase logs, provider audit logs, `audit_logs`.
3. If it reached Git, rotating is not enough: the value stays in history. Rewrite history
   (`git filter-repo`), force-push, and tell every collaborator to re-clone.
4. Record it: what leaked, when, how, what was rotated, what was accessed.

**Never paste a secret into chat, a ticket, or a screenshot** — including to a developer. Give the
variable name and the dashboard page instead; the owner enters the value directly.

## Known gaps

- Tenant isolation is enforced but **not proven** with two live accounts (SEC-03).
- No automated secret scanning in CI — there is no CI pipeline in this repo.
- No error monitoring or uptime alerting (§17). A failure today is silent.
- The demo password is public by design in a static file; isolation, not rotation, is the control.
