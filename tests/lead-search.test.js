/* Finding a lead again.
 *
 * The lookup that matters most in a phone-led business is the one that happens under pressure:
 * the phone rings, you have four seconds before you answer, and you need that caller's record.
 * Search covered name, service and email — not phone — so the single most common lookup returned
 * nothing at all, which reads as "we have never spoken to this person".
 *
 * Also guards a smaller bug with a silly failure mode: the haystack was built with
 * `l.name+' '+l.service+' '+(l.email||'')`, so a lead with no service contributed the literal
 * text "undefined", and searching for "undefined" matched every such lead.
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

console.log('=== lead search ===\n');

const dom = new JSDOM(SRC, { runScripts: 'dangerously', url: 'https://alsaitigrowth.com/' });
const w = dom.window;

const LEADS = [
  { id: '1', name: 'Sarah Whitfield', service: 'Emergency boiler',  email: 'sarah@example.com',
    phone: '+447365331141', status: 'New', source: 'Voice call', urgency: 'High', score: 88, at: 3, summary: 'Boiler leaking' },
  { id: '2', name: 'Tom Baxter',      service: null,               email: null,
    phone: '07700 900123',  status: 'New', source: 'Website chat', urgency: 'Low',  score: 20, at: 2, summary: null },
  { id: '3', name: 'Priya Nair',      service: 'Bathroom refit',   email: 'priya@example.com',
    phone: null,            status: 'Won', source: 'Contact form', urgency: 'Low',  score: 55, at: 1, summary: null },
];

// Drive the real code path rather than reimplementing the filter here.
w.getLeads = () => LEADS;
w.leadsMode = () => 'local';

const found = (q, filter) => {
  w.UI.q = q; w.UI.filter = filter || 'All';
  const html = w.leadResults();
  return LEADS.filter((l) => html.includes(l.name)).map((l) => l.id);
};

console.log('phone lookups, however the number was written');
{
  ok(found('7365331141').includes('1'), 'finds a lead by bare digits', 'the caller would not be found');
  ok(found('+44 7365 331141').includes('1'), 'finds it written internationally with spaces', 'formatting broke the match');
  ok(found('07365331141').includes('1'), 'finds the national form of an international number',
    'a UK number saved as +44 is not found when typed as 07…');
  ok(found('07700 900123').includes('2'), 'finds a number stored with a space', 'stored formatting broke the match');
  ok(!found('999999').length, 'a number nobody has returns nothing', 'phone matching is too loose');
  /* "12" does match the lead whose number contains 900123, and that is correct: every field is
     substring-matched, and a phone number is not special. What must not happen is a short query
     matching leads it appears nowhere in. The first version of this asserted that "12" matched
     NOTHING, which contradicted its own name and failed on behaviour that was right. */
  ok(found('12').length < LEADS.length, 'a two-digit query still narrows the list',
    'a short numeric query returned every lead');
  ok(found('12').every((id) => String(LEADS.find((l) => l.id === id).phone || '').includes('12')),
    'and only matches leads that really contain it', 'a lead matched a query it does not contain');
}

console.log('\nthe other fields still work');
{
  ok(found('sarah').includes('1'), 'by name', '');
  ok(found('bathroom').includes('3'), 'by service', '');
  ok(found('priya@example.com').includes('3'), 'by email', '');
  ok(found('boiler leaking').includes('1'), 'by summary', 'the note text is not searchable');
  ok(found('website chat').includes('2'), 'by source', '');
}

console.log('\nthe "undefined" bug stays fixed');
{
  ok(!found('undefined').length, 'searching "undefined" matches nothing',
    'a lead with an empty field puts the text "undefined" into the search haystack');
}

console.log('\nfilters and search combine');
{
  ok(found('', 'Won').join() === '3', 'status filter alone', 'filter is broken');
  ok(!found('sarah', 'Won').length, 'filter still applies while searching',
    'a search result ignored the active status filter');
  ok(found('', 'All').length === 3, 'All shows everything', '');
}

console.log('\npassed: ' + pass);
if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1); }
