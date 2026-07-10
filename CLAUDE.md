# Alsaiti Voice — Claude project context (shared by the team)

This file gives every teammate's Claude the same context when this repo is opened.
Read it before making changes.

## What this project is

Alsaiti Voice is an AI voice and chat lead-generation platform for service businesses:
it captures enquiries from calls, website chat, and forms, qualifies them, creates leads,
alerts the business, and provides a dashboard to manage and convert those leads.

## Repository layout

- `alsaiti-go/` — the main Expo (React Native) mobile app. **Expo SDK 54** — read the exact
  versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any Expo code.
  Requires an up-to-date Expo Go app on the phone to test SDK 54.
- `alsaiti-voice-expo/` — an Expo starter prototype mirroring the spec's screens.
- `alsaiti-voice-app/` — a responsive web prototype (single `index.html`, no build step).
- `alsaiti_voice_claude_fresh_start/` — product spec and the phased build plan (`00`–`11`),
  plus `.env.example`. Treat these as the source of truth for product behaviour.
- `alsaiti-mobile/`, `attachments/` — assets and reference material.

## Product rules (from the spec — do not change without discussion)

- Lead statuses: New, Contacted, Qualified, Booked, Won, Lost, Spam.
- Lead sources: Voice call, Website chat, Contact form, Manual import, API, CRM.
- Voice usage is metered (included limits, warnings, hard limits/overages, usage visibility) —
  never promise unlimited voice.

## Working agreements

- This is a shared GitHub repo. **Pull before you start, commit small, push often.**
- Never commit real secrets. Keep credentials in a local `.env.local` (git-ignored).
  `.env.example` lists variable names only, with empty values.
- `node_modules/` is not committed — run `npm install` after cloning.

## Team

- MK (@Mohammedkarim-MK)
- @Abdelmalik20061
