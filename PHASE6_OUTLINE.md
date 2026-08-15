# Phase 6 — page structure and copy outline

**Checkpoint 3. Nothing built yet.** Approve, amend, or reject before I write code.

---

## The structural decision that comes first

Three of the five requested pages **already exist** — but as hash routes, which have no URL of
their own and cannot be indexed, shared or given a canonical:

| Page | Today | Sections | Locales |
|---|---|---|---|
| `/privacy` | `#/privacy` | 9 | EN / ES / AR |
| `/terms` | `#/terms` | 10 | EN / ES / AR |
| `/legal` (company info) | `#/legal` | 8 | EN / ES / AR |

Phase 2 gave the **landing page** real per-locale URLs. These did not get the same treatment.
So `/privacy` returns the landing page's HTML with a hash the crawler ignores — the privacy
policy is, to Google, not a page.

**Proposal: promote every page to a real prerendered path.** `tools/prerender.js` was written
to take a route list for exactly this. The result is 6 routes × 3 locales = **18 HTML files**,
all generated, all committed, still no build step on the host.

```
/                /es/                /ar/
/pricing/        /es/pricing/        /ar/pricing/
/faq/            /es/faq/            /ar/faq/
/privacy/        /es/privacy/        /ar/privacy/
/terms/          /es/terms/          /ar/terms/
/data-processing/  /es/data-processing/  /ar/data-processing/
```

Hash routes keep working (the app still uses them internally), so nothing breaks; the real
paths are added alongside for crawlers and for linking. **This is the main thing to approve.**

---

## 1. `/pricing`

Three tiers, monthly/annual toggle, annual **−20%**. Numbers stay clearly marked placeholders.

**Structure**
- H1 + one-line subhead
- Billing toggle: Monthly | Annual (−20%) — annual selected by default
- Three cards: **Starter · Growth · Business**, Growth marked "Most popular"
- Each: price, "per month, billed annually" qualifier, 5–6 feature lines, CTA
- Below: a plain-language row of what every plan includes
- FAQ teaser linking `/faq`

**Copy outline (EN — ES/AR written at build time, never machine-defaulted)**
- H1: "Pricing that scales with the calls you answer"
- Sub: "Every plan includes the trilingual receptionist, the lead dashboard and unlimited team seats on Business. Voice minutes are metered — you always see what you have used."
- Starter: "For a single location testing AI reception."
- Growth: "For a busy practice that misses calls at peak times."
- Business: "For multi-site operators who need routing and reporting."
- Under every card: "Prices exclude VAT. Cancel any time; no minimum term beyond your first four months."

**Placeholders, marked as such in the UI:** `£___` per tier per period, and each tier's voice-minute allowance.

> Two things I will NOT invent: the prices, and the minute allowances. The line about a
> four-month minimum is copied from your existing Terms — if that is no longer accurate, it needs
> changing in both places.

**Wiring:** the tier cards read limits from `public.plans` (already seeded: demo/starter/growth/scale).
Note the DB calls the third tier **`scale`**, the brief calls it **Business** — one of the two
should change so support and billing use the same word. I would rename the DB row.

---

## 2. `/faq`

Accordion. `<details>`/`<summary>` rather than JS — it works before the script runs, which
matters now that the page is prerendered, and it is keyboard-accessible for free.

**The five you asked for, plus two I would add:**

| # | Question | Note |
|---|---|---|
| 1 | What happens to call recordings? | **Needs your answer** — see below |
| 2 | Where is my data stored? | Supabase EU region; must match `/data-processing` exactly |
| 3 | Which languages are supported? | English, Spanish, Arabic — safe, factual |
| 4 | How long does setup take? | **Needs your answer** |
| 5 | Can I cancel? | From Terms: four-month minimum, then any time |
| 6 | *What happens if the AI cannot answer?* | Buyers ask this before they ask about price |
| 7 | *Do callers know they are talking to AI?* | You already record AI-disclosure consent in `consent_events` — worth saying so |

