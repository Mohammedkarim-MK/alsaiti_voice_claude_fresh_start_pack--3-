---

# FILE: 00_START_HERE.md

# Alsaiti Voice — Fresh Start Pack for Claude Code

This is a completely fresh build of **Alsaiti Voice** using Claude Code.

Create a brand-new empty folder named `alsaiti-voice`. Do not reuse, import, or migrate any previous version of the app.

## Product

Alsaiti Voice is an AI voice and chat lead-generation SaaS under **Alsaiti Growth**. It captures enquiries from phone calls, website chat, and forms; qualifies them; creates leads; alerts the business; and helps staff convert those leads into bookings or customers.

## Build order

1. Clean project foundation
2. Supabase authentication and database
3. Dashboard and lead management
4. Real lead capture and notifications
5. Embeddable website chat widget
6. Stripe billing
7. Phone and AI voice assistant
8. Deployment and monitoring
9. Native mobile app later

## How to use this pack

1. Copy all files into the empty `alsaiti-voice` folder.
2. Open that folder in Claude Code.
3. Paste `04_FIRST_PROMPT_FOR_CLAUDE_CODE.md`.
4. Continue with each numbered phase prompt.
5. Commit after every completed, tested phase.

Do not commit `.env.local`. Previously exposed Stripe or Resend keys must be revoked before production.


---

# FILE: 01_MASTER_PRODUCT_SPEC.md

# Alsaiti Voice — Master Product Specification

## Promise

**Never lose another enquiry.**

## Core workflow

```text
Customer calls, chats, or submits a form
↓
The system collects their details
↓
The enquiry is qualified and scored
↓
A lead is created
↓
The business is notified
↓
The lead appears in the dashboard
↓
The team follows up
↓
The lead becomes booked, won, lost, or spam
```

## Initial target businesses

- Dental clinics
- Aesthetic clinics
- Plumbers and home services
- Real estate agents
- Letting agents
- Consultants

## Lead statuses

- New
- Contacted
- Qualified
- Booked
- Won
- Lost
- Spam

## Lead sources

- Voice call
- Website chat
- Contact form
- Manual import
- API
- CRM

## Main routes

- `/`
- `/login`
- `/signup`
- `/forgot-password`
- `/onboarding`
- `/dashboard`
- `/leads`
- `/leads/[id]`
- `/conversations`
- `/chat-widget`
- `/voice-assistant`
- `/phone-numbers`
- `/integrations`
- `/analytics`
- `/settings`
- `/billing`

## Dashboard questions

The dashboard must answer:

- How many leads arrived?
- Which are new or urgent?
- Who needs a callback?
- Which source performs best?
- How quickly are leads contacted?
- How many become qualified, booked, or won?
- Are email, webhook, chat, and voice systems healthy?

## Lead profile

Each lead should support contact details, service, urgency, source, status, score, score reasons, summary, transcript/messages, preferred callback time, consent, internal notes, assignee, activity timeline, notification status, integration status, and timestamps.

## Voice assistant outcome

The future voice assistant must answer inbound calls, identify the business, ask qualification questions, detect urgency conservatively, transfer to a human, offer callback fallback, create exactly one lead, store a transcript/summary, and alert the business.


---

# FILE: 02_FINAL_STACK_AND_PRICING.md

# Final Stack and Pricing

## Technology

### Web app

- Next.js
- TypeScript
- App Router
- Tailwind CSS
- shadcn/ui
- Framer Motion
- React Hook Form
- Zod

### Backend

- Supabase Auth
- Supabase PostgreSQL
- Row Level Security

### Services

- Resend for email
- Stripe for subscriptions
- Signed webhooks first, n8n and native CRMs later

### Phone and voice later

- Telnyx or another SIP provider
- LiveKit Agents
- Provider adapters for speech-to-text, LLM, and text-to-speech

The real-time audio loop must run in a separate long-running worker, not inside a short-lived Next.js request.

## Pricing

No setup fee.

### Starter

- £149/month
- £1,490/year

### Growth

- £299/month
- £2,990/year

### Pro

- £499/month
- £4,990/year

Do not promise unlimited voice usage. The entitlement system must support included limits, warnings, hard limits or overages, and usage visibility.


---

