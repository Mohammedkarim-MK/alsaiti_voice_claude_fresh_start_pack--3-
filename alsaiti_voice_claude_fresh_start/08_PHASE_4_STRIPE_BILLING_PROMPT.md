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
