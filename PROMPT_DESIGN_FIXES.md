# Prompt — design and UX fixes for alsaitigrowth.com

Your instruction set, rewritten as a prompt you can paste into a fresh session. Same five
requests, same four follow-ups, nothing added or removed — only structured, with the context
a new session would otherwise have to rediscover.

---

## The prompt

> ### Context
>
> I am working on **alsaitigrowth.com** — a marketing site and product for an AI receptionist
> and lead-capture dashboard, sold to small and mid-sized businesses. The differentiator is
> trilingual voice AI: **English, Spanish, Arabic**.
>
> The brand colour is **#123A2C** (deep green), matching the `theme-color` meta tag. Do not
> change it. Copy tone is professional, direct and benefit-led. No hype words.
>
> Read `PROGRESS.md` and `AUDIT.md` before starting. The site is one file, `docs/index.html`,
> with no build step; **after any edit to it, run `node tools/prerender.js`**, or three test
> suites and a CI step will fail.
>
> ### Standing rules
>
> - Every user-facing string must exist in **EN, ES and AR**. Never ship English-only copy, not
>   even placeholders.
> - Arabic must render RTL properly: `dir="rtl"`, logical CSS properties
>   (`margin-inline-start`, not `margin-left`), mirrored directional icons.
> - No secrets in client code, ever. Server environment variables only.
> - Do not add a dependency without telling me first, and why.
> - Every finding gets a `file:line` reference.
>
> ### Fix these five issues. Do not change the meaning of anything or remove content.
>
> **1 — The "£799 / Most popular / Growth" plan card.** The design currently looks shabby.
> Improve it so it is clean, modern and professional.
>
> **2 — The demo section on thin devices only.** The content is going outside its box. Fix the
> layout so it stays inside the container and looks correct on small screens.
>
> **3 — The "Good afternoon" greeting on the demo dashboard.** Remove it, because it is not
> professional — or redesign it so that it is. Make it better.
>
> **4 — The "Book a call" control.** Improve it so it matches the navigation bar visually.
> Improve the bar itself as well. Both should look better and be consistent with each other.
>
> **5 — "Book a call" and "Contact" currently do the same thing.** Review both and either fix
> the duplication or remove one of them. The final UX must be unambiguous.
>
> ### Then
>
> - Tell me whether all the functions are working, or not.
> - Write a guide explaining how to resolve the previous issue I raised — moving the site from
>   **72% to 100%** — including everything I have to do manually.
> - Make whatever further improvements you can, then tell me what is left for me to do.
> - Explain everything step by step.
>
> ### How to work
>
> Verify in a real browser rather than by reading code — take screenshots at desktop and mobile
> widths, and check the Arabic layout specifically. Report what you measured, not what you
> expect. If a fix turns out to be unnecessary, say so rather than making a change to look busy.

---

## Why the prompt is shaped this way

**The context block goes first** because a fresh session knows none of it. Without the brand
colour, the trilingual requirement and the prerender step, the first three answers are wasted
re-establishing them.

**The prerender warning is stated as a rule, not a footnote.** It is the single easiest thing to
forget in this repo and it fails silently — the site keeps serving yesterday's HTML to crawlers.

**"Do not change the meaning or remove anything"** is kept as your own words, because on a
design pass the real risk is a rewrite that quietly drops a feature line from a pricing card.

**The verification instruction at the end matters more than it looks.** Four of the five issues
are visual, and three of the bugs found in this session were only visible in a browser —
including one where the check itself measured nothing. A prompt that does not demand real
verification gets confident answers about things nobody looked at.

**"If a fix turns out to be unnecessary, say so"** exists because issue 3 was exactly that: the
greeting did not need deleting, only better content. A prompt that assumes every listed item is
a defect invites busywork.
