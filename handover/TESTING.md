# Testing

Handoff §19. What runs, what it proves, and which gates still need a live project.

## Running the suites

They live in `tests/` and boot the real `docs/index.html` in jsdom, then drive it. Every suite is
a standalone script that exits non-zero on failure, so the runner just sequences them.

```bash
cd tests && npm install && npm run check
```

`npm run check` = secret scan, then every suite. `npm test` runs the suites alone; `npm run scan`
the scanner alone. To run one suite: `node run.js contact-form`.

| Suite | Checks | Covers |
|---|---|---|
| `contact-form.test.js` | 39 | FORM-01..07 |
| `truth-labels.test.js` | 25 | §2 truth labels, Appendix B, §13 |
| `legal-pages.test.js` | 40 | §18, §20.1 |
| `health.test.js` | 19 | §17.1, MON-01, correlation ids |
| `auth-i18n.test.js` | 18 | §14.2 auth translations |
| `signup.test.js` | 16 | §6.1, §6.2 |
| `settings.test.js` | 61 | Settings, auth, password rules |
| `lead-lifecycle.test.js` | 71 | Lead lifecycle, voice, CRM events |
| `features.test.js` | 35 | Export, edit, reset, notifications |
| `voice.test.js` | 22 | One-voice guarantee, hands-free calling |
| `screens-sweep.test.js` | 21 | Every screen × theme × language |
| `a11y-labels.test.js` | 29 controls | A11Y-01 accessible names |

**12/12 suites passing as of 27 July 2026.** Whole run is about four minutes.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

| Job | What it does |
|---|---|
| **Secret scan** | `tests/secret-scan.js` over the working tree, then a separate pass over every blob in git history |
| **Acceptance suites** | All 12, via `tests/run.js` |
| **Edge Functions type-check** | `deno check` on each `supabase/functions/*/index.ts` |

Two notes on it. The scanner matches credential *values*, not variable names — matching names
would flag `.env.example`, every doc and every legitimate `Deno.env.get('RESEND_API_KEY')`, and a
scanner that cries wolf gets switched off. And the history job is separate from the working-tree
job on purpose: a hit in history needs the history rewritten, not just a file edited.

**The Deno job has never actually run** — Deno is not installed on the machine this was written
on, so CI will be its first execution. If it fails on the first push, that is the reason.

The workflow deliberately does not touch deployment. Pages publishes from repository settings
(branch `main`, folder `/docs`); adding a Pages workflow would take that over and change how
deploys behave.

## Test accounts

| Account | Credentials | Notes |
|---|---|---|
| Demo | `demo@alsaiti.app` / `demo1234` | Public by design — it is in a static file. Browser-local only |
| Production | — | Owner-created via the Supabase dashboard; sign-ups are off |

## §19 acceptance matrix

| ID | Gate | State |
|---|---|---|
| SEC-01 | No server secret in client, repo or history | **PASS** — scan of both clients + 72 commits |
| SEC-02 | Legacy-key audit; disable without outage | **Audit PASS**, disabling is an owner action |
| SEC-03 | Workspace A cannot reach Workspace B | **NOT TESTED** — needs two live accounts |
| FORM-01 | Lead saved and email received | **Saving PASS**; email blocked on `lead-notify` |
| FORM-02 | No false success, values retained | **PASS** |
| AUTH-01 | Invited user signs in, sees only their workspace | **NOT TESTED** — owner-blocked |
| DEMO-01 | Demo cannot alter production or provider settings | **PARTIAL** — client-side yes; server-side untested |
| LEAD-01 | Create, assign, update, note, audit timeline | **PARTIAL** — works, but against `localStorage` |
| CRM-01..03 | HubSpot OAuth, sync, expiry | **BLOCKED** — no credentials |
| TEL-01..02 | Telnyx credentials, tampered webhook rejected | **BLOCKED** — no funded account |
| CALL-01..02 | Real inbound call, transfer fallback | **NOT BUILT** |
| EMAIL-01 | Verified sender domain, delivery recorded | **BLOCKED** |
| MOB-01 | Mobile flows, native theme consistent | **PASS** — 414px and 1280px, 3 languages, 2 themes |
| A11Y-01 | Keyboard, labels, status, contrast | **PASS** — see below |
| MON-01 | Forced error produces an actionable alert | **FAIL** — no monitoring exists |
| ROLL-01 | Previous release restorable | **PASS** — static single file, `git revert` + push |

## What the form tests actually prove

Not "no errors" — specific failure behaviour:

- Success is **not** shown before the server replies, and the form is **not** cleared until it is.
- A 502 leaves every typed value in place and re-enables the button.
- A rejected network promise behaves the same as a bad status.
- Three clicks produce **one** request; a retry reuses the idempotency key, but a genuinely new
  enquiry gets a fresh one — both directions are asserted, because only checking one would let a
  second enquiry be silently deduped away.
- A saved lead whose alert email failed still shows success (FORM-05).
- The honeypot value reaches the server so it can contain it there.

## Accessibility

`a11y_labels.js` walks 11 screens and asserts every control has an accessible name from a
`<label for>`, a wrapping label, `aria-label`, or `aria-labelledby`. **A placeholder does not
count** — it disappears the moment the user types.

This is how the original defect was found: all 44 labels in the app were bare `<label>` elements
with no association, so every field on every screen was announced as unlabelled.

## Evidence standard (§19)

Record: date, environment, commit, steps, expected vs actual, and a redacted screenshot, log
reference or row id. Test data must not contain real customer information.

## Gaps worth naming

- **No CI.** Every suite is run by hand. A regression can reach `main` unnoticed.
- **No live-project tests.** Everything above runs against jsdom with a scripted backend. RLS,
  tenant isolation and real OAuth are unproven by execution.
- **No real-device testing.** iPhone voice and the Expo app have never been run on hardware.
- **Spanish and Arabic are unreviewed** by a native speaker — and now include legal text.
