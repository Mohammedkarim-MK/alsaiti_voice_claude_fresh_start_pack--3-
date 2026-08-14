# alsaitigrowth.com — Audit

Read-only pass. Nothing was edited, created or deleted except this file.
Commit audited: `384f3ea`. Live site checked at the same time.

---

## Stack identification

| | |
|---|---|
| **Framework** | None. Hand-written vanilla JS, no React/Vue/Svelte, no JSX. |
| **Build tool** | None. No bundler, no transpiler, no build step of any kind. |
| **Package manager** | None for the site. `npm` is used only for `tests/` (jsdom). |
| **Hosting** | Cloudflare Pages, serving `/docs`, auto-deploying on push to `main`. |
| **Rendering** | **100% client-only.** One inline `<script>` builds every screen at runtime. |
| **Routing** | Hash-based — `#/privacy`, `#/legal`, `#/dashboard`. `renderView()` at `docs/index.html:2028`. |
| **Locales** | Runtime switch. `LANG` (`docs/index.html:1360`), nine string tables, `applyDir()` at `:1596`. **No per-locale URLs exist.** |

The whole product — marketing site, dashboard, voice demo, CRM screens — is one
529 KB file at `docs/index.html`. That single fact drives most of what follows.

---

## 1. CRAWLABILITY

### CRITICAL — the served HTML has no content at all
`docs/index.html:1342` — `<div id="root"></div>` is the only content container and it
ships empty. Everything is written by the script at `docs/index.html:1346-5223`.

Measured, not assumed: the markup between `<body>` (`:1339`) and `<script>` (`:1346`) is
11,130 characters, and **every one of them is `<svg><defs>` gradient definitions**
(`docs/index.html:1340`). Visible text for a crawler: **zero characters.**

Consequences today:
- Google must render JS to see anything. It usually will, eventually, but indexing is
  slower and less reliable than served HTML.
- **WhatsApp, LinkedIn, Slack and iMessage do not run JS at all.** They read `<head>`
  only. Link previews work solely because `og:title`/`og:description` are static in the
  head — and they will show no image (section 2).
- **Effort: see Phase 2.** This is the phase-2 decision, not a quick fix.

### CRITICAL — no per-locale URLs, so hreflang has nothing to point at
`docs/index.html:1360` — `LANG` is runtime state held in `localStorage`. Spanish and
Arabic have **no URL of their own**. There is no `/es/`, no `?lang=ar`, no path segment.

A Spanish speaker cannot be sent a Spanish link, and Google cannot index a Spanish page,
because neither exists as an addressable resource. For a product whose entire
differentiator is trilingual, this is the single most damaging finding in the audit —
two thirds of the positioning is invisible to search.

**Effort: 1–2 days**, and it is a prerequisite for hreflang in Phase 4.

### LOW — no `<noscript>`
Nothing in `docs/index.html` between `:1339` and `:5224`. A JS-disabled visitor gets a
blank page with no explanation. **Effort: 15 min.**

---

## 2. META

**Present:**

| Tag | Line |
|---|---|
| `<title>` | `docs/index.html:17` |
| `meta description` | `:13` |
| `og:title` | `:14` |
| `og:description` | `:15` |
| `theme-color` `#123A2C` | `:6` |
| favicon (inline SVG data URI) | `:16` |

**Missing — every one of these:**

| Missing | Severity | Effort |
|---|---|---|
| `og:image` (+ the 1200×630 file) | **HIGH** — every shared link previews with no image | 1 h |
| `og:url` | HIGH | 5 min |
| `og:type` | MEDIUM | 5 min |
| `og:locale` / `og:locale:alternate` | HIGH — trilingual is the pitch | 15 min |
| `twitter:card` (`summary_large_image`) | HIGH | 10 min |
| `canonical` | MEDIUM | 10 min |
| `hreflang` ×3 | **HIGH** — blocked on per-locale URLs (§1) | 30 min after §1 |
| `sitemap.xml` | MEDIUM — live check: **HTTP 404** | 30 min |

### MEDIUM — `robots.txt` is Cloudflare's, not ours
`https://alsaitigrowth.com/robots.txt` returns **HTTP 200**, but no such file exists in
`docs/`. Cloudflare is serving its default content-signals file, and returning it as
`Content-Type: text/html` rather than `text/plain`. It contains no `Sitemap:` line.
**Effort: 15 min.**

### HIGH — og:description is English-only
`docs/index.html:15` is a single static string. All three locales share it, so a shared
Arabic or Spanish link previews in English. **Effort: 30 min**, depends on §1.

---

## 3. SECRETS — clean

Nothing to fix. Recorded so it is not re-litigated:

- `.gitignore:18-20` covers `.env`, `.env.local`, `.env*.local`; `:47` covers
  `supabase/functions/.env`.