# FILE: 03_KEYS_AND_ENVIRONMENT.md

# Keys and Environment

Claude Code must never ask you to paste production secrets into normal chat. Add keys directly to `.env.local`.

## Phase 1 — Supabase

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server only

## Phase 2 — Resend

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_REPLY_TO_EMAIL`

## Billing — Stripe test mode

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- Six Stripe Price IDs

## Voice later

- Telnyx credentials
- LiveKit credentials
- Selected LLM/STT/TTS provider credentials

Previously shared Stripe or Resend keys must be considered exposed and revoked.


---

# FILE: 04_FIRST_PROMPT_FOR_CLAUDE_CODE.md

# First Prompt for Claude Code

You are building a completely new SaaS application called **Alsaiti Voice**.

This is a fresh build from zero. Do not search for, import, or reuse any previous Alsaiti Voice project.

## Read first

Read these files before creating application code:

- `CLAUDE.md`
- `00_START_HERE.md`
- `01_MASTER_PRODUCT_SPEC.md`
- `02_FINAL_STACK_AND_PRICING.md`
- `03_KEYS_AND_ENVIRONMENT.md`
- `.env.example`

## Product

Alsaiti Voice is an AI voice and chat lead-generation platform for service businesses. It captures enquiries from calls, website chat, and forms; qualifies them; creates leads; alerts the business; and gives the business a dashboard to manage and convert those leads.

## First-session task: foundation only

Create a clean Next.js project in the current empty folder.

Use:

- Next.js
- TypeScript
- App Router
- Tailwind CSS
- shadcn/ui
- Framer Motion
- React Hook Form
- Zod
- Supabase packages
- Resend package
- Stripe package

Create a clear structure for:

- `app`
- `components`
- `lib`
- `services`
- `types`
- `supabase`
- `public`
- `docs`
- `tests`

## Security

- Never put real secrets in tracked files
- Keep `.env.local` ignored
- Keep `.env.example` empty
- Never expose server-only keys in client code
- Never print secret values
- Do not ask me to paste production secrets into chat
- When a key is needed, tell me the variable name and where to obtain it, then ask me to add it directly to `.env.local`

## Documentation

Create:

- `README.md`
- `docs/PRODUCT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/DECISIONS.md`
- `docs/NEXT_ACTIONS.md`

Do not overwrite `CLAUDE.md`.

## Brand design

Use:

- Background: `#020B1F`
- Secondary: `#071735`
- Primary blue: `#3AA6FF`
- Cyan: `#59C7FF`
- Glow blue: `#1E90FF`
- Main text: `#F5F9FF`
- Muted text: `#93A8C7`
- Glass card: `rgba(11, 27, 58, 0.65)`
- Border: `rgba(83, 167, 255, 0.18)`

The app must look premium, dark, accessible, responsive, and not like a generic starter template.

## Route placeholders

Create compile-safe placeholders for:

- `/`
- `/login`
- `/signup`
- `/forgot-password`
- `/onboarding`
- `/dashboard`
- `/leads`
- `/leads/[id]`
- `/conversations`
- `/chat-widget`
- `/voice-assistant`
- `/phone-numbers`
- `/integrations`
- `/analytics`
- `/settings`
- `/billing`

Create a responsive authenticated app shell with sidebar, mobile navigation, topbar, page header, content container, loading states, error boundary, and not-found page.

Do not build real authentication, database, billing, email, chat, or voice features yet.

## Completion criteria

This session is complete only when:

- The project structure is clean
- Dependencies are installed
- The design system and app shell exist
- All route placeholders compile
- `.env.local` is ignored
- `.env.example` is present
- Documentation exists
- Type-check passes
- Lint passes
- A test runner is configured
- Production build passes
- Git is initialised
- A clean initial commit is created

At the end, report files created, packages installed, commands run, checks passed, keys required for Phase 1, and the exact next prompt to paste.


---

# FILE: 05_PHASE_1_SAAS_FOUNDATION_PROMPT.md

# Phase 1 Prompt — Supabase SaaS Foundation

Continue the fresh Alsaiti Voice repository.

Read `CLAUDE.md`, the status documents, and Git diff before editing.

## Environment

If missing, ask me to add these directly to `.env.local` without pasting values into chat:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Authentication

