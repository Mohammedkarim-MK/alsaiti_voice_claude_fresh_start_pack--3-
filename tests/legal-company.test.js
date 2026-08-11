/* The legal notice must never publish a claim we have not verified.
 *
 * A legal page is the one page where being wrong is not a cosmetic bug. Stating a company number
 * that is not yours, or saying "registered in England and Wales" when no company exists, is a
 * false statement about a legal entity — an offence under the Companies Act, and exactly the
 * thing a customer's solicitor checks first. So the page is built to fail closed, and this test
 * is what proves the failure mode actually holds:
 *
 *   - with COMPANY unfilled, the page must NOT claim company status, and must not leak a blank
 *     row or a placeholder into what a visitor reads;
 *   - once filled, the disclosures Companies Act 2006 s.82 requires must all be present.
 *
 * It deliberately does NOT fail when the details are simply not filled in yet. That is a task for
 * the owner, not a broken build — and a test that fails red for a week is a test people stop
 * reading. It prints a loud reminder instead, and fails only on a genuine defect.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');

let pass = 0; const bad = [];
const ok = (c, name, detail) => {
  if (c) { pass++; console.log('  ok   ' + name); }
  else { bad.push(name + ' — ' + detail); console.log('  FAIL ' + name + ' — ' + detail); }
};

console.log('=== legal notice / company disclosures ===\n');

const dom = new JSDOM(SRC, { runScripts: 'dangerously', url: 'https://alsaitigrowth.com/' });
const w = dom.window;

ok(typeof w.COMPANY === 'object' && w.COMPANY, 'COMPANY block exists', 'the identity block is missing');
if (!w.COMPANY) { console.log('\ncannot continue'); process.exit(1); }

const configured = w.companyConfigured();
console.log('  (company details ' + (configured ? 'ARE' : 'are NOT') + ' filled in)\n');

/* ---------- true in both states ---------- */
{
  const html = w.legalPage('legal');
  const text = new JSDOM('<div>' + html + '</div>').window.document.body.textContent;

  // A placeholder reaching a visitor is always a defect, whichever state we are in.
  for (const leak of ['REPLACE_', 'TODO', 'XXXX', 'undefined', 'null', '[insert', 'lorem']) {
    ok(!text.toLowerCase().includes(leak.toLowerCase()), 'no "' + leak + '" in the rendered page',
      'a placeholder is visible to visitors');
  }
  ok(!/\b(Company number|Registered office|VAT number)\s*:?\s*$/m.test(text.trim()),
    'no empty labelled field', 'a field label rendered with nothing after it');

  ok(text.includes('Privacy') && text.includes('Terms'), 'links to the other legal pages',
    'the legal pages do not cross-link');
  ok(/Demo/.test(text), 'explains what Demo means',
    'the notice does not define Demo, so a client could read a simulated screen as a live one');
  ok(/data controller/i.test(text), 'identifies the data controller', 'UK GDPR requires this');
  ok(/ico\.org\.uk/i.test(text), 'tells people how to complain to the ICO', 'required signpost missing');
}

/* ---------- the fail-closed guarantee ---------- */
if (!configured) {
  const text = new JSDOM('<div>' + w.legalPage('legal') + '</div>').window.document.body.textContent;

  // The whole point: unverified means unclaimed.
  ok(!/registered in England and Wales under company number/i.test(text),
    'does NOT claim to be a registered company while unconfigured',
    'the page asserts company registration with no number behind it — this is the offence');
  ok(/being finalised/i.test(text), 'says the details are being finalised',
    'unconfigured state does not explain itself');

  const priv = new JSDOM('<div>' + w.legalPage('privacy') + '</div>').window.document.body.textContent;
  ok(!/company number/i.test(priv), 'privacy policy makes no company claim either',
    'the privacy policy asserts a registration the legal page does not');

  console.log('\n  ---------------------------------------------------------------');
  console.log('  REMINDER: COMPANY is not filled in, so the site does not yet show');
  console.log('  the trading disclosures UK law requires. Fill in legal_name, number,');
  console.log('  registered_office and ico in docs/index.html (search "var COMPANY=").');
  console.log('  ---------------------------------------------------------------');
} else {
  /* ---------- configured: the disclosures must actually be there ---------- */
  const text = new JSDOM('<div>' + w.legalPage('legal') + '</div>').window.document.body.textContent;
  const C = w.COMPANY;

  ok(text.includes(C.legal_name), 'shows the registered name', 'Companies Act 2006 s.82');
  ok(text.includes(C.number), 'shows the company number', 'Companies Act 2006 s.82');
  ok(text.includes(C.jurisdiction), 'shows the place of registration', 'Companies Act 2006 s.82');
  ok(text.includes(C.registered_office), 'shows the registered office', 'Companies Act 2006 s.82');
  ok(text.includes(C.email), 'shows an email contact', 'E-Commerce Regulations 2002 reg.6');

  // Shape checks, so an obviously wrong value is caught before it is published.
  ok(/^[A-Z]{0,2}[0-9]{6,8}$/.test(C.number.replace(/\s/g, '')), 'company number looks valid',
    '"' + C.number + '" is not a Companies House format (8 chars, e.g. 12345678 or SC123456)');
  if (C.ico) {
    ok(/^Z[A-Z0-9]{6,8}$/i.test(C.ico.replace(/\s/g, '')), 'ICO number looks valid',
      '"' + C.ico + '" is not an ICO registration format (e.g. ZB123456)');
    ok(text.includes(C.ico), 'shows the ICO registration number', 'clients doing due diligence look for it');
  }
  if (C.vat) {
    ok(/^(GB)?[0-9]{9}([0-9]{3})?$/i.test(C.vat.replace(/[\s.]/g, '')), 'VAT number looks valid',
      '"' + C.vat + '" is not a UK VAT format');
  }

  const priv = new JSDOM('<div>' + w.legalPage('privacy') + '</div>').window.document.body.textContent;
  ok(priv.includes(C.legal_name), 'privacy policy names the legal entity as controller',
    'a trading name cannot be a data controller — it must be the company');
}

console.log('\npassed: ' + pass);
if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1); }