- Only `.env.example` files are tracked (4 of them, all values empty).
- **No secret ships to the browser.** Two matches look alarming and are not:
  - `docs/index.html:4359` — `ph:'sk_live_…'`
  - `docs/index.html:4329` — `ph:'pat-eu1-xxxxxxxx-…'`

  Both are `placeholder` attribute hints showing a user the shape of *their own* key.
- The Supabase **anon** JWT is committed on purpose — it ships in every browser and is
  not a secret. `tests/secret-scan.js` decodes the `role` claim to tell it apart from a
  `service_role` key rather than flagging both.
- Real secrets (`RESEND_API_KEY`, `STRIPE_WEBHOOK_SECRET`, service-role key, consumer
  secret) live in Supabase, set via `supabase secrets set`. None is on disk.

---

## 4. SECURITY HEADERS — all six present

Config: `docs/_headers` (Cloudflare Pages reads it automatically). Verified live:

| Header | Status |
|---|---|
| Content-Security-Policy | set (header **and** `<meta>` at `docs/index.html:7`) |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `no-referrer` |
| Permissions-Policy | `camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()` |

Also present: `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`.

### MEDIUM — CSP requires `'unsafe-inline'` for scripts
`docs/_headers` — unavoidable while the app is one inline script. It is the direct cost
of the no-build-step architecture, and it disappears if Phase 2 introduces a build.
**Effort: 0 now; free as a side effect of Phase 2 option A.**

> Phase 3 asks for report-only CSP. **These headers are already live and enforcing.**
> Switching a working enforced CSP to report-only would be a downgrade — I will confirm
> before touching it.

---

## 5. INPUT HANDLING

### Server-side validation — present
`supabase/functions/contact-submit/index.ts` validates email format, requires a name,
enforces an idempotency key, and hashes the IP only when a salt is configured.

### XSS surface — mitigated but wide
30 `innerHTML` assignments in `docs/index.html`. All values pass through `esc()`
(`docs/index.html:1942`), and `jsq()` (`:1943-1945`) handles the attribute-inside-JS-string
case. **MEDIUM** — correct today, but 30 hand-audited sites is a standing risk: one
future `innerHTML` that forgets `esc()` is an XSS. **Effort: n/a — architectural.**

### Rate limiting — on every public, user-triggerable endpoint
`supabase/functions/_shared/ratelimit.ts`, via `enforceLimit(ipBucket(...))`:

| Endpoint | Public | Rate limited |
|---|---|---|
| `contact-submit` | yes | yes |
| `tts` | yes | yes — 40/min/IP (`tts/index.ts:12`) |
| `crm-callback` | yes | yes |
| `telnyx-webhook` | yes | yes |
| `events-consume` | yes | no — gated by `EVENTS_CONSUMER_SECRET`, fails closed |
| `stripe-webhook` | yes | no — gated by signature + 5-min replay window |
| `health` | yes | **no** |

### LOW — `health` has no rate limit
It is a public GET-equivalent returning a small JSON body, so the exposure is a cheap
DoS amplifier rather than a data risk. **Effort: 20 min.**

> Note: only 5 functions are deployed to this project (`contact-submit`, `health`,
> `events-consume`, `stripe-webhook`, `lead-notify`). `tts`, `telnyx-*` and `crm-*`
> return 404 — they exist in the repo but are not live, consistent with those features
> being labelled Demo.

---

## 6. RTL

### Works, but by patching rather than by design
`docs/index.html:1596` — `applyDir()` sets `document.documentElement.dir = 'rtl'` for
Arabic and `lang` alongside it. That part is correct.

### MEDIUM — physical CSS properties patched with `[dir="rtl"]` overrides
Counted in `docs/index.html`:

| Property | Occurrences |
|---|---|
| `margin-left` | 12 |
| `margin-right` | 5 |
| `padding-left` | 2 |
| `padding-right` | 1 |
| `text-align:left` | 16 |
| `left:` | 35 |
| `right:` | 18 |

Each is corrected by a matching `html[dir="rtl"]` rule — e.g. `:222`, `:241`, `:242`,
`:243`. It renders correctly *today*, but every new physical property needs someone to
remember a paired override, and the one that gets forgotten breaks Arabic silently, in a
layout most reviewers cannot read. Logical properties (`margin-inline-start`,
`text-align: start`, `inset-inline-start`) need no override and cannot be forgotten.

**Effort: 3–4 h**, mechanical and low-risk.

### LOW — directional icon mirroring not verified
`docs/index.html:1974` onward defines inline SVG icons. Arrows/chevrons need
`transform: scaleX(-1)` under RTL. Not yet confirmed either way — flagged for Phase 5
rather than asserted. **Effort: 1 h to check and fix.**

