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
