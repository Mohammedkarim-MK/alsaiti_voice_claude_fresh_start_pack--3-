# Alsaiti Voice — backend foundation (Phase 1)

This folder holds the Supabase schema for the real product. It is the base every
later phase (lead capture, chat, billing, **voice**) writes into.

## What `migrations/0001_foundation.sql` sets up

- `profiles` — one row per signed-up user
- `workspaces` — a business account (name, industry, timezone, owner)
- `workspace_members` — team membership + role (owner / admin / agent)
- `leads` — statuses `New, Contacted, Qualified, Booked, Won, Lost, Spam`
  and sources `Voice call, Website chat, Contact form, Manual import, API, CRM`
- **Row-Level Security** so a user only ever sees their own workspace's data
- A signup trigger that auto-creates the profile + first workspace

## To activate it (5 minutes, free)

1. Create a project at **supabase.com** (free tier).
2. Open **SQL Editor** → paste the contents of `migrations/0001_foundation.sql` → **Run**.
3. In **Project Settings → API**, copy:
   - **Project URL**
   - **anon public** key
   - **service_role** key (server-side only — never ship to the browser)
4. Put them in a git-ignored `.env.local` (see `.env.example` at the repo root).

Then send me the **Project URL + anon key** and I'll wire the app's auth and
dashboard to real data.

## Security (per CLAUDE.md)

- Never commit `.env.local` or the `service_role` key.
- RLS stays enabled; test it before shipping.
