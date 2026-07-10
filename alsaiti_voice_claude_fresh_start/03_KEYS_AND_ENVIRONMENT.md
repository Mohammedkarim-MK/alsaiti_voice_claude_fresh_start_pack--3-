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
