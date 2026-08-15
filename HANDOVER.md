# alsaitigrowth.com — what changed, what I skipped, and how to test it

All eight phases. Baseline `384f3ea` → head `4e4e668`.
Detail per phase is in `PROGRESS.md`; the original findings are in `AUDIT.md`.

---

## What changed

### The two things that mattered most

**The site served no content.** `docs/index.html:1342` was an empty `<div id="root">`. The 11,130
characters between `<body>` and `<script>` were all SVG gradient definitions — **zero visible text
for a crawler**. Google renders JS slowly and unreliably; WhatsApp, LinkedIn, Slack and iMessage
never do.

**Spanish and Arabic had no URLs.** `LANG` was `localStorage` state. You could not send someone a
Spanish link because one did not exist — two thirds of the product's positioning was invisible to
search.

Both fixed by `tools/prerender.js`, which runs the app's own render functions under jsdom and
writes the result into the served HTML. **21 pages now** (7 routes × 3 locales), all committed, so
Cloudflare Pages still needs no build command.

### Everything else

| Phase | What landed |
|---|---|
| 1 — Audit | `AUDIT.md`, eight headings, severity-tagged |
| 2 — Crawlability | Prerendering; `/`, `/es/`, `/ar/` with real content and `dir=rtl` before JS |
| 3 — Security | Scope was **empty** — no CRITICAL/HIGH existed. Added a `health` rate limit (60/min/IP) |
| 4 — Meta | canonical, og:*, twitter:card, hreflang + x-default, og:image, sitemap.xml, robots.txt |
| 5 — RTL & a11y | 26 rules → logical properties, 19 overrides deleted; directional icons mirror; icons `aria-hidden`; focus rings |
| 6 — Pages | `/pricing`, `/faq`, `/data-processing`, booking, hear-it-live |
| 7 — Stripe | `stripe-billing` (Checkout + Portal), `0020` service helpers |
| 8 — Analytics | Plausible, cookieless, 5 events including language |

**Tests:** 18 suites, ~1,100 assertions. `tests/prerender.test.js` alone carries 203.

---

## What I skipped, and why

**Real prices.** Every tier shows an em dash and a note saying the price is not published.
A plausible-looking placeholder is the worst option: it reads as real, gets screenshotted into a
proposal, and nobody finds out until a customer quotes it back.

**Four sections of `/data-processing`** — transfers, sub-processor notice, breach notification,
audit rights. These are contractual commitments with legal consequence, not developer decisions.
They render as an amber "being confirmed" block. **An invented breach-notification window is a
promise a customer can hold you to.**

**Any certification claim.** No ISO 27001, no SOC 2, no "GDPR compliant" badge — none confirmed.
The page claims only what the tests prove.

**Cal.com and the demo phone.** Both fail closed. Without `CAL_LINK` the booking section offers
email; without `DEMO_PHONE` the hear-it-live section **does not render at all** — a "call us live"
box that rings out tells a visitor the product does not work.

**Native language names on the og:image.** `PIL.features.check('raqm')` is `False`, so Pillow
renders Arabic as isolated letters in logical order — unreadable, on the image advertising Arabic
support. Needs `arabic-reshaper` + `python-bidi`; **not added, because new dependencies get asked
about first.**

**CSP report-only.** The brief asked for it; your CSP was already live and *enforcing*. Going
report-only is a downgrade. Widened by exactly two host-scoped entries for Plausible instead.

**The `scale` vs `Business` naming conflict.** The database seeds the third tier as `scale`; the
pages say `Business`. Unresolved — billing and support should not use two words for one thing.

---

## Fill these in

| Where | What |
|---|---|
| `docs/index.html` → `var COMPANY=` | company number, registered office, ICO number |
| `docs/index.html` → `var CAL_LINK` | your Cal.com link |
| `docs/index.html` → `var DEMO_PHONE`, `DEMO_HOURS` | the number people can ring |
| `tools/prerender.js` → `PRICING_TR` | prices, once set in Stripe |
| `docs/og-image.png` | replace with real artwork, keep 1200×630 |
| Plausible dashboard | register `alsaitigrowth.com` or events are dropped |

