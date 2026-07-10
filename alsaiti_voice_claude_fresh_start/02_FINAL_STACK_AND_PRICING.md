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
