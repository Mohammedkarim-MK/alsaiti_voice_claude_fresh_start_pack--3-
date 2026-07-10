# Publish to GitHub and add your teammate

Everything is consolidated in this folder and ready to publish. Follow these steps on your
computer (GitHub Desktop is already installed). It takes about 3 minutes.

## 1. Create the repository (GitHub Desktop)

1. Open **GitHub Desktop**. Sign in to your GitHub account if asked.
2. Menu: **File → Add local repository…**
3. Choose this folder: `D:\alsaiti_voice_claude_fresh_start_pack (3)`
4. It will say "this directory is not a Git repository — Create a repository?" Click
   **create a repository**, then **Create repository**.
   (The `.gitignore` and `README.md` are already here, so `node_modules` and secrets are excluded.)

## 2. Publish it

1. Click **Publish repository** (top bar).
2. Name it e.g. `alsaiti-voice`.
3. Leave **Keep this code private** ticked (recommended) unless you want it public.
4. Click **Publish repository**. Your code is now on GitHub.

## 3. Add Abdelmalik20061 as a collaborator (you must do this step)

Granting repo access can only be done by you, signed into your own account:

1. Go to the repo on **github.com** → **Settings** tab.
2. Left menu: **Collaborators** (under "Access"). GitHub may ask for your password.
3. Click **Add people**, type **Abdelmalik20061**, select him, click **Add**.
4. He gets an email invite. Once he **accepts**, he can see all files and push changes.

## 4. Your teammate clones it

Abdelmalik20061 opens the invite, then on the repo page clicks **Code → Open with GitHub
Desktop** (or `git clone <repo-url>`). To run the mobile app after cloning:

```bash
cd alsaiti-go
npm install
npx expo start
```

## Working together (daily flow)

- **Before you start:** click **Fetch/Pull** in GitHub Desktop to get the latest.
- **After changes:** write a short summary, click **Commit to main**, then **Push origin**.
- Pull before you push to avoid conflicts.

## Notes

- `node_modules` is intentionally not uploaded (each person runs `npm install`). This keeps the
  repo small and fast.
- Real secrets must never be committed — keep them in a local `.env.local` (git-ignored).
- The original `alsaiti-go` git history was preserved in `alsaiti-go/.git_history_backup/`
  (ignored by git). You can safely delete it if you don't need that old history.
