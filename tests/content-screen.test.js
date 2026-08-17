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

console.log('\npassed: ' + pass);
if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1); }
