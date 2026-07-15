# Alsaiti Voice — Production Backend (go-live scaffold)

This folder is the **starting point** for turning the Alsaiti Voice demo into a real,
functional SaaS with genuine CRM OAuth and Telnyx phone calls, per the specs in
[`../alsaiti_voice_claude_fresh_start/`](../alsaiti_voice_claude_fresh_start/) — especially
`13_`, `14_` and **`15_REAL_OAUTH_TELNYX_GO_LIVE.md`**.

> **Read this first.** The public demo (`docs/index.html` on GitHub Pages) is a *truthful,
> labelled demonstration*. It **cannot** perform real OAuth or place real phone calls — a
> static site has no server to hold secrets, exchange OAuth tokens, or receive live call
> events. Going live is a **backend + accounts + infrastructure** project, not a front-end
> change. This scaffold + the specs are what a senior developer builds on.

---

## What is real vs. what needs setup

| Piece | Status here | To make it real |
|---|---|---|
| Truthful UI states + demo labels | ✅ done (in the demo) | keep as the public demo |
| DB schema (CRM + telephony + OAuth) | ✅ `supabase/migrations/0001_*.sql` | run against your Supabase project |
| Env var contract | ✅ `.env.example` | fill from provider consoles (server-side only) |
| Container stack | ✅ `docker-compose.yml` (reference) | complete + deploy to a VPS/cloud VM |
| OAuth framework + HubSpot adapter | ✅ reference code in `src/lib/oauth/` | add client IDs + wire ports; add other adapters |
| Telnyx adapter + number/call flow | ⬜ scaffold next (`src/lib/telephony/`) | needs a funded Telnyx account |
| LiveKit voice worker (real calls) | ⬜ separate long-running service | deploy LiveKit SIP + Agents worker |

---

## What Alsaiti Growth must provide (nobody can do this in code)

Per spec §24 — the developer **cannot** create these alone:

**Domains & pages**
- [ ] Production app domain (`voice.alsaitigrowth.com`) + API domain (`api.voice.alsaitigrowth.com`), DNS + HTTPS
- [ ] Privacy policy, Terms of service, support/contact page, data-deletion page (required by OAuth app reviews)

**Provider developer apps** (one each — gives the `CLIENT_ID` / `CLIENT_SECRET` / redirect URI)
- [ ] HubSpot developer app  · [ ] Pipedrive app  · [ ] HighLevel marketplace app
- [ ] Google Cloud project + OAuth consent screen  · [ ] Salesforce Connected/External Client App
- [ ] Zoho API Console client  · [ ] Microsoft Entra app registration

**Telnyx (real phone numbers & calls)**
- [ ] Funded Telnyx account + identity/business verification
- [ ] Confirm **Managed Accounts** eligibility with Telnyx
- [ ] Desired countries / number types + any regulatory documents
- [ ] Voice/SIP configuration permissions

**Infrastructure**
- [ ] Production server or hosting platform (server-capable — not GitHub Pages)
- [ ] Secret vault (Infisical / OpenBao / managed KMS)
- [ ] n8n production instance · Redis · monitoring · backups

---

## Architecture (target)

```
Browser / Expo  →  Next.js app (voice.alsaitigrowth.com)
                     └─ server API + OAuth callbacks (api.voice.alsaitigrowth.com)
                          ├─ Supabase        (source of truth)
                          ├─ Secret vault    (OAuth tokens, Telnyx keys, SIP passwords)
                          ├─ Redis           (queues, distributed locks, rate limits)
                          └─ n8n             (integration execution engine)

Public caller → Telnyx number → Telnyx SIP → self-hosted LiveKit SIP → LiveKit room
             → long-running voice-agent worker → lead service → Supabase → CRM sync
```

**Golden rules:** Supabase is the source of truth. Tokens/keys live **only** in the vault
(never in Postgres/n8n/browser/Expo/logs/git). A CRM shows **Connected** only after a real
API test passes. A number shows **Active** only after a real inbound test call succeeds.

---

## Build order (spec §21) — do ONE vertical slice first

1. **Phase 0 — preserve the demo.** Keep GitHub Pages as a labelled demo; no real credentials on it.
2. **Phase 1 — production backend.** Deploy server app, domains+HTTPS, vault, Redis, run `0001_*.sql`, wire `.env`.
3. **Phase 2 — HubSpot end-to-end** (the reusable OAuth framework): real redirect → consent → callback → token exchange → vault → load account/pipelines → real test contact → `Connected`.
4. **Phase 3 — remaining CRMs** (HighLevel, Pipedrive, Google Sheets, Salesforce, Zoho, Dynamics, Custom API, Webhook verify).
5. **Phase 4 — Telnyx account** (managed / customer OAuth / API-key fallback) + webhook signature verification.
6. **Phase 5 — Telnyx numbers** (search, order, track, configure, forward, port).
7. **Phase 6 — real calls** (LiveKit SIP + voice worker + exactly-once lead + transcript + CRM sync).
8. **Phase 7 — hardening** (RLS/replay/refresh tests, load, monitoring, billing, pilot).

**Definition of go-live (spec §26):** a real public call to a real Telnyx number creates
**exactly one** lead and syncs it to a **genuinely authorised** CRM.

---

## Local dev

```bash
cp .env.example .env       # fill server-side values (dev provider apps + Telnyx test)
# run the SQL in supabase/migrations against your Supabase project
docker compose up -d       # reverse-proxy, web, workers, n8n, redis, vault
```

### CRM OAuth framework (`src/lib/oauth/`) — implemented as reference

- `types.ts` — provider/connection types + the ports you implement (`OAuthSessionStore`,
  `CredentialVault`, `ConnectionStore`, `AuditLog`).
- `providers.ts` — provider registry (HubSpot, Pipedrive, HighLevel, Google, Salesforce,
  Zoho, Dynamics: authorize/token URLs, scopes, PKCE flag) + `makeState`/`makePkce`/
  `buildAuthorizeUrl`/`exchangeCode`/`refreshTokens`.
- `hubspot.ts` — the reference connector: `getIdentity`, `loadMetadata`, real `runTest`
  (creates + archives a test contact).
- `index.ts` — `startAuthorisation`, `handleCallback`, `testConnection` (only a passing
  real test flips a card to `connected`), `getValidAccessToken` (refresh under a lock),
  `disconnect`.

Route handlers under `src/app/api/integrations/[provider]/authorise` and
`src/app/api/oauth/[provider]/callback` call this framework. **To activate:** create a
`ports.ts` that implements the interfaces against your Supabase project + secret vault,
add `HUBSPOT_CLIENT_ID/SECRET` from a real HubSpot app, and uncomment the wiring in the
route handlers. Then add the remaining provider connectors following `hubspot.ts`.

> All TypeScript here parses cleanly, but it is a **reference scaffold** to be reviewed,
> completed (ports + remaining adapters) and **tested with real credentials** — not a
> drop-in, security-audited production module.

> Everything here is a scaffold to be reviewed, completed and **tested with real
> credentials** by a senior developer. It is not claimed to be production-ready or
> security-audited as-is.
