# Voice worker

The long-running agent that answers real phone calls — handoff §11.

A browser demo and an Edge Function are not a 24/7 telephone agent. Real calls need SIP routing
plus a process that stays registered with LiveKit and survives restarts. That's this.

## Status, honestly

| Part | State |
|---|---|
| Extraction, qualification, transfer rules, exactly-once | **Tested** — 40 checks, no network needed |
| Call lifecycle | **Tested** — with a fake phone and a fake database |
| Health, drain, restart | Written, exercised locally |
| `src/agent.js` — the LiveKit binding | **Never run.** See below |

`agent.js` is the only file that needs a real LiveKit deployment, a real SIP trunk and a real
phone call to exercise. It has had none of those. Expect to adjust it against the SDK version you
install. It is deliberately thin — it translates LiveKit events into the seven-method `io`
interface `call.js` consumes — so when the SDK shifts, the rules don't.

Everything else is settled and covered.

```bash
npm install
npm test            # 40 checks, no credentials required
```

## What it guarantees

**One call produces exactly one lead.** Enforced by the database, not a flag in memory:
`call_sessions` has `unique (provider, provider_call_id)`, so a duplicate insert loses the race
and we read back the winner. Memory-based deduplication wouldn't survive the restart that a
reconnect usually implies. Tested both ways — a retried call creates no second lead, and a
genuinely different call is not deduplicated away.

**A caller is never lost.** Every branch that could drop someone is covered:

- The transfer fails → lead created, callback task raised, caller told what happens next
- The transfer throws → treated as a failure, not an exception
- The caller hangs up early → partial lead kept if we have any way to reach them
- The database dies mid-call → the call session is still marked, and the caller hears something
- Recording consent withheld → turn counts kept, words discarded, lead still created

**Nobody is trapped.** Hard cap of 24 turns; two silence prompts then a polite close.

**The AI is disclosed** in the first sentence, with the business named.

## Layout

```
src/extract.js   spoken digits, E.164, names, emails — deterministic, beats the model on phone numbers
src/qualify.js   urgency, score, transfer decision, disposition — pure, testable
src/call.js      the lifecycle, driven through an injectable io + store
src/store.js     Supabase writes, with the exactly-once claim
src/agent.js     the LiveKit binding  ← the untested seam
src/index.js     health endpoint + graceful drain
```

The split is the point: what a business will hold us to lives in files that can be tested
without a phone line.

## Running it

Needs an always-on host — LiveKit Cloud agents, Fly.io, Railway, or any container platform with
restart policies. Not serverless: the process must stay registered.

```bash
docker build -t alsaiti-voice-worker .
docker run --env-file .env -p 8080:8080 alsaiti-voice-worker
curl localhost:8080/health
```

`200` = fine, `503` = the agent is down or draining. Point your uptime monitor at it.

Secrets come from the host's secret storage. Never bake them into the image (§4.2).

## Before this may be called "Live"

§11.4 is explicit, and the label stays *Infrastructure required* until every one passes with a
real phone:

| | |
|---|---|
| CALL-01 | A real inbound call reaches the right assistant and greeting |
| CALL-02 | A normal enquiry captures details and creates **exactly one** lead |
| CALL-03 | The caller interrupts and the agent stops talking |
| CALL-04 | Silence prompts safely, then falls back |
| CALL-05 | An urgent call transfers to the approved number |
| CALL-06 | A failed transfer keeps the lead and raises a callback |
| CALL-07 | A mid-call hang-up is handled |
| CALL-08 | A provider retry creates no duplicate |
| CALL-09 | With the worker down, the carrier follows its documented fallback |
| CALL-10 | The same lead syncs once to HubSpot |

CALL-09 is worth calling out: it's about what happens when *this* is broken. Configure carrier
fallback to voicemail or forwarding **before** going live, not after the first outage.

## What the owner still has to provide

- A LiveKit deployment and its three credentials
- A funded Telnyx account, a real number, and an inbound trunk pointed at LiveKit
- Somewhere always-on to run this, and approval for the monthly cost
- `DEFAULT_TRANSFER_NUMBER` — the human who picks up urgent calls
- A decision on call recording and the consent wording it needs, per jurisdiction
