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
