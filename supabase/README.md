# Alsaiti Voice — Supabase backend (real CRM OAuth + Telnyx)

This folder is the **real backend** that makes the demo's CRM and phone buttons genuinely
functional. A static GitHub Pages site cannot securely exchange OAuth tokens, store CRM
credentials, hold Telnyx keys, or receive live call events — so all of that happens here, in
**Supabase Edge Functions** (Deno), with **Supabase Postgres** as the source of truth.

```
supabase/
  migrations/
    0001_foundation.sql              profiles, workspaces, members, leads (+ RLS)
    0002_integrations_telephony.sql  crm_connections, crm_credentials, oauth sessions,
                                     telephony_connections, phone_numbers, call_sessions (+ RLS)
  functions/
    _shared/    http, crypto (AES-256-GCM), providers, hubspot, telnyx, store, tokens
    crm-authorise    → returns the provider's REAL authorize URL
    crm-callback     → exchanges the code server-side, stores encrypted tokens, loads metadata
    crm-test         → runs a REAL provider round-trip; only this flips a card to "Connected"
    crm-metadata     → loads pipelines / stages / owners / fields
    crm-status       → truthful connection list for the app (no secrets)
    telnyx-verify    → real Telnyx account check
    telnyx-search    → real Telnyx number search
    telnyx-order     → orders a number (idempotent); number stays "test_pending"
    telnyx-webhook   → verifies Ed25519 signature; a real inbound call flips a number to "Active"
  config.toml        per-function verify_jwt settings
  functions/.env.example   the secrets to set (never committed)
```

## Golden rules (enforced in code)

- **Secrets never touch the browser.** Provider client secrets, Telnyx keys and OAuth tokens
  live only in Edge Function env / the encrypted `crm_credentials` table. The frontend only ever
  holds the Supabase **anon** key + the signed-in user's JWT.
- **No fake states.** A CRM shows **Connected** only after `crm-test` passes a real API call.
  A phone number shows **Active** only after `telnyx-webhook` records a real inbound call.
- **Supabase is the source of truth** for connections, numbers, call sessions, leads and logs.

---

## Setup (about 30–40 min end-to-end)

### 1. Create the project + schema

1. Create a project at **supabase.com** (free tier is fine).
2. **SQL editor →** run `migrations/0001_foundation.sql`, then `migrations/0002_integrations_telephony.sql`.
3. Install the CLI: `npm i -g supabase`, then `supabase login` and
   `supabase link --project-ref YOUR_REF`.

### 2. Set the function secrets

```bash
cp supabase/functions/.env.example supabase/functions/.env
# fill in the values (see below), then:
supabase secrets set --env-file supabase/functions/.env
```

Generate the token-encryption key: `openssl rand -hex 32` → `OAUTH_CREDENTIAL_ENCRYPTION_KEY`.
Set `PUBLIC_FUNCTIONS_URL=https://YOUR_REF.supabase.co/functions/v1` and
`PUBLIC_APP_URL=` your app URL (the GitHub Pages demo URL is fine).

### 3. Deploy the functions

```bash
supabase functions deploy crm-authorise crm-callback crm-test crm-metadata crm-status \
  telnyx-verify telnyx-search telnyx-order telnyx-webhook
```

`config.toml` already sets `verify_jwt = false` for `crm-callback` (the CRM redirects here with
no JWT — it trusts the single-use `state`) and `telnyx-webhook` (Telnyx signs with Ed25519).

### 4. HubSpot setup (the provider wired end-to-end)

1. **developers.hubspot.com → Create app** (or use a developer test account).
2. **Auth tab →** set the **Redirect URL** to
   `https://YOUR_REF.supabase.co/functions/v1/crm-callback/hubspot`.
3. Add scopes: `oauth`, `crm.objects.contacts.read/write`, `crm.objects.deals.write`,
   `crm.schemas.contacts.read`.
4. Copy the **Client ID / Client secret** → `HUBSPOT_CLIENT_ID` / `HUBSPOT_CLIENT_SECRET`, then
   re-run `supabase secrets set …` and redeploy.

### 5. Telnyx setup (primary phone provider)

1. Fund a **telnyx.com** account and complete business verification.
2. **API keys →** create a key → `TELNYX_API_KEY`.
3. **Account → Public key** (Ed25519, base64) → `TELNYX_PUBLIC_KEY` (needed for webhook verification).
4. Point your Voice API application's webhook at
   `https://YOUR_REF.supabase.co/functions/v1/telnyx-webhook`.

### 6. Connect the app to the backend

Open the app → **Integrations → Connect a backend**, paste your **Project URL** + **anon key**,
and sign in with a Supabase Auth user (create one under **Authentication → Users**, or wire the
app's sign-up to Supabase Auth). Then **Connect** on HubSpot runs the real OAuth flow.

---

## What is genuinely functional vs. still demo

| Capability | State |
|---|---|
| HubSpot OAuth → callback → token exchange → encrypted storage → metadata → real test → Connected | **Real** (once creds + deploy done) |
| Truthful connection states everywhere (Demo / Needs setup / Authorising / Test required / Connected / Attention / Error) | **Real** |
| Telnyx account verify, number **search**, number **order** (idempotent) | **Real** |
| Telnyx webhook Ed25519 verification + inbound-call → number goes Active | **Real** |
| Pipedrive / HighLevel / Google / Salesforce / Zoho / Dynamics **authorisation** | Real OAuth once creds set; **live test + metadata are HubSpot-only** — others report `test_required` → `attention_required` truthfully (never fake Connected) |
| Custom API / Generic Webhook | **Demo** config wizard (labelled) |
| Live AI phone calls (answer + transcribe + create exactly one lead) | **Not built here** — needs a long-running LiveKit SIP + voice worker (a separate always-on service; Edge Functions can't hold a live audio session) |

## Blocked by missing credentials / infrastructure (nobody can do these in code)

- A funded **Telnyx** account + business verification + a purchased number for a real inbound test.
- Provider **developer apps** (HubSpot first) for client IDs/secrets + approved redirect URIs.
- For real calls: a deployed **LiveKit SIP** + **voice-agent worker** (VPS / container host).

## Definition of "go-live"

A real public call to a real Telnyx number creates **exactly one** lead and syncs it to a
**genuinely authorised** CRM. The CRM half is reachable now (HubSpot end-to-end); the phone-call
half needs the voice worker deployed.
