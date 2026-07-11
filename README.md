# Alsaiti Voice

AI voice and chat lead-generation platform for service businesses. Captures enquiries from
calls, website chat, and forms; qualifies them; creates leads; alerts the business; and gives
the business a dashboard to manage and convert those leads.

This repository is the shared workspace for the team.

## What's in here

| Folder | What it is |
| --- | --- |
| `alsaiti-go/` | The Expo (React Native) mobile app — the main working build. |
| `alsaiti-voice-expo/` | Expo starter prototype (screens matching the spec). Run with `npx expo start`. |
| `alsaiti-voice-app/` | Responsive web prototype — open `index.html` in any browser. |
| `alsaiti_voice_claude_fresh_start/` | Product spec + phased build plan (`00`–`11`) and `.env.example`. |
| `alsaiti-mobile/` | Assets (e.g. QR image). |
| `attachments/` | Reference material. |
| `HOW_TO_TEST.md` | How to test the apps on phone / tablet / desktop. |

## Running the mobile app (alsaiti-go)

```bash
cd alsaiti-go
npm install
npx expo start
```

Scan the printed QR code with the Expo Go app. If your phone and computer are on different
networks, use `npx expo start --tunnel`.

## Team

- Owner: Malik
- Collaborator: Karim

## Security

Never commit real secrets. Keep credentials in a local `.env.local` (git-ignored). The
committed `.env.example` lists variable names only, with empty values.
