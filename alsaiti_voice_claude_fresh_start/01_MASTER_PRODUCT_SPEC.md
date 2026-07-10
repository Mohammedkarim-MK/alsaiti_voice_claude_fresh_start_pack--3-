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
