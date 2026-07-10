# First Prompt for Claude Code

You are building a completely new SaaS application called **Alsaiti Voice**.

This is a fresh build from zero. Do not search for, import, or reuse any previous Alsaiti Voice project.

## Read first

Read these files before creating application code:

- `CLAUDE.md`
- `00_START_HERE.md`
- `01_MASTER_PRODUCT_SPEC.md`
- `02_FINAL_STACK_AND_PRICING.md`
- `03_KEYS_AND_ENVIRONMENT.md`
- `.env.example`

## Product

Alsaiti Voice is an AI voice and chat lead-generation platform for service businesses. It captures enquiries from calls, website chat, and forms; qualifies them; creates leads; alerts the business; and gives the business a dashboard to manage and convert those leads.

## First-session task: foundation only

Create a clean Next.js project in the current empty folder.

Use:

- Next.js
- TypeScript
- App Router
- Tailwind CSS
- shadcn/ui
- Framer Motion
- React Hook Form
- Zod
- Supabase packages
- Resend package
- Stripe package

Create a clear structure for:

- `app`
- `components`
- `lib`
- `services`
- `types`
- `supabase`
- `public`
- `docs`
- `tests`

## Security

- Never put real secrets in tracked files
- Keep `.env.local` ignored
- Keep `.env.example` empty
- Never expose server-only keys in client code
- Never print secret values
- Do not ask me to paste production secrets into chat
- When a key is needed, tell me the variable name and where to obtain it, then ask me to add it directly to `.env.local`

## Documentation

Create:

- `README.md`
- `docs/PRODUCT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/DECISIONS.md`
- `docs/NEXT_ACTIONS.md`

Do not overwrite `CLAUDE.md`.

## Brand design

Use:

- Background: `#020B1F`
- Secondary: `#071735`
- Primary blue: `#3AA6FF`
- Cyan: `#59C7FF`
- Glow blue: `#1E90FF`
- Main text: `#F5F9FF`
- Muted text: `#93A8C7`
- Glass card: `rgba(11, 27, 58, 0.65)`
- Border: `rgba(83, 167, 255, 0.18)`

The app must look premium, dark, accessible, responsive, and not like a generic starter template.

## Route placeholders

Create compile-safe placeholders for:

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

Create a responsive authenticated app shell with sidebar, mobile navigation, topbar, page header, content container, loading states, error boundary, and not-found page.

Do not build real authentication, database, billing, email, chat, or voice features yet.

## Completion criteria

This session is complete only when:

- The project structure is clean
- Dependencies are installed
- The design system and app shell exist
- All route placeholders compile
- `.env.local` is ignored
- `.env.example` is present
- Documentation exists
- Type-check passes
- Lint passes
- A test runner is configured
- Production build passes
- Git is initialised
- A clean initial commit is created

At the end, report files created, packages installed, commands run, checks passed, keys required for Phase 1, and the exact next prompt to paste.