---

## 7. ACCESSIBILITY

Measured by rendering `landing()` in jsdom and inspecting the DOM.

| Check | Result |
|---|---|
| `<img>` without `alt` | **0 of 0** — the site uses inline SVG exclusively |
| Unlabelled form fields | **0 real** (see below) |
| `<h1>` count | 1 — correct |
| Contrast vs `#123A2C` | **all pass AA** (white 12.60:1, ivory 10.61:1, green 7.51:1, muted 4.72:1) |

### MEDIUM — 38 of 42 inline SVGs lack `aria-hidden="true"`
Decorative icons are announced as unlabelled graphics by screen readers, adding noise to
every screen. **Effort: 30 min** — one attribute in the `icon()` helper at
`docs/index.html:1974`.

### LOW — one heading level jump
`h2` → `h4` on the landing page, skipping `h3`. **Effort: 10 min.**

### Not a defect — the honeypot
`docs/index.html:2124` — `company_website` has no label, which is correct: it carries
`tabindex="-1"` and `aria-hidden="true"`, so it is unreachable by keyboard and invisible
to screen readers. Worth recording, because "add a label to every input" would make a
screen-reader user fill it and be silently classified as a bot.

### Not verified
Visible focus states were not measured — jsdom does not compute `:focus-visible`. Needs a
real browser in Phase 5.

---

## 8. PERFORMANCE

| Metric | Value |
|---|---|
| `docs/index.html` | 529 KB uncompressed |
| Transferred (gzip) | **158 KB** |
| External requests | **0** |
| `@font-face` rules | **0** — system font stack, so `font-display` is not applicable |
| Raster images | 0 — all inline SVG |
| Render-blocking external assets | none |

### MEDIUM — the whole product ships to every marketing visitor
A visitor reading the homepage downloads the dashboard, the CRM screens, the voice demo,
the integrations wizard and all 1,071 translated strings. 158 KB gzipped is not alarming
in isolation, but it is ~10× what the marketing page alone needs, and it is parsed and
executed before anything paints.

**Effort: only worth doing as part of Phase 2**, which has to touch the build anyway.

### LOW — no `og:image` file to optimise
Covered in §2.

---

## Trilingual coverage — verified complete

Not one of the eight required headings, but it is the hardest rule in the brief, so it
was measured. Every string table parsed via jsdom:

| Table | EN keys | ES | AR |
|---|---|---|---|
| `TR` | 706 | complete | complete |
| `CRM_TR` | 120 | complete | complete |
| `SET_TR` | 69 | complete | complete |
| `OB_TR` | 59 | complete | complete |
| `EXTRA_TR` | 58 | complete | complete |
| `LIVE_TR` | 51 | complete | complete |
| `LEGAL` | 2 | complete | complete |
| `LEGAL_NOTICE` | 2 | complete | complete |
| `VOICE_TR` | 4 | complete | complete |
| **Total** | **1,071** | **0 missing** | **0 missing** |

The rule holds today. What does *not* hold is that none of those 1,071 Spanish and Arabic
strings is reachable by URL, indexable, or linkable — see §1.

---

## Summary by severity

| | Finding | Section |
|---|---|---|
| **CRITICAL** | Served HTML contains zero visible content | §1 |
| **CRITICAL** | No per-locale URLs — ES and AR are unindexable and unlinkable | §1 |
| **HIGH** | No `og:image`; every shared link previews imageless | §2 |
| **HIGH** | No `og:url`, `og:locale`, `twitter:card`, `hreflang` | §2 |
| **HIGH** | `og:description` is English-only for all three locales | §2 |
| **MEDIUM** | `robots.txt` is Cloudflare's default, wrong content-type, no sitemap | §2 |
| **MEDIUM** | CSP needs `'unsafe-inline'` (architectural) | §4 |
| **MEDIUM** | 30 `innerHTML` sites rely on hand-applied `esc()` | §5 |
| **MEDIUM** | Physical CSS properties patched by `[dir=rtl]` overrides | §6 |
| **MEDIUM** | 38 of 42 SVGs not `aria-hidden` | §7 |
| **MEDIUM** | Whole product ships to marketing visitors | §8 |
| **LOW** | No `<noscript>` | §1 |
| **LOW** | `sitemap.xml` 404 | §2 |
| **LOW** | `health` unrated | §5 |
| **LOW** | Directional icon mirroring unverified | §6 |
| **LOW** | One `h2`→`h4` jump | §7 |

**Clean, no action needed:** secrets (§3), security headers (§4), server-side validation
and rate limiting on user-facing endpoints (§5), contrast and alt text (§7), fonts and
external requests (§8), trilingual string coverage.

The two CRITICALs share one root cause — a client-only single file with no URLs — and one
fix. That is Phase 2.
