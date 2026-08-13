# Picking this project up somewhere else

Everything below was verified by cloning this repository fresh into an empty directory and
running it, rather than written from memory. Where a step is listed, it has been executed.

There is no machine-specific state to move. No `.env.local` exists, nothing local is required
to run the app or the tests, and every secret the system uses lives in Supabase rather than on
disk. That is deliberate: a project you can only work on from one laptop is a project with a
single point of failure, and that laptop is usually the thing that breaks.

---

## 1. Get Claude Code on the other machine

Same account, same project, any of these:

| Where | Notes |
|---|---|
| **claude.ai/code** | Browser. Nothing to install — useful from a borrowed machine or a phone. |
| **Desktop app** | Mac or Windows. |
| **CLI** (`claude`) | Terminal. |
| **IDE extension** | VS Code, JetBrains. |

Sign in with the same account you use here. Your history and settings follow the account, not
the machine.

## 2. Clone the repository

```bash
git clone https://github.com/Mohammedkarim-MK/alsaiti_voice_claude_fresh_start_pack--3-.git
```

## 3. Install the test dependencies

The only install step. Everything else in the repo runs on plain Node with no dependencies.

```bash
cd alsaiti_voice_claude_fresh_start_pack--3-/tests && npm install
```

Takes about 15 seconds and pulls ~62 packages, almost all of them jsdom.

## 4. Check it worked

```bash
node tests/run.js
```

Expect **17/17 suites passed**. Verified on a clean clone at commit `026686a`.

You can also run these immediately, with no login and no configuration, because they only use
public endpoints:

```bash
node tests/verify-deploy.js
```

Expect **28 passed** — that is the live backend answering, from any machine on the internet.

---

## What needs signing in, and what does not

**Needs nothing.** Editing the site, running all 17 test suites, the repo audit, the SQL parser
check, the secret scan, and `verify-deploy.js`. The Supabase anon key is committed on purpose —
it ships inside every browser that loads the site and is not a secret.

**Needs `supabase login`.** Only the commands that change the backend:

```bash
supabase login
supabase link --project-ref hedaklvumeihfsgokdsi
```

After that: `supabase db push`, `supabase functions deploy`, `supabase db query --linked`.

`supabase login` opens a browser and stores a token on that machine. Run it yourself — the token
should never be pasted into a chat, an email or a file.

**Needs a Cloudflare login.** Nothing routine. The site deploys automatically from `main`, so a
`git push` is a deploy; you only touch Cloudflare for DNS or domain settings.

---

## Deploying from anywhere

The site is a Cloudflare Pages project watching `main`. There is no build step and no deploy
command:

```bash
git add -A && git commit -m "..." && git push
```

Live in about 40 seconds. Confirm which build is actually serving:

```bash
curl -s https://alsaitigrowth.com/ | grep -o "hedaklvumeihfsgokdsi" | head -1
```

## Tool versions used here

Neither is pinned; these are what the work was done with.

| Tool | Version |
|---|---|
| Node | v24.15.0 |
| Supabase CLI | 2.113.0 |

---

## What is NOT in the repository

By design, and none of it is needed to work on the project:

- **`node_modules/`** — step 3 recreates it.
- **`supabase/.temp/`** — the link state. `supabase link` recreates it.
- **Every real secret.** `RESEND_API_KEY`, `STRIPE_WEBHOOK_SECRET`, the service-role key and the
  consumer secret are all stored in Supabase, set with `supabase secrets set`. They are not on
  this machine either, so there is nothing to carry across. `tests/secret-scan.js` fails the
  build if one is ever committed, and it decodes JWTs to tell a published anon key apart from a
  service-role key rather than treating both as leaks.

## Where to start reading

- `handover/IMPLEMENTATION_STATUS.md` — what is built and what is not
- `handover/OPERATIONS.md` — running it day to day
- `handover/SECURITY.md` — the security posture and what has been proven
- `ALSAITI_WHAT_I_MUST_DO.pdf` — the three tasks that still need MK in person
