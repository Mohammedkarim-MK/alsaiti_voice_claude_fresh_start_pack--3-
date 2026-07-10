# Working together on Alsaiti Voice

Two layers: sharing the **code** (works on any plan) and sharing a **Claude Project**
(needs a Team plan). Here's how each works.

## 1. Share the code + Claude Code setup (any plan) — recommended

The repo already contains the shared Claude context (`CLAUDE.md`, `.claude/settings.json`),
so when either of you opens it, your Claude gets the same project instructions automatically.

**Owner (MK) — publish once:**
1. GitHub Desktop → File → Add local repository → `D:\alsaiti_voice_claude_fresh_start_pack (3)`
   → create a repository → Create repository.
2. Publish repository → keep it Private → Publish.
3. On github.com: repo → Settings → Collaborators → Add people → `Abdelmalik20061`.

**Teammate (Abdelmalik20061) — join:**
1. Accept the email invite.
2. Clone: repo page → Code → Open with GitHub Desktop (or `git clone <url>`).
3. Open the folder in VS Code. Claude Code / Cowork picks up `CLAUDE.md` automatically.
4. `cd alsaiti-go && npm install && npx expo start` to run the app.

**Daily flow for both:** Pull → make changes → commit → push. Pull before pushing to avoid
conflicts. You're each using your own Claude subscription on the same shared files — that's the
normal way two people "work in Claude on the same project."

## 2. Share an actual Claude Project (Team/Enterprise plan only)

A Claude *Project* (shared knowledge, instructions, and chats in the Claude app) can only be
shared with another person on a **Team or Enterprise** plan — two separate individual Pro
accounts can't share one personal Project.

If you move to a Team plan:
1. Open the project in Claude → click **Share project** (right of the project name).
2. Add your teammate by email.
3. Set permission: **Can edit** (contribute to instructions/knowledge) or **Can use** (view + chat).

Docs:
- https://support.claude.com/en/articles/9519189-manage-project-visibility-and-sharing
- https://support.claude.com/en/articles/9517075-what-are-projects
- https://support.claude.com/en/articles/13455879-use-claude-cowork-on-team-and-enterprise-plans

## Summary

| Want | How | Plan |
| --- | --- | --- |
| Same code in VS Code, each with own Claude | GitHub repo (this repo) | Any |
| Same Claude instructions/context | `CLAUDE.md` + `.claude/` in the repo (done) | Any |
| Shared Claude Project (knowledge + chats) | Team plan → Share project by email | Team/Enterprise |
