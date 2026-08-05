# Developer response to the Production Blueprint v1.0

Answers to §17.1, the deliverables requested in §17.3, and a scoped backlog.

**Prepared:** 5 August 2026 · **Against:** commit `2b70eba` · **Blueprint:** v1.0, 5 August 2026

> §16.1 says the developer "should return a scoped estimate after reviewing the repository and
> this specification, not agree to a date from screenshots alone." This is that review. Every
> claim below is checkable against the repository — the tooling that produced the numbers is in
> `tests/repo-audit.js` and `tests/verify-deploy.js`.

---

## Assessment in one paragraph

The blueprint is technically sound, and correct on the three points that most specifications get
wrong: OTP proves ownership but cannot route calls (§2.3), n8n is an integration runtime and not
a system of record (§2.2), and crawled web content is untrusted data that must never reach a
prompt as instructions (§2.5). I agree with all five non-negotiable decisions and have not
argued with any of them. The gap is size, not direction: measured against §12.1 the repository
has **12 of 28 core entities**, **4 of 18 platform events** and satisfies **6 of 12 P0 acceptance
tests**. This is a working single-tenant lead-capture app with a real security posture, not yet a
multi-tenant platform.

---

## Where the repository actually stands

| Blueprint requirement | State | Evidence |
|---|---|---|
| §12.1 core entities | **12 / 28** | `tests/repo-audit.js` |
| §12.3 platform events | **4 / 18** | only `lead.created`, `lead.status_changed` were emitted before `0008` |
| §12.4 event envelope | was 4 / 12 → **now 12 / 12** | migration `0008` |
| §16.2 P0 acceptance | **6 / 12** | 4 of the 6 passing are tested against fakes, not providers |
| Durable outbox (§4.1) | **built, not deployed** | `platform_events` + claim/ack/fail/requeue |
| RLS on every tenant table | **yes** | 22 tables, all enabled or privileges revoked |
| Multi-tenant boundary | **partial** | `workspace_id` everywhere; **no `location_id`** until `0008` |
| n8n | **absent** | no instance, no workflows, no queue consumer |
| Website import | **absent** | — |
| Microsoft / Google OAuth | **absent** | only Resend transactional mail exists |
| Assistant versioning | **absent** | assistant config is hard-coded, not a versioned row |
| Analytics facts | **absent** | dashboard computes from live rows, no `analytics_daily` |

**Deployment reality:** migrations `0006`, `0007` and `0008` are **not applied**, and two Edge
Functions return 404. `tests/verify-deploy.js` currently reports 17 failures against production.
Nothing in this document is live.

---

## §17.1 — the fifteen questions

**1. What frontend framework and deployment architecture, and which screens use real Supabase data?**
No framework. `docs/index.html` is a single 500 KB static file with no build step, served by
Cloudflare Pages from the `docs/` directory, deploying on push to `main`. Security headers come
from `docs/_headers`, which Cloudflare honours and GitHub Pages ignored. Screens on real Supabase
data: sign-in, integrations, telephony, TTS, and — after `0007` — leads for a signed-in account.
Everything else is browser-local demo state, labelled as such.

**2. Is the database already multi-tenant? Show `organisation_id` and RLS.**
Yes, under a different name: `workspaces` / `workspace_members`, with `workspace_id` on every
tenant-owned table. RLS is enabled on all 22 tables and resolves membership through the
`SECURITY DEFINER` function `is_member()` rather than trusting a client-supplied id. Migration
`0007` added the §6.3 role matrix — owner / admin / manager / staff / readonly — enforced in
policy, so read-only genuinely cannot write. **`location_id` did not exist**; `0008` adds
`business_locations` and the foreign keys.
*Renaming to `organisations` is a mechanical migration. I recommend deferring it — the concept is
correct and a rename touches every policy for no functional gain.*

**3. How are calls connected to Retell/Telnyx, and which webhooks are stored?**
They are not. Four Telnyx functions are written and deployed — `telnyx-verify`, `-search`,
`-order`, `-webhook` — with Ed25519 signature verification and provider-event deduplication.
No account is funded, so none has ever run. Retell is not integrated. There is a LiveKit worker
in `voice-worker/` whose business logic is covered by 40 tests, but its LiveKit binding has never
executed against a real call and says so at the top of the file.

**4. Can the app support immutable assistant versions and per-tenant published config?**
Not today — assistant behaviour is hard-coded. The architecture does not fight it: `0008` adds
the event spine that a publish/rollback lifecycle needs, and `assistant_versions` is a Phase 2
table. This is the single largest piece of Blueprint work that has not been started.

