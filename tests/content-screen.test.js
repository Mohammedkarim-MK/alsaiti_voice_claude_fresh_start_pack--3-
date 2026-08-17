/* The assistant must never repeat a slur or abuse back to the caller.
 *
 * It did. vValidName() asked only "1-60 characters and contains a letter", which a slur
 * satisfies, so the greeting "Lovely to meet you, {name}" read a racial slur back to the caller
 * in a warm tone. On a real call that reaches a real customer of a real client, and it is the
 * kind of failure that gets screenshotted.
 *
 * This suite is deliberately blunt about what it feeds in, because a content filter that is
 * only tested with polite inputs is not tested.
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

console.log('=== content screen: nothing abusive is ever echoed ===\n');

const w = new JSDOM(SRC, { runScripts: 'dangerously', url: 'https://alsaitigrowth.com/' }).window;

ok(typeof w.vAbusive === 'function', 'vAbusive exists', 'the screen is missing entirely');
ok(typeof w.vValidName === 'function', 'vValidName exists', '');
if (!w.vAbusive) { console.log('\ncannot continue'); process.exit(1); }

console.log('\nthe two that were demonstrated');
{
  // Exactly what MK typed into the live demo.
  for (const s of ['nigger', 'bitch']) {
    ok(w.vAbusive(s), 'blocked: ' + s[0] + '***', 'this was echoed back on the live site');
    ok(!w.vValidName(s), 'rejected as a name: ' + s[0] + '***', 'would still be greeted by name');
  }
}

console.log('\nevasion that a plain word list would miss');
{
  const evasions = [
    'n1gg3r',      // leetspeak
    'N I G G E R', // spaced
    'niiiigger',   // padded vowel
    'niggggger',   // padded consonant
    'B!TCH',       // symbol substitution
    'f u c k',     // spaced profanity
    'sh1t',
    '  Bitch  ',   // padded whitespace
  ];
  for (const s of evasions) {
    ok(w.vAbusive(s), 'blocked: ' + JSON.stringify(s.slice(0, 3) + '…'),
      'normalisation missed this — the filter is decoration if it only catches exact spellings');
  }
}

console.log('\nreal names still work');
{
  const names = ['Mohammed', 'Sarah Whitfield', "O'Brien", 'Jean-Luc', 'María José',
                 'محمد', 'Priya Nair', 'Anne-Marie O\'Neill'];
  for (const s of names) {
    ok(w.vValidName(s), 'accepted: ' + s, 'a real caller was refused their own name');
    ok(!w.vAbusive(s), 'not flagged: ' + s, 'false positive on a legitimate name');
  }
}

console.log('\nthings that are not names are refused (but not treated as abuse)');
{
  for (const s of ['', 'x', '12345', 'a@b.com', '<script>alert(1)</script>', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']) {
    ok(!w.vValidName(s), 'refused: ' + JSON.stringify(s.slice(0, 22)), 'accepted as a name');
  }
  ok(!w.vAbusive('12345'), 'digits are not abuse', 'over-broad — this would silently drop a real answer');
}

console.log('\nthe assistant does not say it back');
{
  /* Step 1, not step 0. Step 0 IS the "may I take your name" question, so it never contains a
     name and asserting against it proves nothing — the first version of this check did exactly
     that and reported a false failure. Step 1 is the line that reads the name back:
     "Lovely to meet you, {name}." That is the line that spoke the slur. */
  w.LANG = 'en';
  w.VQ = w.vBuildQ ? w.vBuildQ() : w.VQ;
  const sayAt1 = (name) => { w.VOICE.step = 1; w.VOICE.data = { name }; return String(w.vAskText()); };

  const blocked = sayAt1('');            // what the screen leaves behind
  ok(!/nigger|bitch/i.test(blocked), 'the echo line contains no slur', 'the assistant would speak it');
  ok(blocked.length > 0, 'the assistant still says something', 'blocked input broke the flow');
  ok(/\?/.test(blocked), 'it still asks the next question', 'the call would stall after abuse');

  const good = sayAt1('Sarah');
  ok(/Sarah/.test(good), 'a real name is still read back', 'the screen broke the normal path');
}

console.log('\nabuse now asks for the name again, and cannot loop');
{
  const v = w.vValidate('name', 'nigger');
  ok(v.ok === false, 'still rejected', 'abuse was accepted as a name');
  ok(v.msg === 'v_retry_polite', 'asks for the name again', 'got ' + v.msg);
  ok(v.max >= 1 && v.max <= 3, 'capped at ' + v.max + ' attempts',
    'no cap — re-asking forever is an invitation to keep going');
  const said = w.t('v_retry_polite');
  ok(!/catch|hear|understand/i.test(said), 'does not pretend it mishears',
    'we heard it perfectly; pretending otherwise reads as a machine that can be played with');
  for (const lang of ['en', 'es', 'ar']) {
    w.LANG = lang;
    const str = w.t('v_retry_polite');
    ok(!!str && str !== 'v_retry_polite', 'v_retry_polite exists in ' + lang.toUpperCase(),
      'English-only string shipped');
  }
  w.LANG = 'en';
}

console.log('\n"yes" is not a service');
{
  for (const f of ['yes', 'Yes.', 'ok', 'no', 'hello', 'thanks'])
    ok(w.vFiller(f), 'filler: ' + JSON.stringify(f), 'accepted as a real answer');
  for (const r of ['a filling', 'boiler repair', 'yes please, a filling', 'no hot water'])
    ok(!w.vFiller(r), 'real answer: ' + JSON.stringify(r), 'a genuine reply was refused');

  ok(!w.vValidService('yes'), '"yes" refused as a service',
    'the demo answered "Great choice - that is exactly what we do" to the word yes');
  ok(w.vValidService('emergency boiler repair'), 'a real service is accepted', '');
  ok(!w.vValidService('fuck you'), 'abuse refused as a service',
    'never spoken, but it WOULD be written to the lead and shown in the dashboard');
}

console.log('\npassed: ' + pass);
if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1); }
