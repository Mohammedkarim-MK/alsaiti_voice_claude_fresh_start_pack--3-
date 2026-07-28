/* Handoff §4.3 — automated secret scanning, so a leaked credential is caught by CI rather than
   by an audit six weeks later.

   Scans the working tree only. History is a separate, slower job (see ci.yml), because rewriting
   history is a different remediation from rotating a key.

   Deliberately narrow: patterns match credential *values*, not the variable names. Matching the
   name would flag `.env.example`, every doc, and every legitimate `Deno.env.get('RESEND_API_KEY')`
   — and a scanner that cries wolf gets switched off. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'dist', 'web-build', '.git_history_backup']);
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.woff', '.woff2', '.ttf', '.mp3', '.wav', '.mp4']);

const PATTERNS = [
  ['Supabase secret key',   /\bsb_secret_[A-Za-z0-9_-]{12,}/g],
  ['Supabase access token', /\bsbp_[A-Za-z0-9]{16,}/g],
  ['Stripe live key',       /\bsk_live_[A-Za-z0-9]{16,}/g],
  ['Resend key',            /\bre_[A-Za-z0-9]{24,}/g],
  ['SendGrid key',          /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g],
  ['OpenAI key',            /\bsk-[A-Za-z0-9]{32,}/g],
  ['ElevenLabs key',        /\bsk_[a-f0-9]{40,}/g],
  ['Google API key',        /\bAIza[A-Za-z0-9_-]{30,}/g],
  ['Private key block',     /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g],
  ['AWS access key',        /\bAKIA[A-Z0-9]{16}\b/g],
  ['Hardcoded bearer',      /Authorization['"]?\s*:\s*['"]Bearer\s+[A-Za-z0-9._~+/-]{20,}/g],
];

/* A signed JWT is only a finding when it is a real one. The app legitimately shows truncated
   JWT-shaped placeholder text to explain what a GoHighLevel key looks like, and that must not
   fail the build — so require all three segments at real length. */
const JWT = /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/g;

const findings = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
    } else {
      const p = path.join(dir, entry.name);
      if (SKIP_EXT.has(path.extname(p).toLowerCase())) continue;
      let text;
      try { text = fs.readFileSync(p, 'utf8') } catch { continue }
      if (text.includes('\0')) continue;                    // binary
      const rel = path.relative(ROOT, p).replace(/\\/g, '/');
      for (const [label, re] of [...PATTERNS, ['Signed JWT', JWT]]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text))) {
          const line = text.slice(0, m.index).split('\n').length;
          findings.push({ file: rel, line, label, sample: m[0].slice(0, 12) + '…' });
        }
      }
    }
  }
}

walk(ROOT);

console.log('=== secret scan (working tree) ===');
if (!findings.length) {
  console.log('clean — no credential values found');
  process.exit(0);
}
console.log('FOUND ' + findings.length + ' possible secret(s):\n');
for (const f of findings) console.log('  ' + f.file + ':' + f.line + '  [' + f.label + ']  ' + f.sample);
console.log('\nRotate at the provider FIRST, then remove from the file. If it reached git history,');
console.log('rotating is not enough — the value stays in the history and must be rewritten out.');
process.exit(1);
