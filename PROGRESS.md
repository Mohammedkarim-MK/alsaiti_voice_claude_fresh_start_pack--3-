# alsaitigrowth.com — progress

Working log for the 8-phase job. If a session runs out of context, read this and
`AUDIT.md` to pick up.

Baseline commit when this work started: `384f3ea`.

---

## Phase 1 — AUDIT — **DONE**

`AUDIT.md` written. Read-only; nothing else touched.

**Two CRITICALs, one root cause:**
1. Served HTML has zero visible content — `docs/index.html:1342` is an empty `#root`.
2. ES and AR have no URLs at all — `LANG` (`docs/index.html:1360`) is `localStorage` state.

**Already clean, do not redo:** security headers (all six, live and enforcing), no client
secrets, rate limiting on every public user-facing endpoint, AA contrast, zero web fonts,
1,071 strings complete in all three languages.

**Two things I flagged rather than assumed:**
- Phase 3 asks for report-only CSP. The CSP is already live and *enforcing*. Going
  report-only would be a downgrade. Awaiting a decision.
- `docs/index.html:2124` — the honeypot is deliberately unlabelled (`tabindex="-1"`,
  `aria-hidden="true"`). Adding a label would make screen-reader users fill it and be
  silently classed as bots. Leave it.

---

## Phase 2 — CRAWLABILITY PLAN — **AWAITING CHECKPOINT 2**

Two options costed below. Recommendation: **A**.

Feasibility of A was verified, not assumed — the existing `landing()` render function was
run under jsdom for each locale and produced real HTML:

| Locale | HTML | Visible text | Headings | `dir` |
|---|---|---|---|---|
| EN | 26,477 B | 3,870 chars | 10 | ltr |
| ES | 27,391 B | 4,787 chars | 10 | ltr |
| AR | 26,397 B | 3,843 chars | 10 | **rtl** |

That is the load-bearing assumption of Option A and it holds.

### Next action
Waiting on MK to pick A or B. Nothing will be written until then.

---

## Phases 3–8 — not started

| Phase | Status | Note |
|---|---|---|
| 3 — Security | not started | Mostly already done; see AUDIT §3–5. CSP question open. |
| 4 — Meta & social | **blocked on Phase 2** | hreflang needs per-locale URLs to exist first. |
| 5 — RTL & a11y | not started | Physical→logical CSS ~3–4 h; SVG `aria-hidden` 30 min. |
| 6 — New pages | not started | Checkpoint 3 before building. |
| 7 — Stripe | partly done already | Webhook + entitlements shipped earlier (`db73e21`). Checkout/Portal not built. |
| 8 — Analytics | not started | Plausible; adds one external script — conflicts with current CSP `default-src 'none'`. |

---

## Standing constraints

- Every user-facing string in EN, ES **and** AR. Currently 1,071 × 3, zero gaps — keep it that way.
- Brand `#123A2C`. Do not change; it is also the `theme-color` at `docs/index.html:6`.
- No secrets in client code.
- No new dependency without asking first.
- Every finding gets `file:line`.
- Stop at each checkpoint.
