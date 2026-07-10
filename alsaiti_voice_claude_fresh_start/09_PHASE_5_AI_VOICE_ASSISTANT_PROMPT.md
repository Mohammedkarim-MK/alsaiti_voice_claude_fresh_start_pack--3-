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
