# Phase 3 Prompt — Embeddable Chat Widget

Build a lightweight loader script that injects an isolated iframe.

Example installation:

```html
<script src="https://APP_DOMAIN/widget.js" data-widget-key="PUBLIC_WIDGET_KEY" async></script>
```

Build `/widget.js` and `/embed/chat/[publicKey]` with a floating launcher, mobile full-screen mode, keyboard support, accessible labels, reduced motion, safe `postMessage`, origin validation, and duplicate-install protection.

MVP flow:

1. Welcome
2. Service needed
3. Name
4. Phone
5. Email
6. Preferred callback
7. Urgency
8. Consent
9. Create lead
10. Confirmation

Use a deterministic qualification flow first. Optional AI may later assist with FAQ, classification, summary, and question choice, but must not invent prices, availability, guarantees, or regulated advice.

Create widget-installation and chat-session storage, link sessions to leads, and never store hidden model reasoning.

Add rate limiting, origin allowlists, input limits, escaping, sanitisation, honeypot, optional CAPTCHA adapter, privacy text, and retention controls.

Make `/chat-widget` fully live with settings, preview, installation snippet, allowed domains, enable/disable, test conversation, recent sessions, and editable templates for dental, aesthetics, home services, real estate, lettings, and consulting.