Build Supabase signup, login, logout, password reset, email confirmation, auth callback, session refresh, protected routes, and correct redirects.

## Onboarding

Build a guided onboarding flow for business details, industry, services, opening hours, time zone, notification email, chat preference, and phone preference.

Provision one business workspace and owner membership idempotently after signup.

## Database and RLS

Create versioned migrations for:

- businesses
- business_members
- leads
- lead_notes
- conversations
- messages
- assistant_settings
- chat_widgets
- voice_settings
- phone_connections
- integrations
- notifications
- activity_logs
- billing_plans
- subscriptions
- usage_events

Enable Row Level Security. Every business-owned row must be accessible only through active business membership.

## Live application

Build real Supabase-backed:

- Dashboard
- Lead inbox
- Lead profile
- Status updates
- Assignment
- Notes
- Activity timeline
- Settings persistence

Dashboard KPIs:

- Total leads
- New leads
- Urgent leads
- Awaiting contact
- Qualified
- Booked
- Won
- Conversion rate
- Average speed to lead
- Source breakdown
- Recent activity
- Setup progress
- Integration health

Never silently show demo data in production after a query error.

Create an explicit development-only seed command.

## Tests

Test authentication, workspace provisioning, provisioning idempotency, RLS isolation, lead list/detail, status updates, notes, and unauthorised access.

Run type-check, lint, tests, and production build. Update docs and commit.


---

# FILE: 06_PHASE_2_REAL_LEAD_CAPTURE_PROMPT.md

# Phase 2 Prompt — Real Lead Capture

## Goal

Receive, save, notify, and forward real leads securely.

## Capture endpoint

Create `POST /api/v1/leads/capture`.

Do not trust a raw browser-supplied business ID. Resolve the business using a public widget key, signed token, API key, or trusted provider mapping.

Validate and normalise name, phone, email, service, urgency, source, summary, transcript, preferred callback, consent, external ID, and metadata.

Required controls:

- Zod validation
- At least one contact method
- Request-size limit
- Rate limiting
- Idempotency
- Safe errors
- PII-conscious logging
- No service-role exposure
- Exactly one lead on retry

## Resend

