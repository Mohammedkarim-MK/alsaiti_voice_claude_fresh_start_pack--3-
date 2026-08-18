# From 72 to 100 — the work only you can do

Every item below needs a key, an account or a decision that is yours. None of it is code.
Worked in order, this is about **two hours** and takes the score from 72 to roughly 95.

The last 5 points are earned over weeks — real customers, real uptime history, a solicitor's
sign-off. Nobody can shortcut those, and a build that claims otherwise is lying to you.

> **Never paste a key into a chat window** — not to me, not to anyone. Every command below is
> one you run yourself in your own terminal. A key that appears in a chat should be treated as
> compromised and rotated at the provider.

---

## Step 1 — Lead alert emails · 30 min · **+8 points**

**This is the single most valuable thing you can do today.** Right now an enquiry is captured
perfectly, stored, and given a reference — and nobody tells you. For a lead-generation product
that is the one failure that costs money.

1. Sign up at **resend.com** (free tier is enough).
2. **Domains → Add Domain** → enter exactly `send.alsaitigrowth.com`
3. Resend shows you DNS records. Leave that page open.
4. In **Cloudflare → alsaitigrowth.com → DNS**, add each record exactly as shown.
   Set **Proxy status: DNS only** (grey cloud) on every one.
5. Back in Resend, press **Verify**. Usually green within minutes.
6. **API Keys → Create API Key**, permission *Sending access*. Copy it — shown once.
7. In your project folder:

```bash
supabase secrets set RESEND_API_KEY=re_your_real_key_here
```

**Check it worked:**
```bash
curl -X POST https://hedaklvumeihfsgokdsi.supabase.co/functions/v1/health -H "Content-Type: application/json" -d "{}"
```
Expect `"status":"ok"` instead of `"degraded"`. Then send yourself a test enquiry through the
form and confirm the email arrives — check spam the first time.

> **The DKIM record is the one people get wrong.** It is long and unique to your account, so
> nobody else can supply it. Copy it with the copy button rather than retyping. If Resend will
> not verify, it is almost always that record or an orange cloud that should be grey.

**Enquiries that arrived before you finish are not lost.** They queue and send themselves
within a minute of the key landing.

> That was not true when I first wrote it. Contact-form alerts were sent synchronously and never
> queued, so an enquiry captured with no provider configured was stored, given a reference, and
> forgotten — adding the key later delivered nothing. Migration 0022 puts them on the same
> durable queue the leads use, and `tests/contact-alert-durability.test.js` holds it there. One
> test enquiry is sitting in the queue now, deferred with its full retry budget, waiting for
> your key.

---

## Step 2 — Stripe · 45 min · **+12 points**

Takes monetisation from 25 to about 80. The code is written, deployed and tested; nothing here
is development.

### 2a. Create the Products and Prices — in the dashboard, not in code

Use **test mode** first. Your live prices are £499 / £799 / £1,200 per month, with annual at
20% off (£4,790 / £7,670 / £11,520 per year).

Create three Products, each with two Prices (monthly and annual). Copy the six `price_...` ids.

### 2b. Enable Stripe Tax

**Settings → Tax** → enable. Add your UK VAT registration. Without this every EU sale is
mispriced and the VAT comes out of your margin.

### 2c. Give the keys to the backend

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
```

```bash
supabase secrets set STRIPE_PRICE_STARTER_MONTHLY=price_xxx STRIPE_PRICE_STARTER_ANNUAL=price_xxx STRIPE_PRICE_GROWTH_MONTHLY=price_xxx STRIPE_PRICE_GROWTH_ANNUAL=price_xxx STRIPE_PRICE_FULL_MONTHLY=price_xxx STRIPE_PRICE_FULL_ANNUAL=price_xxx
```

> The third tier is `FULL`, matching **Full Automation** on your pricing page. It used to be
> three different words in three places — `scale` in the database, `business` in the checkout,
> `plan_full` on the page — which meant a paying top-tier customer would have landed on a plan
> the database could not price, and silently received unlimited seats. Fixed in migration 0021,
> and `tests/plan-codes.test.js` now fails the build if the three ever disagree again.

### 2d. Point Stripe at the webhook

**Developers → Webhooks → Add endpoint:**

```
https://hedaklvumeihfsgokdsi.supabase.co/functions/v1/stripe-webhook
```

Select: `checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`, `invoice.payment_failed`.

Copy the signing secret (`whsec_...`) and:

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_your_real_secret
```