Secrets — **run these yourself, never paste a key into chat:**

```bash
supabase secrets set RESEND_API_KEY=re_xxx STRIPE_SECRET_KEY=sk_test_xxx STRIPE_WEBHOOK_SECRET=whsec_xxx
```

Plus one `STRIPE_PRICE_<PLAN>_<PERIOD>` per price, e.g. `STRIPE_PRICE_GROWTH_ANNUAL`.

> **After ANY edit to `docs/index.html`, run `node tools/prerender.js`.** Three suites and a CI
> step fail if you forget.

---

## Manual test checklist — all three languages

Run each row in **EN, ES and AR**. Arabic is the one that finds bugs.

### A. The pages exist and are in the right language
| # | Step | Expect |
|---|---|---|
| A1 | Open `/`, `/es/`, `/ar/` | Content in that language, no flash of English |
| A2 | On `/ar/` — page direction | Right-to-left, **no horizontal scrollbar** |
| A3 | Open all 7 routes per locale (`/`, `/pricing/`, `/faq/`, `/privacy/`, `/terms/`, `/legal/`, `/data-processing/`) | Each loads its own page, not the home page |
| A4 | View source on `/ar/pricing/`, search for Arabic text | Present **before** any `<script>` |
| A5 | Disable JavaScript, reload `/ar/faq/` | All 7 questions and answers still readable |

### B. Language switching
| # | Step | Expect |
|---|---|---|
| B1 | Switch EN → AR on the home page | URL becomes `/ar/`, content flips, no reload |
| B2 | Copy that URL, open in a private window | Opens in Arabic |
| B3 | Switch language while on `/pricing/` | Stays on pricing, in the new language |

### C. RTL specifics — Arabic only
| # | Step | Expect |
|---|---|---|
| C1 | Nav links spacing | Gap on the **right** of the links |
| C2 | Pricing feature bullets | Markers on the **right** of the text |
| C3 | Any arrow or chevron icon | Points **left** (mirrored) |
| C4 | A code block or phone number | Still reads **left-to-right** |

### D. Forms and accessibility
| # | Step | Expect |
|---|---|---|
| D1 | Submit the contact form | "Enquiry received", reference `AG-XXXXXXXX` |
| D2 | Tab through the home page | Every stop has a **visible** ring |
| D3 | Tab into the contact form | Border colour **and** a ring |
| D4 | Screen reader over the icons | Icons silent; labels read normally |

### E. Sharing and search
| # | Step | Expect |
|---|---|---|
| E1 | Paste `/ar/` into WhatsApp | Arabic title and description, image card |
| E2 | Paste `/es/pricing/` into LinkedIn | Spanish title, not English |
| E3 | `curl -sI https://alsaitigrowth.com/` | Six security headers present |
| E4 | Open `/sitemap.xml` | **21** `<loc>` entries |

### F. Once you add your keys
| # | Step | Expect |
|---|---|---|
| F1 | After `RESEND_API_KEY` — submit the form | Alert email arrives; `/health` says `ok` |
| F2 | After Stripe keys — click a plan | Stripe Checkout opens, correct price and VAT |
| F3 | Pay with `4242 4242 4242 4242` | Access unlocks **from the webhook**, not the redirect |
| F4 | Open the success URL directly without paying | **Nothing unlocks** |
| F5 | After Plausible — switch language | "Language switch" event appears |

### G. Regression, before every deploy
```bash
node tools/prerender.js && node tests/run.js && node tests/repo-audit.js
```
Expect **18/18** and **HIGH: 0 / MED: 0 / LOW: 0**.

Live tests need three throwaway Supabase accounts — see the header of
`tests/team-usage-live.js`.
