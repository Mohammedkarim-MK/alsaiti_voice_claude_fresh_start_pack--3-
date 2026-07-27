# Testing

Handoff §19. What runs, what it proves, and which gates still need a live project.

## Running the suites

The harnesses are jsdom scripts that boot the real `docs/index.html` and drive it. They live in
the session scratchpad rather than the repo — they are development tooling, not shipped code.
Requires `npm i jsdom` in a scratch directory.

```bash
node formtest.js && node truthtest.js && node signuptest.js && node legaltest.js && node a11y_labels.js
```

| Suite | Checks | Covers |
|---|---|---|
| `formtest.js` | 39 | FORM-01..07 |
| `truthtest.js` | 25 | §2 truth labels, Appendix B, §13 |
| `signuptest.js` | 16 | §6.1, §6.2 |
| `legaltest.js` | 40 | §18, §20.1 |
| `a11y_labels.js` | 29 controls | A11Y-01 accessible names |
| `settingstest.js` | 61 | Settings, auth, password rules |
| `livetest.js` | 71 | Lead lifecycle, voice, CRM events |
| `sweep.js` | 21 | Every screen × theme × language |
| `newfeatures.js` | 35 | Export, edit, reset, notifications |
| `voicetest.js` | 22 | One-voice guarantee, hands-free calling |
| `audit_features` / `audit_data` / `audit_runtime` | behavioural | Clicks 214 controls across 8 screens |

**All green as of 27 July 2026.**

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
