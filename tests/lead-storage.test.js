/* Handoff §7/§8 — Supabase is the source of truth for a real account; the demo stays local.
   These assert the properties that make it safe, not just that it renders. */
const REPO = require('path').join(__dirname, '..');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const HTML = fs.readFileSync(REPO + '/docs/index.html', 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0; const bad = [];
const ok = (c, id, what) => { if (c) pass++; else bad.push(id + ': ' + what) };

/* A scripted PostgREST. Records every request so we can assert on what was actually sent. */
function boot(handler) {
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.SpeechSynthesisUtterance = function (t) { this.text = t };
  w.speechSynthesis = { getVoices: () => [], cancel() {}, speak(u) { setTimeout(() => u.onend && u.onend(), 1) } };
  w.Audio = function () { return { play: () => Promise.resolve(), pause() {}, set src(v) {}, get src() { return '' } } };
  w.scrollTo = () => {}; w.scrollBy = () => {};
  const reqs = [];
  w.fetch = (url, opt) => {
    opt = opt || {};
    const rec = { url: String(url), method: opt.method || 'GET', headers: opt.headers || {}, body: opt.body ? JSON.parse(opt.body) : null };
    reqs.push(rec);
    const r = handler(rec) || { status: 200, json: [] };
    return Promise.resolve({
      ok: r.status >= 200 && r.status < 300, status: r.status,
      text: () => Promise.resolve(r.json === null ? '' : JSON.stringify(r.json)),
      json: () => Promise.resolve(r.json),
    });
  };
  return { w, reqs };
}

/* Put the window into a "real Supabase account" state without touching the network. */
function signInReal(w) {
  const c = w.BK.cfg(); c.token = 'fake.jwt.token'; c.refresh = 'refresh'; c.email = 'real@business.com';
  w.BK.save(c);
  w.DB.set('ag_session', { email: 'real@business.com', auth: 'supabase', at: Date.now(), exp: Date.now() + 6e8 });
  w.DB.set('ag_users', { 'real@business.com': { name: 'Real User', biz: 'Real Ltd', email: 'real@business.com' } });
  w.leadsReset();
}

const ROW = (over) => Object.assign({
  id: '11111111-1111-4111-8111-111111111111', name: 'Sarah Whitfield', service: 'Implant consult',
  phone: '+44 7700 900112', email: 's@example.com', urgency: 'High', source: 'Voice call',
  status: 'New', score: 92, summary: 'Wants the earliest slot.', notes: '', assignee: 'Front desk',
  created_at: new Date(Date.now() - 60000).toISOString(),
}, over || {});

const isLeads = (r) => /\/rest\/v1\/leads/.test(r.url);
const vis = (w) => { const c = w.document.body.cloneNode(true); c.querySelectorAll('script,style').forEach((x) => x.remove()); return c.textContent };

(async () => {
  /* ---- 1. demo stays local and never touches the network ---- */
  {
    const { w, reqs } = boot(() => ({ status: 200, json: [] }));
    await wait(340);
    w.demoLogin(); await wait(60);
    ok(w.leadsMode() === 'local', 'mode', 'demo login is not in local mode');
    ok(w.getLeads().length > 0, 'demo', 'demo has no sample leads');
    ok(!reqs.some(isLeads), 'demo', 'the demo hit the leads table over the network');
    // and a demo write stays in localStorage
    const before = w.getLeads().length;
    w.setLeads(w.getLeads().slice(1)); await wait(40);
    ok(w.getLeads().length === before - 1, 'demo', 'local write did not persist');
    ok(!reqs.some(isLeads), 'demo', 'a demo edit was sent to the server');
  }

  /* ---- 2. a real account reads from Supabase ---- */
  {
    const { w, reqs } = boot((r) => {
      if (/workspaces/.test(r.url)) return { status: 200, json: [{ id: 'ws-1' }] };
      if (isLeads(r)) return { status: 200, json: [ROW(), ROW({ id: '22222222-2222-4222-8222-222222222222', name: 'James Okoro', status: 'Won' })] };
      return { status: 200, json: [] };
    });
    await wait(340); signInReal(w);
    ok(w.leadsMode() === 'supabase', 'mode', 'a real session is not in supabase mode');
    w.getLeads();                       // triggers the hydrate
    await wait(80);
    const rows = w.getLeads();
    ok(rows.length === 2, 'read', 'expected 2 leads from the server, got ' + rows.length);
    ok(rows[0].name === 'Sarah Whitfield', 'read', 'row not mapped into the app shape');
    ok(typeof rows[0].at === 'number' && rows[0].at > 0, 'read', 'created_at not mapped to a timestamp');
    const get = reqs.find(isLeads);
    ok(/Authorization/.test(Object.keys(get.headers).join(',')), 'security', 'no Authorization header on the table request');
    ok(get.headers.Authorization === 'Bearer fake.jwt.token', 'security', 'the user JWT was not used — RLS would not apply');
    ok(!/workspace_id=eq/.test(get.url), 'security', 'the client filters by workspace_id itself; RLS must be what enforces isolation');
  }

  /* ---- 3. creating a lead POSTs, and adopts the database id ---- */
  {
    const saved = ROW({ id: '33333333-3333-4333-8333-333333333333', name: 'New Person' });
    const { w, reqs } = boot((r) => {
      if (/workspaces/.test(r.url)) return { status: 200, json: [{ id: 'ws-1' }] };
      if (isLeads(r) && r.method === 'POST') return { status: 201, json: [saved] };
      if (isLeads(r)) return { status: 200, json: [] };
      return { status: 200, json: [] };
    });
    await wait(340); signInReal(w);
    w.getLeads(); await wait(80);
    w.setLeads([{ id: 'LD-TEMP', name: 'New Person', service: 'x', urgency: 'High', source: 'Manual import', status: 'New', score: 50, at: Date.now(), phone: '', email: '', summary: '', notes: '', assignee: '' }]);
    await wait(90);
    const post = reqs.find((r) => isLeads(r) && r.method === 'POST');
    ok(!!post, 'create', 'creating a lead sent no POST');
    ok(post && post.body.workspace_id === 'ws-1', 'create', 'workspace_id not set on insert');
    ok(post && post.body.id === undefined, 'create', 'client invented an id instead of letting the database generate one');
    ok(w.getLeads()[0].id === saved.id, 'create', 'did not adopt the database id — later edits would address the wrong row');
  }

  /* ---- 4. editing PATCHes only the changed row; deleting DELETEs ---- */
  {
    const { w, reqs } = boot((r) => {
      if (/workspaces/.test(r.url)) return { status: 200, json: [{ id: 'ws-1' }] };
      if (isLeads(r) && r.method === 'GET') return { status: 200, json: [ROW(), ROW({ id: '44444444-4444-4444-8444-444444444444', name: 'Untouched' })] };
      return { status: 204, json: null };
    });
    await wait(340); signInReal(w);
    w.getLeads(); await wait(80);
    const list = w.getLeads().map((l) => Object.assign({}, l));
    list[0].status = 'Won';
    w.setLeads(list); await wait(90);
    const patches = reqs.filter((r) => isLeads(r) && r.method === 'PATCH');
    ok(patches.length === 1, 'update', 'expected exactly 1 PATCH, got ' + patches.length + ' (an untouched row was rewritten)');
    ok(patches[0] && /id=eq\.11111111/.test(patches[0].url), 'update', 'PATCH did not target the edited row');
    ok(patches[0] && patches[0].body.status === 'Won', 'update', 'PATCH did not carry the new status');

    const keep = w.getLeads().filter((l) => l.id !== '44444444-4444-4444-8444-444444444444');
    w.setLeads(keep); await wait(90);
    const del = reqs.filter((r) => isLeads(r) && r.method === 'DELETE');
    ok(del.length === 1 && /id=eq\.44444444/.test(del[0].url), 'delete', 'delete did not target the removed row');
  }

  /* ---- 4b. THE WAY THE APP ACTUALLY CALLS IT ----
     moveStatus and saveNote do `var leads = getLeads()` and then mutate the lead objects in
     place before calling setLeads. If the cache hands out its own array, the "before" and
     "after" of the diff are the same objects and every comparison says unchanged — so nothing
     is ever sent. The test above cloned first and sailed straight past this. */
  {
    const { w, reqs } = boot((r) => {
      if (/workspaces/.test(r.url)) return { status: 200, json: [{ id: 'ws-1' }] };
      if (isLeads(r) && r.method === 'GET') return { status: 200, json: [ROW()] };
      return { status: 204, json: null };
    });
    await wait(340); signInReal(w);
    w.getLeads(); await wait(80);

    // exactly what moveStatus does
    const leads = w.getLeads();
    leads.forEach((l) => { if (l.id === '11111111-1111-4111-8111-111111111111') l.status = 'Won'; });
    w.setLeads(leads);
    await wait(90);
    const patches = reqs.filter((r) => isLeads(r) && r.method === 'PATCH');
    ok(patches.length === 1, 'in-place edit', 'mutating in place then saving sent ' + patches.length + ' PATCH requests — the change never reaches the server');
    ok(patches[0] && patches[0].body.status === 'Won', 'in-place edit', 'PATCH did not carry the new status');

    // and a second, different in-place edit must also go
    const again = w.getLeads();
    again.forEach((l) => { l.notes = 'called them back'; });
    w.setLeads(again);
    await wait(90);
    const p2 = reqs.filter((r) => isLeads(r) && r.method === 'PATCH');
    ok(p2.length === 2, 'in-place edit', 'a second in-place edit sent ' + (p2.length - 1) + ' PATCH — notes are being silently dropped');
    ok(p2[1] && p2[1].body.notes === 'called them back', 'in-place edit', 'note not persisted');
  }

  /* ---- 4c. two edits in quick succession must not duplicate ----
     Writes are async. If a second save reads the snapshot before the first has finished
     updating it, it re-sends the first change — and for a new lead that means a second POST
     and a duplicate row in the customer's CRM. */
  {
    let posted = 0;
    const { w, reqs } = boot((r) => {
      if (/workspaces/.test(r.url)) return { status: 200, json: [{ id: 'ws-1' }] };
      if (isLeads(r) && r.method === 'GET') return { status: 200, json: [] };
      if (isLeads(r) && r.method === 'POST') {
        posted++;
        return { status: 201, json: [ROW({ id: 'new-' + posted, name: r.body.name })] };
      }
      return { status: 204, json: null };
    });
    await wait(340); signInReal(w);
    w.getLeads(); await wait(80);

    const mk = (n) => ({ id: 'LD-' + n, name: n, service: 's', urgency: 'Low', source: 'Manual import', status: 'New', score: 50, at: Date.now(), phone: '', email: '', summary: '', notes: '', assignee: '' });
    // back to back, with no await between — exactly what a fast user does
    w.setLeads([mk('First')]);
    w.setLeads([mk('Second'), mk('First')]);
    await wait(250);

    const posts = reqs.filter((r) => isLeads(r) && r.method === 'POST');
    const names = posts.map((p) => p.body.name).sort();
    ok(posts.length === 2, 'race', 'two quick creates sent ' + posts.length + ' POSTs — expected 2 (a duplicate row would reach the CRM)');
    ok(JSON.stringify(names) === JSON.stringify(['First', 'Second']), 'race', 'POSTed ' + JSON.stringify(names) + ' — a lead was sent twice');
  }

  /* ---- 5. a failed load must never read as "you have no leads" ---- */
  {
    const { w } = boot((r) => {
      if (/workspaces/.test(r.url)) return { status: 200, json: [{ id: 'ws-1' }] };
      if (isLeads(r)) return { status: 500, json: { message: 'boom' } };
      return { status: 200, json: [] };
    });
    await wait(340); signInReal(w);
    w.location.hash = '#/leads'; w.render(); await wait(120);
    const txt = vis(w);
    ok(!/No matching leads/i.test(txt), 'honesty', 'a failed load rendered as "No matching leads"');
    ok(/could not reach|no se pudo|تعذّر/i.test(txt), 'honesty', 'the load failure was not surfaced to the user');
    ok(/try again|reintentar|إعادة/i.test(txt), 'honesty', 'no way to retry a failed load');
    ok(!!w.LEADS.err, 'honesty', 'the error state was not recorded');
  }

  /* ---- 6. a failed WRITE resyncs from the server rather than lying ---- */
  {
    let gets = 0;
    const { w, reqs } = boot((r) => {
      if (/workspaces/.test(r.url)) return { status: 200, json: [{ id: 'ws-1' }] };
      if (isLeads(r) && r.method === 'GET') { gets++; return { status: 200, json: [ROW()] } }
      return { status: 403, json: { message: 'denied' } };     // every write fails
    });
    await wait(340); signInReal(w);
    w.getLeads(); await wait(80);
    const g0 = gets;
    const list = w.getLeads().map((l) => Object.assign({}, l)); list[0].status = 'Won';
    w.setLeads(list); await wait(150);
    ok(gets > g0, 'recovery', 'a rejected write did not trigger a reload — the screen would show a change the server refused');
    ok(w.getLeads()[0].status === 'New', 'recovery', 'the refused change is still on screen as if it saved');
  }

  /* ---- 7. sample data must never be written into a real workspace ---- */
  {
    const { w, reqs } = boot((r) => {
      if (/workspaces/.test(r.url)) return { status: 200, json: [{ id: 'ws-1' }] };
      return { status: 200, json: [] };
    });
    await wait(340); signInReal(w);
    w.seedIfNeeded('real@business.com'); await wait(60);
    ok(!reqs.some((r) => isLeads(r) && r.method === 'POST'), 'demo-isolation', 'seeding wrote sample leads into a real workspace');
    ok(w.localStorage.getItem('ag_leads_real@business.com') === null, 'demo-isolation', 'sample data was written to local storage for a real account');
    const before = reqs.length;
    w.resetData(); await wait(60);
    ok(reqs.length === before, 'demo-isolation', 'reset sample data touched a real account');
  }

  /* ---- 8. signing out must not leak one account's leads into the next ---- */
  {
    const { w } = boot((r) => {
      if (/workspaces/.test(r.url)) return { status: 200, json: [{ id: 'ws-1' }] };
      if (isLeads(r)) return { status: 200, json: [ROW({ name: 'Confidential Client' })] };
      return { status: 200, json: [] };
    });
    await wait(340); signInReal(w);
    w.getLeads(); await wait(80);
    ok(w.getLeads().length === 1, 'leak', 'setup failed');
    w.AUTH.logout(); await wait(40);
    ok(w.LEADS.rows.length === 0, 'leak', "the previous account's leads are still in memory after sign-out");
    w.demoLogin(); await wait(60);
    ok(!w.getLeads().some((l) => l.name === 'Confidential Client'), 'leak', "a real account's lead appeared in the demo");
  }

  console.log('=== §7/§8 lead storage ===');
  console.log('passed: ' + pass);
  if (bad.length) { console.log('FAILED: ' + bad.length); bad.forEach((b) => console.log('   ' + b)); process.exit(1) }
  else console.log('Supabase is the source of truth; demo stays local');
})();
