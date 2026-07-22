# Hosting security — getting the headers GitHub Pages can't give you

The app already ships a strict `Content-Security-Policy` in a `<meta>` tag, which works
everywhere including GitHub Pages. **One directive cannot work in a meta tag: `frame-ancestors`**
(the browser ignores it there by design). That's the real clickjacking defence, and it needs an
HTTP header — which GitHub Pages cannot set.

Until then the app defends itself in JavaScript (`frameGuard()` blocks foreign framing at boot and
on every render). That's solid, but a header is stronger because it stops the frame before a single
byte of your page runs.

Below is copy-paste config for every host you're likely to use. **Pick one.**

---

## Netlify or Cloudflare Pages — already done ✅

`docs/_headers` is committed. Both platforms read it automatically. Deploy the `docs` folder and
you're finished — no extra steps.

## Vercel — add `vercel.json` at the repo root

```json
{
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "Content-Security-Policy", "value": "frame-ancestors 'none'" },
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "no-referrer" },
      { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains" },
      { "key": "Permissions-Policy", "value": "camera=(), geolocation=(), payment=(), usb=()" }
    ]
  }]
}
```

## Cloudflare in front of GitHub Pages (keep your current hosting)

You don't have to move. Put Cloudflare in front of the Pages site and add a **Transform Rule →
Modify Response Header** setting `Content-Security-Policy: frame-ancestors 'none'`. This is the
lowest-effort way to close the gap without changing where the site lives.

## nginx

```nginx
add_header Content-Security-Policy "frame-ancestors 'none'" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

## Apache

```apache
Header always set Content-Security-Policy "frame-ancestors 'none'"
Header always set X-Frame-Options "DENY"
Header always set X-Content-Type-Options "nosniff"
Header always set Referrer-Policy "no-referrer"
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
```

---

## Verify it worked

```bash
curl -sI https://YOUR-DOMAIN/ | grep -iE "frame-ancestors|x-frame-options"
```

You should see the header echoed back. If nothing prints, the host isn't applying it yet.

## Keep in mind

- Don't remove the `<meta>` CSP from `index.html` — it's what protects the GitHub Pages copy.
- If you ever need to embed the dashboard in your own marketing site, change `'none'` to
  `frame-ancestors 'self' https://your-marketing-domain.com` rather than deleting the rule.