If missing, ask me to add these directly to `.env.local`:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_REPLY_TO_EMAIL`

Send new-lead and urgent-lead alerts, link to the lead, escape user content, store delivery result, and never fail lead creation solely because email failed.

## Webhooks

Create endpoint and delivery records. Send HMAC-signed `lead.created` events with event ID and timestamp. Add timeout, retry/backoff, delivery history, test delivery, enable/disable, and signing-secret rotation. Do not block lead creation while waiting for slow integrations.

## Definition of done

A real request creates exactly one lead, shows it in the dashboard, records activity, attempts email, attempts webhook, returns a safe response, and passes all checks.


---

# FILE: 07_PHASE_3_CHAT_WIDGET_PROMPT.md

# Phase 3 Prompt — Embeddable Chat Widget

Build a lightweight loader script that injects an isolated iframe.

Example installation:

```html
<script src="https://APP_DOMAIN/widget.js" data-widget-key="PUBLIC_WIDGET_KEY" async></script>
```

Build `/widget.js` and `/embed/chat/[publicKey]` with a floating launcher, mobile full-screen mode, keyboard support, accessible labels, reduced motion, safe `postMessage`, origin validation, and duplicate-install protection.

MVP flow:

1. Welcome
2. Service needed
3. Name
4. Phone
5. Email
6. Preferred callback
7. Urgency
8. Consent
9. Create lead
10. Confirmation

Use a deterministic qualification flow first. Optional AI may later assist with FAQ, classification, summary, and question choice, but must not invent prices, availability, guarantees, or regulated advice.

Create widget-installation and chat-session storage, link sessions to leads, and never store hidden model reasoning.

Add rate limiting, origin allowlists, input limits, escaping, sanitisation, honeypot, optional CAPTCHA adapter, privacy text, and retention controls.

Make `/chat-widget` fully live with settings, preview, installation snippet, allowed domains, enable/disable, test conversation, recent sessions, and editable templates for dental, aesthetics, home services, real estate, lettings, and consulting.


---

# FILE: 08_PHASE_4_STRIPE_BILLING_PROMPT.md

# Phase 4 Prompt — Stripe Billing

Use Stripe test mode.

Pricing:

- Starter: £149/month or £1,490/year
- Growth: £299/month or £2,990/year
- Pro: £499/month or £4,990/year
- No setup fee

If missing, ask me to add the Stripe publishable key, secret key, webhook secret, and six Price IDs directly to `.env.local`. Never print them.

Build Stripe customers, server-side checkout using an allowlist of Price IDs, customer portal, verified webhook, subscription records, processed-event idempotency, payment-failed state, upgrades, downgrades, cancellations, and monthly/yearly billing.

Do not grant paid access from a checkout success page. Grant it only after a verified Stripe webhook.

Create a central server-side entitlement service for locations, users, chat conversations, voice minutes, assistants, integrations, analytics, and white-label features.

Test successful and failed payment flows, duplicate events, upgrades, downgrades, cancellations, invalid signatures, unauthorised businesses, and missing Price IDs before any live credentials are used.


---

# FILE: 09_PHASE_5_AI_VOICE_ASSISTANT_PROMPT.md

# Phase 5 Prompt — Real AI Voice Assistant

## Architecture

The Next.js app is the control plane. The real-time voice loop runs in a separate long-running worker.

Use adapters for telecom, speech-to-text, LLM, and text-to-speech.

Recommended direction:

- Telnyx or another SIP provider
- LiveKit Agents
- Existing Supabase and lead-capture service

## Configuration

Persist assistant name, greeting, business information, services, hours, call objective, qualification questions, required fields, urgency rules, transfer rules, fallback rules, voice, language, time zone, recording, consent, after-hours behaviour, duration limit, and enabled status.

Support new AI number, existing-number forwarding, porting, and SIP/BYOC.

## Call flow

```text
Caller rings
↓
Provider sends inbound event
↓
Worker loads business configuration
↓
Assistant greets and qualifies
↓
Assistant transfers, requests callback, or completes capture
↓
Transcript and structured result are stored
↓
Lead is created or updated
↓
Business is notified
```

The agent must handle interruptions, silence, poor audio, disconnects, transfer failure, and consent. It must never invent pricing or availability.

Allowed tools must be controlled and validated: read hours/services, capture details, mark urgency, create lead, request callback, transfer, and end call.

Verify provider webhooks and process duplicate events idempotently.

Complete the phase only after a real test call creates exactly one lead, stores transcript/summary, triggers an alert, appears in the dashboard, and transfers correctly where required.


---

# FILE: 10_DEPLOYMENT_AND_GO_LIVE.md

# Deployment and Go-Live

Keep the app hosting-provider neutral.

Production components:

1. Next.js web application
2. Supabase
3. Separate long-running voice worker
4. Queue/background jobs
5. Monitoring and error tracking
6. HTTPS domains

Before go-live:

- Type-check, lint, tests, and production build pass
- No production demo fallback
- No tracked secrets
- RLS and cross-tenant access tested
- Migrations versioned
- Rate limiting and security headers configured
- Webhook signatures verified
- Logs avoid full PII and secrets
- Backups and rollback documented
- Staging smoke test completed
- Pilot business completed

Suggested domain: `voice.alsaitigrowth.com`.


---

# FILE: 11_SECURITY_TESTING_AND_CONTINUATION.md

# Security, Testing, and Continuation

## Security

- Revoke exposed Stripe and Resend keys
- Use Stripe test mode during development
- Never commit `.env.local`
- Never expose server-only keys
- Keep RLS enabled
- Test cross-business isolation
- Validate public input
- Add rate limiting and idempotency
- Verify all provider webhooks
- Avoid full PII in logs
- Add retention/deletion controls
- Never store hidden model reasoning

## Acceptance checks

Check auth, workspace provisioning, RLS, leads, status, notes, activity, duplicate capture, email failure handling, signed webhook retry, chat installation, billing lifecycle, test voice call, responsive layouts, and production smoke tests.

## Continuation prompt

```text
Continue the existing Alsaiti Voice repository.

