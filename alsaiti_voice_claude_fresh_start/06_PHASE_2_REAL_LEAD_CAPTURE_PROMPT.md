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