**5. Where will provider/OAuth credentials be stored and encrypted?**
Already solved. `crm_credentials` holds AES-256-GCM envelope-encrypted tokens under
`OAUTH_CREDENTIAL_ENCRYPTION_KEY`, encrypted before they reach the database and never returned to
a browser or the native app. `supabase/functions/_shared/crypto.ts`.

**6. Will n8n be self-hosted, and what queue/worker architecture?**
Not deployed and not yet decided — this needs Abdelmalik's answer, because it is the first real
monthly infrastructure cost. My recommendation: **defer n8n**. `platform_events` now gives a
durable outbox with retry, backoff and dead-lettering. A single consumer process is enough for
the first pilots, and adding n8n before there is a second connector buys operational burden with
no capability. Add it when the connector catalogue justifies it, which the outbox is designed to
allow without rework.

**7. Does the planned n8n use require Embed/OEM licensing?**
Only if the editor is embedded or white-laballed. §8.1 is right to flag it. Keeping n8n internal
and building Alsaiti's own mapping UI avoids the question entirely, which is another reason to
defer.

**8. How will a shared workflow load tenant mappings without cloning per customer?**
`connector_mappings` (Phase 4) holds a versioned mapping per tenant + connector. A consumer
receives `workspace_id`, `event_id` and `connector_id` from the outbox, loads the mapping
server-side, and executes. §8.3's eight stages — receive, idempotency, transform, execute,
reconcile, retry, dead-letter, audit — map onto the outbox functions already written; only
transform and execute are missing.

**9. Which UK carriers/PBX systems will the first forwarding wizard support?**
Undecided, and it needs a product answer before engineering. My recommendation for the first
release: **BT, EE, Vodafone, Three, Sky and Virgin** for mobile and business lines, plus a
generic "advanced / SIP" path. Conditional-forwarding codes differ per carrier and must be a
maintained instruction library, not guessed at runtime.

**10. How will a real phone route test be automated, and what is "Active"?**
The definition is settled and already enforced elsewhere in the product: **Active means an inbound
test call reached the correct tenant's assistant and the provider call id was stored.** Migration
`0007` and the truth-label work make every status backend-derived — a demo number cannot display
"Active", asserted by 68 checks in `tests/truth-labels.test.js`. The automation does not exist
because no carrier route does.

**11. Which email scopes for Microsoft and Google, and how are subscriptions renewed?**
Not built. Recommended least-privilege: Microsoft `Mail.Send`, `Mail.ReadWrite` (shared mailbox
only) and `offline_access`; Google `gmail.send` plus `gmail.modify` only if reply-threading is
required. Graph subscriptions expire in ~3 days and Gmail `watch` in 7, so renewal must be a
scheduled job with a visible health state — §14.2 is right that "mailbox notification silence" is
a monitorable event, and silence is the failure mode nobody notices.

**12. First two CRM/calendar connectors and their acceptance tests?**
HubSpot is written end-to-end — OAuth with PKCE, encrypted tokens, metadata load, lead sync,
`crm_sync_records` with external ids and retry. It has never authorised, because there are no
client credentials. I would add **Google Calendar** second: it is the action customers actually
want (a booking), and it shares the Google OAuth work with §11.

**13. How will website content be sanitised, reviewed and protected from prompt injection?**
Not built. §2.5 and §13.2 describe the correct design and I would implement it as written: SSRF
blocking on private ranges, metadata endpoints and non-HTTP schemes; same-domain scope by default;
strip scripts, forms and hidden text; store every extracted fact with a source URL and confidence;
human review before publish; and crawled text passed to the model as **data, never as
instructions**. This is the highest-risk feature in the blueprint and should not be rushed.

**14. What is the failover when Retell, carrier, n8n, CRM or email is unavailable?**
Partly designed, partly built. The voice worker's failure paths are tested: a failed transfer
still creates the lead and raises a callback, a mid-call database failure still records the call,
and the caller always hears something. The outbox means a CRM outage delays a sync rather than
losing it. **Missing:** a carrier-level fallback to voicemail or a human number, which §16.2
CALL-09 requires and which must be configured *before* the first real call, not after the first
outage.

**15. Phased estimate, staffing, risks, pilot date?**
Below.

---

## Estimate

The blueprint's own Phase 0–6 range is 11–20 weeks. Having reviewed the code I think that is
realistic **for a team**, and I would adjust it as follows.