### 2e. Test it end to end

```bash
stripe listen --forward-to https://hedaklvumeihfsgokdsi.supabase.co/functions/v1/stripe-webhook
```

Then check out with card `4242 4242 4242 4242`, any future expiry, any CVC.

**Two things to confirm, and the second matters more:**
1. After paying, the account unlocks.
2. **Open the success URL directly without paying — nothing should unlock.** Access is granted by
   the webhook, never the redirect. If step 2 unlocks anything, stop and tell me.

**Only when both pass, switch to live keys.**

---

## Step 3 — Uptime monitoring · 10 min · **+3 points**

1. Sign up at **uptimerobot.com** (free).
2. Monitor 1 — HTTP(S), `https://alsaitigrowth.com`, every 5 minutes.
3. Monitor 2 — HTTP(S), the health endpoint below, alert on any status other than 200.
4. Put your own email and phone in as the alert contact, and **test that the alert reaches you**.

```
https://hedaklvumeihfsgokdsi.supabase.co/functions/v1/health
```

Monitor 2 is the one that matters: the site can look perfectly fine while the database or the
lead queue behind it is failing. The health endpoint returns 503 then; the homepage still
returns 200.

---

## Step 4 — Analytics · 5 min · **+2 points**

1. Sign up at **plausible.io**, add site `alsaitigrowth.com`.
2. Nothing to install — the script is already on the site.
3. Switch language on the site, then check **Language switch** appears in Plausible.

Until the domain is registered there, every event is silently dropped.

You will then see which of the three languages actually converts — the question that decides
where your next marketing effort goes.

---

## Step 5 — Company details · 15 min · **+3 points**

Open `docs/index.html`, search `var COMPANY=`, and fill in four fields:

| Field | Where to get it |
|---|---|
| `legal_name` | Certificate of incorporation, exactly as written |
| `number` | Companies House, 8 characters |
| `registered_office` | The address on the certificate |
| `ico` | ico.org.uk — your data protection registration |

Then:
```bash
node tools/prerender.js
```
```bash
git add -A && git commit -m "Add company registration details" && git push
```

Until these are filled, `/legal` says the details are being finalised rather than claiming a
registration. That is deliberate — publishing an unverified company number is a false statement
about a legal entity, which is worse than saying nothing.

---

## Step 6 — The three things I could not decide for you · **+2 points**

**Cal.com link.** `docs/index.html`, search `var CAL_LINK`. Paste your booking URL. The embed
loads on click only. It also needs a CSP entry — **tell me when you add the link and I will
give you the exact directive** rather than loosening the policy.

**Demo phone number.** Search `var DEMO_PHONE` — E.164 format, e.g. `+441234567890`, plus
`DEMO_HOURS` if it is not answered around the clock. **The section does not render at all until
this is set**, on purpose: a "hear it live" box that rings out tells a visitor the product does
not work.

**The four `/data-processing` sections marked "being confirmed"** — transfers outside the UK/EU,
sub-processor notice period, breach notification window, audit rights. **These need a solicitor,
not a developer.** They are contractual promises a customer can hold you to. Take the page to
whoever does your contracts; it is written so they only have to fill four gaps.

---

## Where that leaves you

| After | Score | What you can honestly sell |
|---|---|---|
| Step 1 | 80 | Lead capture, end to end, with alerts |
| Steps 1–2 | 92 | The above, and you can take money |
| Steps 1–5 | ~95 | A complete, monitored, legally-identified business |

**The last 5 points are not buyable.** They are a real uptime record, real customers, a
solicitor's sign-off on the DPA, and a screen-reader pass by someone who uses one. Anyone who
tells you a codebase is at 100 before those exist is guessing.

---

## Two things that are still not true, and you should know before selling

**The AI receptionist, phone numbers and integrations are demonstrations.** The site says so
plainly on every one of those screens, and the Terms define what "Demo" means. Making them real
needs a funded Telnyx account and voice hosting — weeks, not an afternoon, and not on this list.

**Today you can honestly promise:** enquiries captured from your website, stored safely, kept
separate per client, visible in a dashboard, and emailed to you the moment they arrive. That is
a real product. Sell that.
