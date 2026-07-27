# Implementation status

Every requirement in *Alsaiti Voice — Finalisation, Security, Integration and Go-Live Developer
Handoff v1.0* marked **Done**, **Blocked by owner**, **Deferred**, or **N/A**.

**Last updated:** 27 July 2026 · **Commit:** see `git log` · **Environment:** production

> **Why this lives in `handover/` and not `docs/`.** §22.2 asks for `docs/IMPLEMENTATION_STATUS.md`.
> In this repository `docs/` is the GitHub Pages web root — anything put there is published on the
> customer-facing site. Operational and security documentation does not belong on the marketing
> domain, so the file set lives in `handover/` instead. This is the only deliberate deviation from
> §22.2, and it is a path change, not a scope change.

---

## Truth summary

| Area | State | Evidence |
|---|---|---|
| Marketing contact form | **Done in code, not deployed** | 39 acceptance checks, FORM-01..07 |
| Supabase PAT | **Done** — revoked by owner before this work started | — |
| Legacy key dependency | **Done** — audited and unblocked; disabling still owner action | `_shared/store.ts` |
| Secrets in client/repo/history | **Done** — none found | SEC-01 scan, 72 commits |
| Public sign-ups | **Done** — invitation-only, no dead-end form | 16 checks |
| Demo account | **Partly done** — labelled and isolated in-browser; password rotation is owner action | — |
| HubSpot | **Blocked by owner** — no client credentials | — |
| Telnyx | **Blocked by owner** — no funded account | — |
| Live AI calls | **Not built** — labelled Infrastructure required | — |
| Other CRMs / webhooks | **Done** — all show Demo / Needs setup | 25 truth checks |
| Branding + accessibility | **Done** — one green system; every control now has a name | A11Y-01 |
| Privacy / Terms | **Done in code** — needs a solicitor's review | 40 checks |
| Email notifications | **Blocked by owner** — `lead-notify` not deployed, no provider key | — |
| Billing | **N/A** — Stripe not configured; nothing claims paid activation | — |
| Leads as source of truth | **NOT DONE** — the largest remaining gap, see below | — |

---

## The one thing that is not close

**Dashboard leads live only in browser `localStorage`.** `leadsKey(email)` returns
`'ag_leads_' + email`; the web app has zero references to the `leads` table, though that table
exists with RLS from migration `0001`. §7 says Supabase is the authoritative store and no lead may
exist only outside it. Today every lead in the dashboard exists only inside one browser profile:
clear site data and it is gone, and it is invisible from any other device.

This is a large change touching every screen and it has not been started. It is the difference
between a convincing demo and a product.

---

## Section by section

### §4 Supabase security and secret handling

| Item | State | Notes |
|---|---|---|
| 4.1 PAT revoked | Done | Confirmed by owner before this work |
| 4.1 Repo scan for secrets | **Done** | No secret material in the working tree |
| 4.1 Git-history scan | **Done** | 72 commits; only key ever committed is the publishable one |
| 4.1 Legacy-key dependency audit | **Done** | See below — the answer was "not safe yet" |
| 4.1 Disable legacy keys | **Blocked by owner** | Dashboard action; now safe to attempt |
| 4.2 Secret-storage rules | Done | Client holds only `sb_publishable_…`; providers server-side |
| 4.3 `.gitignore` coverage | Done | Added dumps, `.branches/`, `functions/.env` |
| 4.3 CI secret scanning | **Deferred** | No CI pipeline exists in this repo yet |
| 4.4 RLS enabled | Done | All 17 tables; policies use verified membership via `is_member()` |
| 4.4 Tenant isolation *tested* | **Not done** | Needs two real accounts on a live project — owner-blocked |

**The legacy-key finding.** Every Edge Function read `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_ANON_KEY`, which are the *legacy* keys Supabase injects automatically. Clicking
"disable legacy API keys" would have taken the whole backend down in one go. `_shared/store.ts`
now prefers `SUPABASE_SECRET_KEY` / `SUPABASE_PUBLISHABLE_KEY` and falls back, so the migration is
a reversible three-step. See `SECURITY.md`.

### §5 Contact form

| Test | State |
|---|---|
| FORM-01 valid submission | **Done** |
| FORM-02 double-click / retry idempotency | **Done** |
| FORM-03 invalid email, values retained | **Done** |
| FORM-04 database unavailable, no false success | **Done** |
| FORM-05 email provider down, lead still saved | **Done** |
| FORM-06 honeypot | **Done** — stored and flagged rather than discarded, see below |
| FORM-07 mobile and keyboard | **Done** |

Two deliberate departures from the letter of §5:

1. **The honeypot stores rather than discards.** §5.5 allows "rejected or silently contained".
   Browser autofill occasionally fills a field named `company_website`, and silently binning a
   genuine enquiry over an autofill quirk is the exact failure this document exists to prevent.
   The row is written with `source = 'website_form_honeypot'` and the owner is not emailed.
2. **`ip_hash` is NULL unless `CONTACT_IP_HASH_SALT` is set.** A bare SHA-256 of an IPv4 address
   is reversible by brute force in seconds, so storing one would claim an anonymisation property
   we do not have.

**Not deployed.** The rewritten function and migration `0006` are committed but not pushed to
Supabase. Until then the live site still runs the old behaviour.

### §6 Auth, users, workspaces, permissions