| Phase | Blueprint | My estimate | Why it differs |
|---|---|---|---|
| 0 — Architecture lock | 1 wk | **Substantially done** | Schema, tenant model, event envelope, security and acceptance criteria exist. `0008` closed the envelope and outbox. |
| 1 — Multi-tenant core | 2–3 wk | **1–1.5 wk** | Auth, RBAC, RLS, leads, timeline, raw webhooks, audit and outbox are built. Remaining: locations in the UI, contacts identity resolution, and making the dashboard read `analytics_daily`. |
| 2 — Assistant Studio | 2–3 wk | **3–4 wk** | Nothing exists. Versioning, the simulator and safe prompt composition are all new, and §9.3's block model is more work than it looks. |
| 3 — Telephony | 2–4 wk | **3–5 wk** | Gated on a funded carrier account. The forwarding instruction library is underestimated — it is per-carrier content, not code. |
| 4 — Email + connectors | 2–3 wk | **2–3 wk** | Agreed. HubSpot is written; Microsoft and Google OAuth are the real work. |
| 5 — Analytics | 2–3 wk | **2–3 wk** | Agreed, provided §7.2's definitions are fixed first. Most analytics projects fail on ambiguous denominators, not on charts. |
| 6 — Hardening / pilot | 2–4 wk | **2–4 wk** | Agreed. |

**Realistic total: 13–20 weeks**, and the variance is dominated by provider access rather than by
code. Phases 3 and 4 cannot start without a funded Telnyx account and OAuth applications.

### Risks I would raise on the call

1. **Provider access is the schedule.** Nothing in Phases 3–4 can begin without accounts. This
   has already blocked HubSpot and Telnyx for weeks.
2. **The `35%` claim.** §2.7 is right. It should be removed from all material now, not at launch.
3. **Recording defaults.** §13.4 suggests off or 30 days. Get the legal answer before Phase 3, not
   during it — it changes the schema.
4. **Website import is the highest-risk feature**, not the flashiest. Indirect prompt injection
   with tool access is a genuine route to a customer's CRM.
5. **Scope.** The blueprint is a platform. The current commercial pages sell it as available now.
   Those two facts need reconciling before the first pilot.

---

## §17.3 — requested deliverables

| Deliverable | Status |
|---|---|
| Architecture diagram | **Outstanding** — will produce once n8n and voice-runtime decisions are made, so it documents reality |
| Revised schema and RLS matrix | **Delivered** — `supabase/migrations/0001`–`0008`, RLS coverage asserted in `tests/repo-audit.js` |
| Provider decision document | **Outstanding** — needs the §17.2 decisions first |
| Working proof: forward → call → lead → CRM → dashboard | **Blocked** — no carrier route and no CRM credentials |
| Backlog with P0/P1/P2 | **Delivered** — below |
| Security/compliance checklist | **Delivered** — `handover/SECURITY.md`, extended by `0008` consent events |
| Staging environment and test plan | **Partial** — 13 automated suites and CI exist; there is no staging project |
| Pilot go-live plan | **Outstanding** — Phase 6 |

---

## Backlog

### P0 — before any pilot customer

| # | Item | Blocked by |
|---|---|---|
| 1 | Apply migrations `0006`–`0008`; deploy `contact-submit`, `lead-notify`, `health` | Owner — CLI access |
| 2 | Verify the Resend sending domain | Owner — DNS |
| 3 | Prove tenant isolation with two live accounts (`tests/isolation-live.js`) | Owner — second account |
| 4 | Outbox consumer process — claim, execute, ack, dead-letter | Me, once `0008` is applied |
| 5 | Write to `audit_logs` (the table exists; nothing populates it) | Me |
| 6 | Contacts identity resolution wired into lead creation | Me |
| 7 | Carrier fallback to voicemail/human (§16.2 CALL-09) | Owner — carrier account |

### P1 — required for the product the blueprint describes

Assistant versioning and publish/rollback · Microsoft + Google OAuth · `analytics_daily` and the
§7.2 definitions · connector mappings UI · routing rules and the forwarding wizard ·
`usage_ledger` metering.

### P2 — after the first pilots prove the core

Website import with the full §13.2 safety pipeline · niche packs · AI QA scorecard · SIP/BYOC ·
scheduled reports · n8n, *if* the connector catalogue justifies it.

---

## What I would say on the call

The direction is right and I have not pushed back on any of the five non-negotiables. Two things
matter more than the feature list.

**First: nothing is deployed.** Three migrations and two functions are written, tested and
committed, and none of it is live. The live contact form still runs code that accepts
`notanemail` as an email address. That is a ten-minute fix and it gates everything.

**Second: the blueprint asks for a platform, and the current site sells one.** The honest sequence
is pilot-first — one real business, one real carrier route, one real CRM — and expand the
catalogue afterwards. §679 says this in the document's own words, and it is the part most likely
to be skipped under commercial pressure.