---

## 3. `/privacy`, `/terms`, `/data-processing`

`/privacy` and `/terms` exist and are honest. Work here is **promoting them to real URLs**,
plus adding the ICO number once you have entered it in `COMPANY` (`docs/index.html`).

### `/data-processing` — the one that closes deals

Structure follows what a buyer's DPO actually checks, in that order:

1. **Who processes what** — you are the processor, the client is the controller
2. **Where the data lives** — region, per data type: call audio, transcripts, lead records, backups
3. **Sub-processors** — a table: Supabase, the email provider, the telephony provider, the TTS/LLM provider. Name, purpose, region.
4. **Retention** — per data type, with the actual numbers from `retention_sweep()`
5. **Transfers outside the UK/EU** — if any, the mechanism
6. **Security measures** — RLS, encryption at rest and in transit, access control, audit logging
7. **Sub-processor changes** — notice period
8. **Deletion and return on termination**
9. **Breach notification** — timescale
10. **Audit rights**

> **I will not write sections 5, 7, 9 or 10 as commitments.** Those are contractual promises
> with legal consequence, and I have no basis to choose a breach-notification window or an audit
> right on your behalf. I will draft them as clearly-marked `[TO BE CONFIRMED]` blocks with the
> normal market position noted, for a solicitor to settle.
>
> **I will not claim any certification you do not hold** — no ISO 27001, no SOC 2, no "GDPR
> compliant" as a badge. What I can state is what the code demonstrably does: tenant isolation
> enforced by the database (proven, 15/15), encryption in transit, audit logging, and automated
> retention.
>
> **Sections 2, 3 and 4 need facts only you have** — which regions your Supabase project and
> providers actually run in. I can read the Supabase region; the others I cannot.

---

## 4. Booking — Cal.com embed

- Section on `/` and `/pricing`, plus a standalone anchor
- Loads **on click**, not on page load: the embed is ~100 KB of third-party JS and the site
  currently ships zero external requests
- Fallback if the embed fails: the existing email and WhatsApp links, already on the page

**Needs from you:** your Cal.com link.

**CSP:** the embed needs `script-src https://app.cal.com`, `frame-src https://app.cal.com`,
`connect-src https://api.cal.com`. Current policy is `default-src 'none'`, so this is an
explicit, minimal widening — **I will bring you the exact directive diff before applying it**,
not loosen the policy generally.

---

## 5. "Hear it live" — a number people can ring

- Prominent number, `tel:` link, click tracked (Phase 8)
- One line on what happens when they call and that it is a real AI answering
- Availability, so nobody rings a dead line at 2am
- The existing browser voice demo stays as the no-phone-call option

**Needs from you:** the number, and whether it is answered 24/7 or during set hours.

> This section must not go live before the number does. A "hear it live" box that rings out is
> worse than not having one.

---

## What I need from you

| # | Item | Blocks |
|---|---|---|
| 1 | **Approve the 18-file route structure** | everything |
| 2 | Prices + voice-minute allowances (or "keep placeholders") | `/pricing` |
| 3 | `scale` vs `Business` — which name wins? | `/pricing`, DB |
| 4 | Call recording: kept? for how long? opt-out? | `/faq`, `/data-processing` |
| 5 | Typical setup time | `/faq` |
| 6 | Supabase + provider regions | `/data-processing` |
| 7 | Cal.com link | booking |
| 8 | Demo phone number + hours | "hear it live" |

Items 2–8 can all ship as marked placeholders if you would rather I build the structure first —
say which you want filled and which held.

---

## Estimate

| | |
|---|---|
| Prerender route support + promoting the 3 existing pages | 3–4 h |
| `/pricing` + `/faq`, all three locales | 4–5 h |
| `/data-processing` draft with `[TO BE CONFIRMED]` blocks | 3 h |
| Cal.com + phone sections | 2 h |
| **Total** | **~1.5–2 days** |

All copy written in EN, ES and AR together. No English-only strings ship, including placeholders.
