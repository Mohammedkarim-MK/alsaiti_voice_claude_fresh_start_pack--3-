# Operations

Handoff §17, §20. How this is deployed, how to roll it back, and what is not yet watched.

## What runs where

| Piece | Where | Deploy |
|---|---|---|
| Marketing site + dashboard | GitHub Pages, `/docs` on `main` | `git push` — Actions publishes |
| Edge Functions | Supabase `jnxvwdcvnwigowafdxvl` (eu-west-2) | `supabase functions deploy <name>` |
| Database | Same project | `supabase db push` |
| Native app | Expo SDK 54 | Expo Go / EAS |
| Voice worker | **does not exist** | — |

The web app is a single static file with no build step. That makes rollback trivial and means
there is no bundler to hide a secret in — but also no place to inject environment variables, which
is why `BK.DEFAULT_URL` and the publishable key are literals in the file.

## Deploying

```bash
# database first — functions may depend on new columns
supabase db push

# then the functions
supabase functions deploy contact-submit lead-notify

# the web app
git push origin main        # Pages publishes from /docs
```

Order matters. `contact-submit` writes `idempotency_key`, `reference` and `notification_status`,
all added in migration `0006`. Deploy the function before the migration and every submission fails
with `store_failed` — which at least fails loudly and keeps the visitor's text, but is still an
outage.

### Two things that will waste your time

**The Pages CDN caches for 600 seconds and ignores cache-busting query strings.** After a push the
old file is served for up to ten minutes. Do not conclude a deploy failed from `curl`-ing the
Pages URL. Verify against `raw.githubusercontent.com` or the Actions API instead.

**The Pages deploy step fails intermittently.** It has failed twice at the "Deploy to GitHub Pages"
step while the build succeeded, and self-resolved on the next push. Re-run before investigating.

## Rolling back

The web app is one file, so:

```bash
git revert <bad-commit> && git push origin main
```

Functions have no built-in version history — redeploy from a known-good commit:

```bash
git checkout <good-commit> -- supabase/functions/<name> && supabase functions deploy <name>
```

**Migrations do not roll back automatically.** `0006` is additive — new columns and new tables —
so reverting the code without touching the database is safe. Anything destructive needs a written
forward-fix before it is applied.

## Monitoring — the honest position

**There is none.** No error monitoring, no uptime checks, no alerting. If the contact form starts
returning 502, nobody finds out until someone notices the enquiries stopped.

MON-01 in §19 is a mandatory gate and it currently fails. Before taking public traffic, at minimum:

- An uptime check on `POST /functions/v1/contact-submit` — it is the endpoint that loses money
  when it breaks.
- Error monitoring on the Edge Functions with the release commit attached.
- An alert on `contact_submissions` where `notification_status <> 'sent'` for more than an hour.
  Migration `0006` adds a partial index for exactly this query.

Until those exist, check manually:

```sql
-- enquiries whose alert never went out
select reference, created_at, notification_status, notification_error
from contact_submissions
where notification_status <> 'sent'
order by created_at desc limit 50;
```

## Logs

Supabase Dashboard → Edge Functions → Logs, per function. `fail()` logs the real error server-side
and returns only a short code to the client, so the detail is in the dashboard, not the browser.

Log lines carry event name, timestamp, workspace id, provider id, status and error code. They must
never carry tokens, passwords, payment data or message bodies.

## Backups

Supabase manages backups; the retention window depends on the plan and **has not been confirmed
for this project**. Confirm it before launch and write the answer here.

Never restore-tested. §17.3 requires at least one rehearsal before scaling. Do it on a branch
database, not production.

In source control and therefore recoverable: all migrations, all function code, the whole web app.
Not in source control: function secrets, and the data itself.

## Health check by hand

```bash
# each should answer; 404 means not deployed
for f in contact-submit lead-notify tts crm-status telnyx-verify; do
  printf "%-16s " "$f"
  curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    "https://jnxvwdcvnwigowafdxvl.supabase.co/functions/v1/$f" \
    -H "Content-Type: application/json" -d '{}'
done
```

Read the codes as: `400` = alive and validating · `401` = alive, wants a JWT · `302` = alive,
redirecting · `404` = **not deployed**.

## Incident notes

- **Contact form failing** — visitors keep their typed text and see a retry message, so nothing is
  lost at the moment of failure, but nothing is captured either. Check function logs, then the
  database. Fix forward; there is no queue to drain.
- **Alerts not arriving** — the enquiry is still safe in `contact_submissions`. Check
  `notification_status` and `notification_error`, then the provider dashboard. Verify the sending
  domain first; it is the usual cause.
- **A provider shows Attention required** — the token expired or consent was revoked. Reconnect
  from Integrations. Lead data is unaffected.

## Data retention

Committed to in the Privacy Policy, and **not yet automated**:

| Data | Retention |
|---|---|
| Contact enquiries | 24 months from last contact |
| Lead records | Life of the account, plus 90 days |
| Rate-limit and abuse rows | 30 days |
| Logs | Supabase default |

There is no scheduled job enforcing any of this. Someone has to build one, or delete by hand, or
the policy is a promise the system does not keep.