Before editing:
1. Read CLAUDE.md.
2. Read docs/IMPLEMENTATION_STATUS.md.
3. Read docs/DECISIONS.md.
4. Read docs/NEXT_ACTIONS.md.
5. Inspect git status and git diff.
6. Run the quickest relevant baseline checks.
7. Identify the last completed milestone.
8. Continue from the next unfinished acceptance criterion.

Do not restart the project, duplicate completed work, or overwrite working migrations.

At the end, run checks, update documentation, list changed files, and state what is complete, mocked, blocked, and next.
```


---

# FILE: CLAUDE.md

# CLAUDE.md — Alsaiti Voice

## Mission

Build Alsaiti Voice as a secure, reliable, premium AI voice and chat lead-generation SaaS for service businesses.

## Fresh-project rule

This project starts from zero. After the initial scaffold exists, never restart it or create a competing duplicate project.

Inspect before editing and preserve working code.

## Architecture

- Next.js web app is the control plane
- Supabase provides Auth, Postgres, and RLS
- Resend provides email
- Stripe provides billing
- Signed webhooks are the first universal integration layer
- Real-time voice runs in a separate worker
- Telecom, STT, LLM, and TTS use provider adapters

## Security

- Never commit or print secrets
- Keep `.env.local` ignored
- Keep service-role and provider secrets server-side
- Preserve and test RLS
- Validate public input
- Add rate limiting and idempotency
- Verify webhook signatures
- Avoid full PII in logs
- Never store hidden model reasoning

## Truthfulness

- Never claim mocked functionality is live
- Never silently show demo values after a production error
- Distinguish configured, connected, and healthy
- Use honest loading, empty, and error states

## Engineering

- Strict TypeScript
- Business logic outside UI components
- Reusable services and components
- Versioned migrations
- Accessible responsive UI
- Tests for critical flows
- No broad rewrite without evidence
- Update project docs every session

## Session end

Run relevant checks, update implementation status/decisions/next actions, list changed files, and state what remains mocked, blocked, or untested.

Pause before destructive migrations, production-data deletion, real emails/payments/calls, paid-service activation, credential changes, or major architecture replacement.


---

# FILE: .env.example

NEXT_PUBLIC_APP_NAME="Alsaiti Voice"
NEXT_PUBLIC_COMPANY_NAME="Alsaiti Growth"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
APP_ENV="development"

NEXT_PUBLIC_SUPABASE_URL=""
NEXT_PUBLIC_SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""

RESEND_API_KEY=""
RESEND_FROM_EMAIL=""
RESEND_REPLY_TO_EMAIL=""

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
STRIPE_STARTER_MONTHLY_PRICE_ID=""
STRIPE_STARTER_YEARLY_PRICE_ID=""
STRIPE_GROWTH_MONTHLY_PRICE_ID=""
STRIPE_GROWTH_YEARLY_PRICE_ID=""
STRIPE_PRO_MONTHLY_PRICE_ID=""
STRIPE_PRO_YEARLY_PRICE_ID=""

NEXT_PUBLIC_CHAT_WIDGET_SCRIPT_URL=""
CHAT_WIDGET_SIGNING_SECRET=""
LEAD_CAPTURE_SIGNING_SECRET=""

TELECOM_PROVIDER="telnyx"
TELNYX_API_KEY=""
TELNYX_PUBLIC_KEY=""
TELNYX_CONNECTION_ID=""
TELNYX_APPLICATION_ID=""

LIVEKIT_URL=""
LIVEKIT_API_KEY=""
LIVEKIT_API_SECRET=""

LLM_PROVIDER=""
LLM_API_KEY=""
STT_PROVIDER=""
STT_API_KEY=""
TTS_PROVIDER=""
TTS_API_KEY=""

OUTBOUND_WEBHOOK_MASTER_KEY=""
CRON_SECRET=""
QUEUE_URL=""
QUEUE_TOKEN=""
CREDENTIAL_ENCRYPTION_KEY=""

SENTRY_DSN=""
NEXT_PUBLIC_SENTRY_DSN=""
LOG_LEVEL="info"

FEATURE_CHAT_WIDGET="false"
FEATURE_STRIPE_BILLING="false"
FEATURE_VOICE_ASSISTANT="false"
FEATURE_REAL_EMAILS="false"
FEATURE_OUTBOUND_WEBHOOKS="false"