| Item | State |
|---|---|
| 6.1 No dead-end sign-up | **Done** — `SIGNUPS_OPEN=false` renders an invitation panel |
| 6.1 Admin invitations work | **Blocked by owner** — dashboard flow, untested here |
| 6.2 Demo domain consistency | **Done** — `demo@alsaiti.app` everywhere; no `.ai` references exist |
| 6.2 Demo password rotated | **Blocked by owner** — and see the note below |
| 6.2 Demo marked as demo data | Done — banner plus per-item Demo chips |
| 6.3 Roles and permissions | **Deferred** — schema has owner/admin/agent; no Manager/Staff/Read-only tier |
| 6.4 Auth acceptance tests | **Partly** — client-side covered; cross-workspace tests need a live project |

**On the demo password.** It is `demo1234`, hardcoded in `docs/index.html`, which is a public
static file. Rotating it does not hide it — whatever it becomes will be equally public. What
matters is that the demo account cannot reach production data or provider settings. Treat the
credential as public by design and enforce isolation server-side.

### §7 Data model

| Entity | State |
|---|---|
| workspaces, profiles, memberships, leads | Done (`0001`) |
| crm_connections, crm_sync_records, oauth sessions | Done (`0002`) |
| phone_numbers, telephony_connections, call_sessions, webhook events | Done (`0002`) |
| **lead_activities** | **Done** (`0006`) — service-role write only, so the timeline is trustworthy |
| **notifications** | **Done** (`0006`) |
| **audit_logs** | **Done** (`0006`) — readable by owner/admin only |
| conversations / messages | **Deferred** — no chat transcript store yet |
| 7.2 Idempotency | **Partly** — contact form done; voice and webhooks already dedupe by provider event id |
| 7.3 Versioned migrations | Done — `0001`–`0006`, none applied manually |

### §8 Internal CRM · §9 HubSpot · §10 Telnyx · §11 LiveKit

- **§8** — lead inbox, filters, profile, notes, CSV export and sync retry all work, but against
  `localStorage`, not Supabase. See the gap above.
- **§9 HubSpot** — OAuth flow, encrypted token storage, metadata load and sync are written and
  deployed. **Blocked by owner:** no `HUBSPOT_CLIENT_ID` / `HUBSPOT_CLIENT_SECRET`, so no real
  consent has ever happened. Correctly shows Needs setup.
- **§10 Telnyx** — verify/search/order/webhook functions deployed, Ed25519 signature verification
  implemented. **Blocked by owner:** no funded account. Shows Demo.
- **§11 LiveKit live calls** — **not built.** No worker, no SIP routing, nothing in the repo. The
  product does not claim otherwise anywhere; the voice screen is labelled a browser demo (§13).

### §12–§20

| Section | State |
|---|---|
| §12 Other CRMs / webhooks | Done — every provider shows Demo or Needs setup |
| §13 Voice demo distinction | **Done** — verified by test; never described as live phone answering |
| §14.1–14.2 Branding | Done — one green system across web and native |
| §14.3 Accessibility | **Done** — see below |
| §15 Email | **Blocked by owner** — `lead-notify` returns 404; no provider key set |
| §16 Billing | N/A — not configured, nothing simulates paid activation |
| §17 Monitoring / backups | **Deferred** — no error monitoring, no uptime alerts, no tested restore |
| §18 Privacy / consent / retention | **Done in code** — needs legal review |
| §19 QA matrix | Partly — see `TESTING.md` for which gates pass and which need a live project |
| §20 Go-live checklist | Partly — see `TESTING.md` |

**Accessibility finding.** Not one of the 44 `<label>` elements in the app was tied to its
control, so a screen reader announced every field on every screen as unlabelled. Fixed by
associating labels at render time, plus `aria-label` on the two search/reply inputs that had only
a placeholder. A placeholder is not an accessible name — it disappears the moment typing starts.

---

## Owner actions, in priority order

1. **Deploy what is written.** `supabase db push` then `supabase functions deploy contact-submit`.
   Until this happens the contact-form fix is not live.
2. **Deploy `lead-notify`** and set `RESEND_API_KEY` + `ALERT_FROM_EMAIL` + `LEAD_NOTIFICATION_TO`.
   No lead alert email can be sent without this.
3. **Verify a Resend sending domain** — the test `resend.dev` domain cannot mail arbitrary people.
4. **Legacy keys** — set `SUPABASE_SECRET_KEY` and `SUPABASE_PUBLISHABLE_KEY`, smoke-test, then
   disable the legacy keys. In that order.
5. **Rotate the demo password** and confirm the demo account cannot see production data.
6. **HubSpot app** — see `INTEGRATIONS.md` for the exact redirect URL and scopes.
7. **Fund Telnyx** — see `INTEGRATIONS.md`.
8. **Have a solicitor read** the Privacy Policy and Terms before the site takes public traffic.

## Deferred, with reasons

| Requirement | Reason | Risk if left |
|---|---|---|
| Leads in Supabase (§7, §8) | Large change across every screen; needs a decision on demo/production split | High — the core product promise is unmet |
| Monitoring and alerting (§17) | No provider chosen | Medium — failures will be silent |
| Tested backup restore (§17.3) | Needs a live project and a maintenance window | Medium |
| Roles beyond owner/admin/agent (§6.3) | Not required for a single-tenant pilot | Low |
| Conversations / messages tables (§7.1) | No chat transcript feature yet | Low |
| CI secret scanning (§4.3) | No CI pipeline in this repo | Low — history is currently clean |
| Native-speaker review of ES/AR | Needs a human reviewer | Medium — legal text is now included |
