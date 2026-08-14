/* Every custom header a client sends must be listed in Access-Control-Allow-Headers.
 *
 * This exists because the live contact form was broken by a header that was not on the list, and
 * nothing in the suite noticed. jsdom does not implement CORS, so a jsdom test of the form passes
 * happily while a real browser refuses to send the request at all — and it is not a soft failure:
 * an unlisted header makes the browser block the WHOLE request during preflight, so the enquiry
 * never reaches the function and the visitor sees an error on a form that tests green.
 *
 * The check is a string comparison rather than a live request on purpose: it runs in CI with no
 * deployment, and it fails at the moment someone adds a header to the client, which is the moment
 * the mistake is cheap to fix.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0; const bad = [];
const ok = (c, name, detail) => {
  if (c) { pass++; console.log('  ok   ' + name); }
  else { bad.push(name + ' — ' + detail); console.log('  FAIL ' + name + ' — ' + detail); }
};

/* ---- what the functions allow ---- */
const http = fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/http.ts'), 'utf8');
const m = http.match(/'Access-Control-Allow-Headers':\s*((?:'[^']*'\s*\+?\s*)+)/);
if (!m) {
  console.error('could not find Access-Control-Allow-Headers in _shared/http.ts');
  process.exit(2);
}
const allowed = new Set(
  [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).join('')
    .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
);
console.log('=== CORS allow-list vs what the clients actually send ===\n');
console.log('  allowed: ' + [...allowed].join(', ') + '\n');

/* ---- what the clients send ---- */
const CLIENTS = ['docs/index.html', 'alsaiti-go/App.js'];
const sent = new Map();          // header -> [files]
for (const rel of CLIENTS) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  let src = fs.readFileSync(p, 'utf8');
  /* Strip hreflang values before scanning. This check matches any quoted x- token, which is the
     right trade for finding headers set by bracket assignment or headers.set() — but hreflang
     ships a legitimate `x-default`, and the check reported it as an HTTP header the browser
     would block. Removing the attribute is more precise than a deny-list: it targets the one
     construct that produces false positives, rather than the one value that happens to exist
     today. */
  src = src.replace(/hreflang="[^"]*"/g, '');
  /* Any quoted x- token, not just `'x-foo':` in an object literal. The first version of this
     matched only the colon form and found nothing at all, because the site actually sets the
     header as h['x-correlation-id'] = … — so the check reported a clean bill of health on the
     exact file containing the bug it was written for. Headers get set by bracket assignment, by
     headers.set(), and by object literal, so match the token itself and let the x- prefix do the
     filtering. Over-matching here costs one line in an allow-list; under-matching costs a form. */
  for (const hit of src.matchAll(/['"](x-[a-z0-9-]+)['"]/gi)) {
    const h = hit[1].toLowerCase();
    if (!sent.has(h)) sent.set(h, []);
    if (!sent.get(h).includes(rel)) sent.get(h).push(rel);
  }
}

if (!sent.size) {
  console.log('  no custom x- headers found in any client');
} else {
  for (const [h, files] of [...sent].sort()) {
    ok(allowed.has(h), h + '  (sent by ' + files.join(', ') + ')',
      'the browser will block every request carrying it — add it to Access-Control-Allow-Headers ' +
      'in supabase/functions/_shared/http.ts');
  }
}

/* Guard the one that broke production, by name, so a tidy-up cannot quietly drop it. */
ok(allowed.has('x-correlation-id'), 'x-correlation-id is allowed',
  'this exact omission broke the live contact form');
ok(allowed.has('content-type'), 'content-type is allowed', 'JSON posts would fail preflight');
ok(allowed.has('apikey'), 'apikey is allowed', 'Supabase REST calls would fail preflight');

console.log('\npassed: ' + pass);
if (bad.length) {
  console.log('FAILED: ' + bad.length);
  bad.forEach((b) => console.log('   ' + b));
  process.exit(1);
}
