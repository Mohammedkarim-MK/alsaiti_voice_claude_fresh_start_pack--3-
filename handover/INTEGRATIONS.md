# Integrations

Handoff §9–§13. Exact callbacks, exact variable names, and what each provider needs before it may
truthfully say Connected.

**Project ref:** `jnxvwdcvnwigowafdxvl` (eu-west-2)
**Functions base:** `https://jnxvwdcvnwigowafdxvl.supabase.co/functions/v1`
**App URL:** `https://alsaitigrowth.com` — set as `PUBLIC_APP_URL`. The HubSpot redirect URL is a
Supabase function address and is **not** affected by the domain move.

## Deployment status — checked 27 July 2026

| Function | JWT | Deployed |
|---|---|---|
| `contact-submit` | no | yes — **but running the pre-fix version** |
| `tts` | no | yes |
| `crm-authorise` · `crm-callback` · `crm-metadata` · `crm-status` · `crm-sync-lead` · `crm-test` | mixed | yes |
| `telnyx-verify` · `telnyx-search` · `telnyx-order` · `telnyx-webhook` | mixed | yes |
| **`lead-notify`** | yes | **NO — returns 404** |

Two things follow from that table. No lead alert email can be sent at all until `lead-notify` is
deployed. And the contact-form fix is not live until `contact-submit` is redeployed.

```bash
supabase db push && supabase functions deploy contact-submit lead-notify
```

## HubSpot — the reference connector

Written, deployed, never authorised. It cannot say Connected until a real consent completes.

**Owner must provide** (enter directly into Supabase → Edge Functions → Secrets; do not send them
to anyone):

| Variable | Where to get it |
|---|---|
| `HUBSPOT_CLIENT_ID` | developers.hubspot.com → your app → Auth |
| `HUBSPOT_CLIENT_SECRET` | same page |

**Redirect URL to register — must match exactly, character for character:**

```
https://jnxvwdcvnwigowafdxvl.supabase.co/functions/v1/crm-callback
```

**Scopes:** `crm.objects.contacts.read`, `crm.objects.contacts.write`,
`crm.objects.deals.read`, `crm.objects.deals.write`, `crm.schemas.contacts.read`,
`crm.schemas.deals.read`, `oauth`. Request the minimum; HubSpot rejects the whole install if a
requested scope is not enabled on the app.

**Connected requires all eight** (§9.3): real consent · tokens stored encrypted · portal identity
loaded · scopes verified · pipelines and stages loaded · mapping saved · a real API test passed ·
no unresolved critical error. Seven out of eight is Test required, not Connected.

## Telnyx

Deployed and idle. Shows Demo until a funded account responds.

| Variable | Purpose |
|---|---|
| `TELNYX_API_KEY` | Least-privilege key. Voice + number management only |
| `TELNYX_PUBLIC_KEY` | Portal Ed25519 public key (base64). **Webhook verification fails without it** |
| `TELNYX_CONNECTION_ID` | SIP / voice connection |
| `TELNYX_APPLICATION_ID` | Voice application, where used |

**Webhook URL:**
```
https://jnxvwdcvnwigowafdxvl.supabase.co/functions/v1/telnyx-webhook
```

State machine (§10.3) — the UI must show exactly these, and never skip ahead:

| Condition | Shown |
|---|---|
| No API key | Needs Telnyx credentials |
| Credential rejected | Error / Invalid credentials |
| Valid account, no funds | Funding required |
| Funded, no number | Number required |
| Number exists, routing untested | Test required |
| Signed inbound test event received | Carrier connected |
| Real call reaches a live agent | Live |

**Number ordering costs real money.** `telnyx-order` is rate-limited to 5 per 5 minutes and
requires an explicit confirmation step. Do not automate around it.

## Live AI phone calls — not built

There is no LiveKit worker in this repository. A browser demo and an Edge Function are not a 24/7
telephone agent: real calls need SIP routing plus a long-running process that stays registered.

Required before anything may be called Live: `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
`LIVEKIT_API_SECRET`, `VOICE_WORKER_INTERNAL_SECRET`, an always-on host, a Telnyx inbound trunk
and dispatch rule, and CALL-01..10 passing with a real external phone.

Until then the product says **Infrastructure required**, and the voice screen is labelled a
browser demo. Do not relabel it without the call tests.

## Other CRMs

Pipedrive, Salesforce, Zoho, HighLevel, Microsoft Dynamics and Google Sheets all have an
authorisation path but no live metadata or sync test. They show Demo / Needs setup and must keep
doing so until each one passes a real provider test individually. A rendered wizard is not a
connection.

Client id/secret pairs follow the pattern `PIPEDRIVE_CLIENT_ID` / `PIPEDRIVE_CLIENT_SECRET`, and
so on — see `supabase/functions/.env.example`. Zoho needs `ZOHO_ACCOUNTS_URL` for a non-US data
centre; Salesforce needs `SALESFORCE_LOGIN_URL` for a sandbox.

## Email

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` *or* `SENDGRID_API_KEY` | Whichever is set wins. Neither set → 501 `no_email_provider`, stated honestly |
| `ALERT_FROM_EMAIL` | From address. **Must be on a domain verified with the provider** |
| `RESEND_REPLY_TO_EMAIL` | Fallback Reply-To when the enquirer's own address is unusable |
| `LEAD_NOTIFICATION_TO` | Where contact-form alerts go |

The `resend.dev` test domain can only mail your own address. Verify the real sending domain before
launch or alerts to anyone else silently fail.

Contact-form alerts set Reply-To to the enquirer, so replying in a mail client reaches them
directly while From stays on the verified domain.

## Human voice (TTS)

`ELEVENLABS_API_KEY` or `OPENAI_API_KEY`, server-side only, read by the `tts` function. With
neither set the app falls back to the device voice and says so rather than pretending. Optional
voice overrides are listed in `supabase/functions/.env.example`.

## Env var names — reconciled against Appendix A

Appendix A allows existing names to stand. These differ deliberately:

| Appendix A | This codebase | Why |
|---|---|---|
| `CREDENTIAL_ENCRYPTION_KEY` | `OAUTH_CREDENTIAL_ENCRYPTION_KEY` | Names what it actually encrypts |
| `RESEND_FROM_EMAIL` | `ALERT_FROM_EMAIL` | Provider-neutral; SendGrid is supported too |
| `NEXT_PUBLIC_SUPABASE_*` | `BK.DEFAULT_URL` / `DEFAULT_ANON` | No build step — the web app is one static file, so there is no `NEXT_PUBLIC_` inlining |

New since the handoff: `CONTACT_IP_HASH_SALT` (optional; without it `ip_hash` stays NULL),
`SUPABASE_SECRET_KEY` and `SUPABASE_PUBLISHABLE_KEY` (the legacy-key migration).

The root `.env.example` still lists the older `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` shape from the original phased build plan. It is not what the running
system uses — `supabase/functions/.env.example` is the accurate one.
