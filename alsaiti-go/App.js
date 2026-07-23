import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView, ScrollView, View, Text, Pressable, TextInput, StyleSheet, StatusBar,
  Platform, Dimensions, KeyboardAvoidingView, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Rect, Defs, RadialGradient, Stop, Polygon } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';

/* ---------- Brand palette (mirrors alsaitigrowth.com) ---------- */
const C = {
  bg: '#020B1F', card: 'rgba(11,27,58,0.72)', cardHi: 'rgba(15,34,68,0.9)',
  primary: '#3AA6FF', cyan: '#59C7FF', glow: '#1E90FF', text: '#F5F9FF', muted: '#93A8C7',
  border: 'rgba(83,167,255,0.18)', borderHi: 'rgba(89,199,255,0.4)',
  green: '#57E39A', amber: '#FBBF5A', red: '#FF7A8A',
};
const STATUSES = ['New', 'Contacted', 'Qualified', 'Booked', 'Won', 'Lost', 'Spam'];
const SOURCES = ['Voice call', 'Website chat', 'Contact form', 'Manual import', 'API', 'CRM'];
const URGENCIES = ['High', 'Medium', 'Low'];
const STATUS_COLOR = { New: C.cyan, Contacted: '#C3D3EA', Qualified: '#B6A9FF', Booked: '#7BF0B4', Won: C.green, Lost: '#FF9AA6', Spam: '#8EA0BD' };

/* ---------- Icons ---------- */
const ICONS = {
  grid: <><Rect x="3" y="3" width="7" height="7" rx="1.5" /><Rect x="14" y="3" width="7" height="7" rx="1.5" /><Rect x="3" y="14" width="7" height="7" rx="1.5" /><Rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  users: <><Circle cx="9" cy="8" r="3.2" /><Path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><Path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 20a5.2 5.2 0 0 0-3-4.7" /></>,
  mic: <><Rect x="9" y="3" width="6" height="11" rx="3" /><Path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  chart: <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  cog: <><Circle cx="12" cy="12" r="3.2" /><Path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></>,
  plus: <Path d="M12 5v14M5 12h14" />,
  check: <Path d="M20 6 9 17l-5-5" />,
  back: <Path d="M15 6l-6 6 6 6" />,
  trash: <Path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  logout: <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  bolt: <Path d="M13 2 4 14h6l-1 8 9-12h-6z" />,
  phone: <Path d="M6 3h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z" />,
  chat: <Path d="M4 5h16v11H8l-4 4z" />,
  send: <Path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />,
  crm: <><Rect x="3" y="4" width="18" height="16" rx="2" /><Path d="M3 9h18M9 4v16" /></>,
  plug: <Path d="M9 2v6M15 2v6M6 8h12v2a6 6 0 0 1-12 0zM12 20v2" />,
  activity: <Path d="M3 12h4l3 8 4-16 3 8h4" />,
  sheet: <><Rect x="3" y="3" width="18" height="18" rx="2" /><Path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>,
  cloud: <Path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.3A3.7 3.7 0 0 1 18 18z" />,
  code: <Path d="M8 6l-5 6 5 6M16 6l5 6-5 6" />,
  refresh: <Path d="M20 11a8 8 0 1 0-.9 5M20 5v6h-6" />,
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  pause: <><Rect x="6" y="5" width="4" height="14" rx="1" /><Rect x="14" y="5" width="4" height="14" rx="1" /></>,
  play: <Path d="M7 4l13 8-13 8z" />,
  external: <Path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  shield: <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
};
function Icon({ name, size = 22, color = C.text, sw = 1.8 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name] || null}
    </Svg>
  );
}

/* ---------- Brand mark: the faceted ALSAITI "AG" monogram (matches the website) ----------
   Low-poly A woven with a G — emerald facets, a gold crossbar/spur, thin seams. Pure vector. */
const A_FACETS = [
  ['#37E39C', '58,8 58,20 46,34'],
  ['#37E39C', '58,8 74,20 58,20'],
  ['#22C888', '58,20 58,30 46,34'],
  ['#37E39C', '74,20 58,30 58,20'],
  ['#22C888', '46,34 58,30 58,48'],
  ['#22C888', '58,30 74,20 82,40'],
  ['#15AC72', '49,62 46,34 58,48'],
  ['#15AC72', '46,34 49,62 34,66'],
  ['#22C888', '58,48 58,30 82,40'],
  ['#15AC72', '74,20 92,34 82,40'],
  ['#0D8C5D', '6,110 46,34 34,66'],
  ['#15AC72', '71,54 58,48 82,40'],
  ['#E6C34E', '34,66 49,62 58,74'],
  ['#0A6E4A', '6,110 34,66 20,92'],
  ['#15AC72', '82,40 92,34 99,50'],
  ['#E6C34E', '58,74 49,62 60,66'],
  ['#0A6E4A', '34,66 52,90 20,92'],
  ['#0D8C5D', '93,58 71,54 82,40'],
  ['#C79A32', '52,90 34,66 58,74'],
  ['#E6C34E', '60,66 70,62 67,68'],
  ['#E6C34E', '58,74 60,66 67,68'],
  ['#0D8C5D', '93,58 82,40 99,50'],
  ['#075336', '30,108 6,110 20,92'],
  ['#0D8C5D', '92,34 104,60 99,50'],
  ['#C79A32', '58,74 67,68 63,80'],
  ['#C79A32', '70,62 70,80 67,68'],
  ['#0A6E4A', '52,90 30,108 20,92'],
  ['#C79A32', '52,90 58,74 63,80'],
  ['#C79A32', '67,68 70,80 63,80'],
  ['#0D8C5D', '104,60 93,58 99,50'],
  ['#0A6E4A', '60,90 52,90 63,80'],
  ['#C79A32', '70,80 60,90 63,80'],
  ['#0A6E4A', '93,58 104,60 101,72'],
  ['#0A6E4A', '60,90 70,80 66,94'],
  ['#0A6E4A', '91,83 93,58 101,72'],
  ['#0A6E4A', '60,109 60,90 66,94'],
  ['#0A6E4A', '70,80 88,97 66,94'],
  ['#0A6E4A', '104,60 99,88 101,72'],
  ['#075336', '70,80 91,83 88,97'],
  ['#0A6E4A', '99,88 91,83 101,72'],
  ['#075336', '60,109 66,94 74,104'],
  ['#0A6E4A', '66,94 88,97 74,104'],
  ['#075336', '91,83 99,88 88,97'],
  ['#075336', '82,105 60,109 74,104'],
  ['#075336', '88,97 82,105 74,104'],
  ['#075336', '99,88 82,105 88,97'],
];
function ALogo({ size = 34 }) {
  return (
    <Svg width={size} height={size * (116 / 120)} viewBox="0 0 120 116">
      {A_FACETS.map((f, i) => (
        <Polygon key={i} points={f[1]} fill={f[0]} stroke="#0A1428" strokeWidth={0.9} strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

/* ---------- Ambient background ---------- */
const { width: SW, height: SH } = Dimensions.get('window');
function BackgroundGlow() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={SW} height={SH}>
        <Defs>
          <RadialGradient id="g1" cx={SW * 0.85} cy={SH * -0.05} r={SW * 0.95} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#1E90FF" stopOpacity={0.28} /><Stop offset="1" stopColor="#1E90FF" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="g2" cx={SW * -0.1} cy={SH * 0.28} r={SW * 0.95} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#3AA6FF" stopOpacity={0.15} /><Stop offset="1" stopColor="#3AA6FF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={SW} height={SH} fill="url(#g1)" />
        <Rect x="0" y="0" width={SW} height={SH} fill="url(#g2)" />
      </Svg>
    </View>
  );
}

/* ---------- Storage ---------- */
const store = {
  get: async (k, d) => { try { const v = await AsyncStorage.getItem(k); if (v == null) return d; const p = JSON.parse(v); return p == null ? d : p; } catch (e) { return d; } },
  set: async (k, v) => { try { await AsyncStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del: async (k) => { try { await AsyncStorage.removeItem(k); } catch (e) {} },
};

/* ---------- Real authentication (Supabase Auth) ----------------------------
   Passwords are verified and hashed SERVER-SIDE by Supabase and are never written to
   this device — not even as a hash. The device keeps only an email and a short-lived
   JWT. The publishable/anon key below is safe to ship (it is protected by RLS); the
   secret/service-role key must never appear in app code. */
const SUPA = {
  url: 'https://jnxvwdcvnwigowafdxvl.supabase.co',
  anon: 'sb_publishable_fTj566JdyWyCA58y2AU8rQ_l-SmkBXU',
};
const supaAuth = {
  configured: () => !!(SUPA.url && SUPA.anon),
  async _post(path, body) {
    const r = await fetch(SUPA.url.replace(/\/+$/, '') + path, {
      method: 'POST',
      headers: { apikey: SUPA.anon, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let j = {};
    try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(j.msg || j.error_description || j.error || ('HTTP ' + r.status));
    return j;
  },
  // Returns {session:true} when signed in, {session:false} when email confirmation is pending.
  async signUp(email, pass, meta) {
    const j = await this._post('/auth/v1/signup', { email, password: pass, data: meta || {} });
    if (j.access_token) { await store.set('av_token', { t: j.access_token, r: j.refresh_token, email }); return { session: true }; }
    return { session: false };
  },
  async signIn(email, pass) {
    const j = await this._post('/auth/v1/token?grant_type=password', { email, password: pass });
    await store.set('av_token', { t: j.access_token, r: j.refresh_token, email });
    return { session: true };
  },
  async signOut() { await store.del('av_token'); },
};
/* Map Supabase's raw auth errors to something a business owner can act on. */
function authErrorText(m) {
  m = String(m || '');
  if (/Invalid login credentials/i.test(m)) return 'Incorrect email or password.';
  if (/already registered/i.test(m)) return 'That email already has an account — sign in instead.';
  if (/Password should be at least/i.test(m)) return 'Password must be at least 8 characters.';
  if (/Email not confirmed/i.test(m)) return 'Please confirm your email first — check your inbox.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a minute and try again.';
  if (/Network request failed|fetch/i.test(m)) return 'Could not reach the secure server. Check your connection.';
  return m;
}

/* ---------- Helpers ---------- */
const uid = () => 'LD-' + Math.random().toString(36).slice(2, 7).toUpperCase();
const initials = (n) => String(n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const cap = (s) => { s = (s || '').trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; };
const scoreColor = (v) => (v > 75 ? C.green : v > 50 ? C.cyan : '#ff9aa6');
function legacyHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); }
/* Salted, iterated SHA-256 password hashing (replaces the old reversible/weak scheme) */
function sha256hex(str) {
  var ascii; try { ascii = unescape(encodeURIComponent(String(str))); } catch (e) { ascii = String(str); }
  function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
  var maxWord = Math.pow(2, 32), result = '', i, j;
  var words = [], asciiBitLength = ascii.length * 8;
  var hash = sha256hex.h = sha256hex.h || [], k = sha256hex.k = sha256hex.k || [];
  var primeCounter = k.length, isComposite = {};
  for (var candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while (ascii.length % 64 - 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i); if (j >> 8) j = 63;
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (j = 0; j < words.length;) {
    var w = words.slice(j, j += 16), oldHash = hash;
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
      var t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i]
        + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
      var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(t1 + t2) | 0].concat(hash); hash[4] = (hash[4] + t1) | 0;
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (i = 0; i < 8; i++) { for (j = 3; j + 1; j--) { var b = (hash[i] >> (j * 8)) & 255; result += ((b < 16) ? 0 : '') + b.toString(16); } }
  return result;
}
const HASH_ITER = 1024;
const hashPass = (pass, salt) => { let h = salt + '|' + pass; for (let i = 0; i < HASH_ITER; i++) h = sha256hex(h); return h; };
const makeSalt = () => { let out = Date.now().toString(16); for (let i = 0; i < 4; i++) out += (Math.floor(Math.random() * 0xffffffff) >>> 0).toString(16).padStart(8, '0'); return out.slice(0, 32); };
const passOK = (p) => typeof p === 'string' && p.length >= 8 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);
function ago(t) {
  const s = Math.floor((Date.now() - t) / 1000); if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24); return d === 1 ? 'Yesterday' : d + 'd ago';
}
function parseUrgency(s) {
  s = (s || '').toLowerCase();
  if (/(not|n['’]t|no\s+es|no\s+|nada\s+|ليس\s*|غير\s*|مش\s*)\s*(urgent|urgente|عاجل)/.test(s)) return 'Low';
  if (/urgent|asap|emergency|today|right now|straight away|leak|no hot water|broken|urgente|hoy|emergencia|عاجل|طارئ|اليوم/.test(s)) return 'High';
  if (/no|not|just|browsing|later|whenever|no rush|enquiry|quote|no hay prisa|más tarde|luego|لاحقا|استفسار/.test(s)) return 'Low';
  return 'Medium';
}
/* ---------- Smart receptionist: validate answers, re-ask on gibberish ---------- */
const VRETRY = {
  en: { name: "Sorry, I didn't quite catch your name — could you tell me your name, please?", service: 'I want to note this down correctly — how can we help you today?', urgency: 'Just so I prioritise this correctly — is it urgent, or are you planning ahead?', phone: "Hmm, that doesn't look like a phone number. What's the best number to reach you on, including the area code?" },
  es: { name: 'Perdone, no he captado bien su nombre. ¿Me podría decir su nombre, por favor?', service: 'Quiero anotarlo correctamente. ¿En qué podemos ayudarle hoy?', urgency: 'Solo para priorizarlo bien: ¿es urgente o lo está planificando con antelación?', phone: 'Mmm, eso no parece un número de teléfono. ¿Cuál es el mejor número para localizarle, con el prefijo incluido?' },
  ar: { name: 'عذرًا، لم ألتقط اسمك جيدًا — هل لي أن أعرف اسمك، من فضلك؟', service: 'أريد تدوين ذلك بدقة — كيف يمكننا مساعدتك اليوم؟', urgency: 'فقط لأرتّب الأولوية بشكل صحيح: هل الأمر عاجل أم أنك تخطّط له مسبقًا؟', phone: 'يبدو أن هذا ليس رقم هاتف. ما أفضل رقم يمكننا التواصل معك عليه، مع رمز المنطقة؟' },
};
function vHasLetter(s) { return /[A-Za-zÀ-ɏ؀-ۿ]/.test(String(s || '')); }
function vDigitsCount(s) { return (normDigits(String(s || '')).match(/\d/g) || []).length; }
function validName(s) { s = String(s || '').trim(); return s.length >= 1 && s.length <= 60 && vHasLetter(s); }
function validService(s) { s = String(s || '').trim(); return s.length >= 2 && vHasLetter(s); }
function validPhone(s) { return vDigitsCount(s) >= 7; }
function isRefusal(s) { s = ' ' + String(s || '').toLowerCase() + ' '; return /\b(no|nope|nah|skip|later|luego|لا)\b/.test(s) || /rather not|prefer not|don'?t have|no thanks|no gracias|prefiero no|call me|email me|لا شكرا|لاحقا|تخطي/.test(s); }
function clearUrgency(s) { s = ' ' + String(s || '').toLowerCase() + ' '; return /(urgent|asap|emergency|today|right now|straight away|leak|no hot water|broken|soon|plan|ahead|no rush|whenever|browsing|quote|enquiry|urgente|hoy|emergencia|prisa|luego|más tarde|planific|عاجل|طارئ|اليوم|لاحق|لا يوجد|ليس|تخطيط)/.test(s) || /\b(yes|no|yeah|yep|nope|sí|si|نعم|لا)\b/.test(s); }
function validateAnswer(key, v) {
  if (key === 'name') return { ok: validName(v), field: 'name', max: 1 };
  if (key === 'service') return { ok: validService(v), field: 'service', max: 1 };
  if (key === 'urgency') return { ok: clearUrgency(v), field: 'urgency', max: 1 };
  if (key === 'phone') return { ok: validPhone(v) || isRefusal(v), field: 'phone', max: 1 };
  return { ok: true };
}
function seedLeads() {
  const now = Date.now(), m = 60000, h = 3600000, d = 86400000;
  return [
    { id: uid(), name: 'Sarah Whitfield', service: 'Dental implant consult', urgency: 'High', source: 'Voice call', status: 'New', score: 92, at: now - 3 * m, phone: '+44 7700 900112', email: 'sarah.w@example.com', summary: 'Caller asking about implant options after losing a molar. Wants the earliest appointment; mentioned pain when chewing.', notes: '', assignee: 'Front desk' },
    { id: uid(), name: 'James Okoro', service: 'Boiler not firing', urgency: 'High', source: 'Website chat', status: 'New', score: 88, at: now - 11 * m, phone: '+44 7700 900431', email: 'j.okoro@example.com', summary: 'No hot water since morning, family with a young child. Requesting a same-day engineer visit.', notes: '', assignee: 'Unassigned' },
    { id: uid(), name: 'Priya Nair', service: '2-bed flat viewing', urgency: 'Medium', source: 'Contact form', status: 'Contacted', score: 74, at: now - 42 * m, phone: '+44 7700 900677', email: 'priya.n@example.com', summary: 'Interested in the Docklands 2-bed listing, asking about availability and pet policy.', notes: 'Sent listing brochure by email.', assignee: 'Layla A.' },
    { id: uid(), name: 'Tom Bradley', service: 'Botox consultation', urgency: 'Low', source: 'Website chat', status: 'Qualified', score: 69, at: now - 1 * h, phone: '+44 7700 900988', email: 'tom.b@example.com', summary: 'First-time aesthetic client, comparing clinics, price-sensitive but ready to book a consult.', notes: 'Offered new-client consult slot.', assignee: 'Reception' },
    { id: uid(), name: 'Amelia Cross', service: 'Kitchen leak repair', urgency: 'High', source: 'Voice call', status: 'Booked', score: 81, at: now - 2 * h, phone: '+44 7700 900233', email: 'amelia.c@example.com', summary: 'Under-sink leak, water contained. Booked engineer for Thursday morning.', notes: 'Engineer: Mike. Parts pre-ordered.', assignee: 'Dispatch' },
    { id: uid(), name: 'Grace Oduya', service: 'Property valuation', urgency: 'Medium', source: 'API', status: 'Won', score: 77, at: now - 1 * d, phone: '+44 7700 900555', email: 'grace.o@example.com', summary: 'Requested a valuation for a semi-detached; instructed the agency to list.', notes: 'Listing agreement signed.', assignee: 'Layla A.' },
    { id: uid(), name: 'Oliver Payne', service: 'Invisalign quote', urgency: 'Low', source: 'Manual import', status: 'Lost', score: 41, at: now - 1 * d - 3 * h, phone: '+44 7700 900744', email: 'oliver.p@example.com', summary: 'Requested a quote, went with a competitor closer to home.', notes: 'Marked lost after 3 attempts.', assignee: 'Reception' },
  ];
}

/* ---------- CRM integrations (n8n sync layer — demo simulation, mirrors the web) ---------- */
const CRM_PROVIDERS = [
  { id: 'generic_webhook', name: 'Generic Webhook', accent: '#59C7FF', icon: 'plug', kind: 'core', entity: 'payload', desc: 'Send signed JSON to any endpoint' },
  { id: 'hubspot', name: 'HubSpot', accent: '#FF7A59', icon: 'crm', kind: 'core', entity: 'deal', desc: 'Contacts, deals, notes & tasks' },
  { id: 'pipedrive', name: 'Pipedrive', accent: '#1EA64A', icon: 'chart', kind: 'core', entity: 'deal', desc: 'Persons, deals & activities' },
  { id: 'highlevel', name: 'GoHighLevel', accent: '#2A9DF4', icon: 'activity', kind: 'core', entity: 'opportunity', desc: 'Contacts, opportunities & tags' },
  { id: 'google_sheets', name: 'Google Sheets', accent: '#0F9D58', icon: 'sheet', kind: 'core', entity: 'row', desc: 'Append a row per lead' },
  { id: 'salesforce', name: 'Salesforce', accent: '#00A1E0', icon: 'cloud', kind: 'soon', desc: 'Leads, contacts & opportunities' },
  { id: 'zoho', name: 'Zoho CRM', accent: '#E42527', icon: 'crm', kind: 'soon', desc: 'Leads, deals & activities' },
  { id: 'dynamics', name: 'Microsoft Dynamics 365', accent: '#0B53CE', icon: 'grid', kind: 'soon', desc: 'Leads, opportunities & tasks' },
  { id: 'custom_api', name: 'Custom API', accent: '#7E6FEF', icon: 'code', kind: 'custom', entity: 'record', desc: 'Any API or webhook-based system' },
];
const CRM_TRIGGERS = [['lead.created', 'When a lead is created'], ['lead.qualified', 'When a lead is qualified'], ['lead.booked', 'When a lead is booked'], ['lead.won', 'When a lead is won'], ['lead.status_changed', 'When status changes'], ['call.completed', 'When a call completes'], ['chat.completed', 'When a chat completes']];
const CRM_ACTIONS = [['contact', 'Create / update contact'], ['company', 'Create company / organisation'], ['deal', 'Create deal / opportunity'], ['note', 'Add note'], ['task', 'Create task / activity'], ['tags', 'Apply tags'], ['owner', 'Assign owner'], ['workflow', 'Trigger workflow']];
const crmProviderN = (id) => CRM_PROVIDERS.find((p) => p.id === id) || null;
const crmRand = (n) => { let out = ''; const c = '0123456789abcdefghijklmnopqrstuvwxyz'; for (let i = 0; i < (n || 10); i++) out += c[Math.floor(Math.random() * c.length)]; return out; };
function crmExtId(prov) {
  if (prov === 'hubspot') return String(Math.floor(2e9 + Math.random() * 8e9));
  if (prov === 'pipedrive') return String(Math.floor(100 + Math.random() * 9000));
  if (prov === 'google_sheets') return 'row-' + Math.floor(2 + Math.random() * 400);
  return crmRand(12);
}
function crmRecordUrl(conn, ext) {
  const p = conn.provider, id = (ext && (ext.contact || ext.deal)) || '';
  if (p === 'hubspot') return 'https://app.hubspot.com/contacts/' + (conn.portal || '24428135') + '/record/0-1/' + id;
  if (p === 'pipedrive') return 'https://alsaiti.pipedrive.com/person/' + id;
  if (p === 'highlevel') return 'https://app.gohighlevel.com/contacts/detail/' + id;
  if (p === 'google_sheets') return 'https://docs.google.com/spreadsheets/d/1AlsaitiDemoLeadsSheet/edit#gid=0';
  return conn.account || '';
}
function crmActionsList(conn, created) {
  const out = [];
  (conn.actions || []).forEach((a) => {
    if (a === 'contact') out.push('contact' + (created ? '.created' : '.updated'));
    else if (a === 'deal') out.push((conn.provider === 'highlevel' ? 'opportunity' : 'deal') + '.created');
    else if (a === 'company') out.push('company' + (created ? '.created' : '.updated'));
    else if (a === 'note') out.push('note.created');
    else if (a === 'task') out.push('task.created');
    else if (a === 'tags') out.push('tags.applied');
    else if (a === 'owner') out.push('owner.assigned');
    else if (a === 'workflow') out.push('workflow.triggered');
  });
  return out;
}
function crmDefaultMapping() {
  return [['name', 'Contact name'], ['phone', 'Mobile phone'], ['email', 'Email'], ['service', 'Deal title'], ['score', 'Lead score'], ['urgency', 'Priority'], ['source', 'Lead source'], ['summary', 'Note'], ['callback', 'Activity due time']].map((m) => ({ from: m[0], to: m[1] }));
}
function crmClone(crm) { return { mode: crm.mode || 'hybrid', conns: crm.conns.map((c) => ({ ...c })), events: crm.events.slice(), syncs: { ...crm.syncs }, attempts: crm.attempts.slice() }; }
function crmRecordSync(crm, conn, lead, fail, ts) {
  ts = ts || Date.now(); const key = conn.id + '|' + lead.id, evId = 'evt_' + crmRand(20);
  if (fail) {
    crm.syncs[key] = { connection_id: conn.id, provider: conn.provider, lead_id: lead.id, lead_name: lead.name, status: 'failed', ext: {}, last_synced: null, error: { code: 'RATE_LIMITED', retryable: true }, updated: ts, url: '' };
    crm.attempts.unshift({ id: 'att_' + crmRand(6), event_id: evId, conn: conn.id, provider: conn.provider, lead_id: lead.id, lead_name: lead.name, event_type: 'lead.created', status: 'failed', code: 429, error: 'RATE_LIMITED', at: ts });
    crm.events.unshift({ event_id: evId, event_type: 'lead.created', entity_id: lead.id, lead_name: lead.name, status: 'failed', at: ts });
  } else {
    const ext = { contact: crmExtId(conn.provider) };
    if ((conn.actions || []).indexOf('deal') >= 0) ext.deal = crmExtId(conn.provider);
    crm.syncs[key] = { connection_id: conn.id, provider: conn.provider, lead_id: lead.id, lead_name: lead.name, status: 'synced', ext, last_synced: ts, error: null, updated: ts, url: crmRecordUrl(conn, ext) };
    crm.attempts.unshift({ id: 'att_' + crmRand(6), event_id: evId, conn: conn.id, provider: conn.provider, lead_id: lead.id, lead_name: lead.name, event_type: 'lead.created', status: 'success', code: 201, actions: crmActionsList(conn, true), at: ts });
    crm.events.unshift({ event_id: evId, event_type: 'lead.created', entity_id: lead.id, lead_name: lead.name, status: 'processed', at: ts });
  }
}
function crmSeed(leads) {
  const now = Date.now(), m = 60000, h = 3600000, day = 86400000;
  const conn = { id: 'conn_hub_demo', provider: 'hubspot', name: 'HubSpot', status: 'connected', account: 'Bright Smile Dental', portal: '24428135', sync_enabled: true, triggers: ['lead.created', 'lead.status_changed', 'lead.qualified', 'lead.booked', 'lead.won'], actions: ['contact', 'deal', 'note'], pipeline: 'Sales Pipeline', stage: 'New Lead', owner: 'Front desk', tags: ['alsaiti-voice', 'voice-call'], mapping: crmDefaultMapping(), synced: 0, last_success: now - 9 * m, last_failure: null, last_error: null, connected_at: now - 6 * day, tested_at: now - 9 * m, health: 'healthy' };
  const crm = { mode: 'hybrid', conns: [conn], events: [], syncs: {}, attempts: [] };
  (leads || []).slice(0, 4).forEach((l, i) => { crmRecordSync(crm, conn, l, i === 3, now - ((i + 1) * 23) * m); });
  conn.synced = Math.min(3, (leads || []).length);
  if ((leads || []).length > 3) { conn.last_failure = now - 2 * h; conn.last_error = { code: 'RATE_LIMITED', retryable: true }; conn.health = 'attention'; }
  return crm;
}
function crmEmit(crm, eventType, lead) {
  if (!lead || !lead.id) return crm;
  if (crm.mode === 'internal') return crm;
  const nx = crmClone(crm);
  const routed = nx.conns.filter((c) => c.sync_enabled && c.status === 'connected' && (c.triggers || []).indexOf(eventType) >= 0);
  const evId = 'evt_' + crmRand(22);
  nx.events.unshift({ event_id: evId, event_type: eventType, entity_id: lead.id, lead_name: lead.name, status: routed.length ? 'processed' : 'no_route', at: Date.now() });
  if (nx.events.length > 60) nx.events.length = 60;
  routed.forEach((c) => {
    const key = c.id + '|' + lead.id, existing = nx.syncs[key];
    const ext = (existing && existing.ext && existing.ext.contact) ? { ...existing.ext } : { contact: crmExtId(c.provider) };
    if ((c.actions || []).indexOf('deal') >= 0 && !ext.deal) ext.deal = crmExtId(c.provider);
    const isUpdate = !!(existing && existing.status === 'synced');
    nx.syncs[key] = { connection_id: c.id, provider: c.provider, lead_id: lead.id, lead_name: lead.name, status: 'synced', ext, last_synced: Date.now(), error: null, updated: Date.now(), url: crmRecordUrl(c, ext) };
    if (!isUpdate) c.synced = (c.synced || 0) + 1;
    c.last_success = Date.now(); c.health = 'healthy'; c.last_error = null;
    nx.attempts.unshift({ id: 'att_' + crmRand(6), event_id: evId, conn: c.id, provider: c.provider, lead_id: lead.id, lead_name: lead.name, event_type: eventType, status: 'success', code: isUpdate ? 200 : 201, actions: crmActionsList(c, !isUpdate), at: Date.now() });
  });
  if (nx.attempts.length > 80) nx.attempts.length = 80;
  return nx;
}
function crmStatusEvents(status) { const out = ['lead.status_changed']; const m = { Qualified: 'lead.qualified', Booked: 'lead.booked', Won: 'lead.won' }; if (m[status]) out.push(m[status]); return out; }
function crmLeadSyncs(crm, leadId) {
  const out = []; if (!crm) return out;
  Object.keys(crm.syncs).forEach((k) => { const r = crm.syncs[k]; if (r.lead_id === leadId) { const c = crm.conns.find((x) => x.id === r.connection_id); if (c && c.status !== 'disconnected') out.push(r); } });
  return out;
}
function crmLeadStatus(crm, leadId) {
  const rs = crmLeadSyncs(crm, leadId); if (!rs.length) return null;
  if (rs.some((r) => r.status === 'failed')) return 'failed';
  if (rs.some((r) => r.status === 'synced')) return 'synced';
  return 'pending';
}

/* ---------- Small UI ---------- */
const Avatar = ({ name, size = 38 }) => (
  <LinearGradient colors={[C.primary, C.glow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
    style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.34 }}>{initials(name)}</Text>
  </LinearGradient>
);
const Badge = ({ label, color }) => (
  <View style={[s.badge, { borderColor: color + '66', backgroundColor: color + '22' }]}>
    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{label}</Text>
  </View>
);
const Chip = ({ label, active, onPress }) => (
  <Pressable onPress={onPress} style={[s.chip, active && s.chipActive]}>
    <Text style={{ color: active ? '#04223f' : C.muted, fontSize: 13, fontWeight: '700' }}>{label}</Text>
  </Pressable>
);
const GradientBtn = ({ label, icon, onPress, colors = [C.primary, C.glow], textColor = '#04223f', style }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }, style]}>
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.gradBtn}>
      {icon ? <Icon name={icon} size={18} color={textColor} sw={2} /> : null}
      <Text style={[s.gradBtnText, { color: textColor }]}>{label}</Text>
    </LinearGradient>
  </Pressable>
);
const Field = ({ label, ...props }) => (
  <View style={{ marginBottom: 14 }}>
    {label ? <Text style={s.label}>{label}</Text> : null}
    <TextInput placeholderTextColor={C.muted} style={s.input} {...props} />
  </View>
);
const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;
const H = ({ title, sub, right }) => (
  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 }}>
    <View style={{ flex: 1 }}>
      <Text style={s.h1}>{title}</Text>
      {sub ? <Text style={s.sub}>{sub}</Text> : null}
    </View>
    {right}
  </View>
);
function LeadCard({ lead, onPress, sync }) {
  const syncColor = sync === 'synced' ? C.green : sync === 'failed' ? '#ff9aa6' : C.cyan;
  const syncLabel = sync === 'synced' ? 'Synced' : sync === 'failed' ? 'Failed' : 'Pending';
  return (
    <Pressable onPress={onPress} style={s.leadCard}>
      <Avatar name={lead.name} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={s.leadName} numberOfLines={1}>{lead.name}</Text>
          <View style={{ flex: 1 }} />
          <Badge label={lead.status} color={STATUS_COLOR[lead.status] || C.muted} />
        </View>
        <Text style={s.leadSub} numberOfLines={1}>{lead.service || '—'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <Text style={s.leadMeta}>{lead.source}</Text>
          <Text style={s.leadMeta}>· {lead.urgency}</Text>
          <Text style={s.leadMeta}>· {ago(lead.at)}</Text>
          {sync ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: syncColor }} />
              <Text style={{ color: syncColor, fontSize: 10, fontWeight: '700' }}>{syncLabel}</Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          <Text style={{ color: scoreColor(lead.score), fontWeight: '700', fontSize: 12 }}>{lead.score}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/* ---------- Landing ---------- */
function Landing({ onDemo, onGetStarted, onSignin }) {
  const feats = [
    ['phone', 'Answer every call', 'AI voice assistant greets callers, qualifies them and books or transfers — 24/7.'],
    ['chat', 'Website chat', 'Turns website visitors into qualified leads, day and night.'],
    ['chart', 'One clear dashboard', 'New, urgent and callback leads plus your best sources, at a glance.'],
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <ALogo size={34} />
        <Text style={{ color: C.text, fontWeight: '700', fontSize: 17 }}>Alsaiti Growth</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onSignin} style={s.ghostBtn}><Text style={s.ghostBtnText}>Sign in</Text></Pressable>
      </View>
      <View style={{ alignItems: 'center', paddingVertical: 34 }}>
        <View style={[s.badge, { borderColor: C.borderHi, backgroundColor: 'rgba(58,166,255,0.14)', marginBottom: 16 }]}>
          <Icon name="bolt" size={13} color={C.cyan} sw={2} /><Text style={{ color: C.cyan, fontSize: 11, fontWeight: '700' }}>AI voice & chat lead capture</Text>
        </View>
        <Text style={s.heroTitle}>Never lose another enquiry.</Text>
        <Text style={s.heroSub}>Alsaiti Growth answers your calls and website chats, qualifies every enquiry, creates a lead, and alerts your team — so nothing slips through.</Text>
        <GradientBtn label="View live demo" icon="bolt" onPress={onDemo} style={{ marginTop: 24, alignSelf: 'stretch' }} />
        <Pressable onPress={onGetStarted} style={[s.ghostBtn, { marginTop: 12, alignSelf: 'stretch', alignItems: 'center', paddingVertical: 14 }]}><Text style={s.ghostBtnText}>Start free</Text></Pressable>
      </View>
      {feats.map((f) => (
        <Card key={f[1]} style={{ marginBottom: 12 }}>
          <View style={s.featIcon}><Icon name={f[0]} size={20} color={C.cyan} /></View>
          <Text style={s.cardTitle}>{f[1]}</Text>
          <Text style={s.body}>{f[2]}</Text>
        </Card>
      ))}
      <Text style={{ color: C.muted, textAlign: 'center', fontSize: 12, marginTop: 20 }}>Built for dental & aesthetic clinics, home services, real estate and more.</Text>
    </ScrollView>
  );
}

/* ---------- Auth ---------- */
function AuthScreen({ mode, error, onSubmit, onSwitch, onBack }) {
  const [name, setName] = useState('');
  const [biz, setBiz] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const isSignup = mode === 'signup';
  return (
    <KeyboardAvoidingView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 22, paddingTop: 40 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 }}>
          <Icon name="back" size={18} color={C.muted} /><Text style={{ color: C.muted }}>Back</Text>
        </Pressable>
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <ALogo size={48} />
          <Text style={{ color: C.text, fontSize: 21, fontWeight: '800', marginTop: 12 }}>{isSignup ? 'Create your account' : 'Welcome back'}</Text>
          <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{isSignup ? 'Start capturing every enquiry.' : 'Sign in to your lead workspace.'}</Text>
        </View>
        <Card style={{ marginTop: 14 }}>
          {isSignup ? <Field label="Your name" value={name} onChangeText={setName} placeholder="Alex Carter" /> : null}
          {isSignup ? <Field label="Business name" value={biz} onChangeText={setBiz} placeholder="Bright Smile Dental" /> : null}
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@business.com" autoCapitalize="none" keyboardType="email-address" />
          <Field label="Password" value={pass} onChangeText={setPass} placeholder="At least 8 characters (letters & numbers)" secureTextEntry />
          {error ? <Text style={{ color: '#ff9aa6', fontSize: 13, marginBottom: 8 }}>{error}</Text> : null}
          <GradientBtn label={isSignup ? 'Create account' : 'Sign in'} onPress={() => onSubmit({ name, biz, email, pass })} />
          <Pressable onPress={onSwitch} style={{ marginTop: 14, alignItems: 'center' }}>
            <Text style={{ color: C.muted, fontSize: 13 }}>{isSignup ? 'Have an account? ' : 'New here? '}<Text style={{ color: C.cyan, fontWeight: '700' }}>{isSignup ? 'Sign in' : 'Create account'}</Text></Text>
          </Pressable>
        </Card>
        <Text style={{ color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 16 }}>Your account is stored on this device.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ---------- Status donut ---------- */
const FUNNEL_COLORS = ['#59C7FF', '#4FB6F2', '#57C4C9', '#69D5A8', '#57E39A'];
function StatusDonut({ counts, total }) {
  const R = 54, CIRC = 2 * Math.PI * R, cx = 70, cy = 70, tot = total || 1;
  let accLen = 0; const segs = [];
  STATUSES.forEach((st) => { const v = counts[st] || 0; if (v <= 0) return; const segLen = (v / tot) * CIRC; segs.push({ color: STATUS_COLOR[st] || C.muted, segLen, offset: -accLen }); accLen += segLen; });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <View style={{ width: 140, height: 140 }}>
        <Svg width={140} height={140}>
          <Circle cx={cx} cy={cy} r={R} stroke="rgba(148,163,199,0.15)" strokeWidth={16} fill="none" />
          {segs.map((sg, i) => (
            <Circle key={i} cx={cx} cy={cy} r={R} stroke={sg.color} strokeWidth={16} fill="none" strokeDasharray={sg.segLen + ' ' + CIRC} strokeDashoffset={sg.offset} transform={'rotate(-90 ' + cx + ' ' + cy + ')'} />
          ))}
        </Svg>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.text, fontSize: 28, fontWeight: '800' }}>{total}</Text>
          <Text style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Leads</Text>
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 150 }}>
        {STATUSES.map((st) => { const v = counts[st] || 0, pct = Math.round(v / tot * 100); return (
          <View key={st} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5, borderTopWidth: st === 'New' ? 0 : 1, borderTopColor: C.border }}>
            <View style={{ width: 11, height: 11, borderRadius: 4, backgroundColor: STATUS_COLOR[st] || C.muted }} />
            <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>{st}</Text>
            <Text style={{ color: C.text, fontWeight: '800', fontSize: 13 }}>{v}</Text>
            <Text style={{ color: C.muted, fontSize: 12, width: 40, textAlign: 'right' }}>{pct}%</Text>
          </View>
        ); })}
      </View>
    </View>
  );
}

/* ---------- Dashboard ---------- */
function Dashboard({ leads, onOpen, onNew, crm, onboard, onTest, onSetup }) {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const today = leads.filter((l) => l.at >= dayStart.getTime()).length;
  const urgent = leads.filter((l) => l.urgency === 'High' && ['New', 'Contacted', 'Qualified'].includes(l.status)).length;
  const won = leads.filter((l) => l.status === 'Won').length;
  const active = leads.filter((l) => ['New', 'Contacted', 'Qualified', 'Booked'].includes(l.status)).length;
  const stats = [['Leads today', today], ['High priority', urgent], ['Active pipeline', active], ['Won', won]];
  const counts = {}; STATUSES.forEach((st) => { counts[st] = leads.filter((l) => l.status === st).length; });
  const attention = leads.filter((l) => ['New', 'Qualified'].includes(l.status)).sort((a, b) => b.at - a.at).slice(0, 5);
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <H title="Dashboard" sub="Who's arrived, who's urgent, what needs action." right={<Pressable onPress={onNew} style={s.iconBtn}><Icon name="plus" size={18} color={C.cyan} sw={2} /></Pressable>} />
      {(!onboard || onboard.status !== 'complete') ? (
        <Pressable onPress={onSetup} style={s.setupBanner}>
          <View style={s.setupIcon}><Icon name="bolt" size={20} color={C.cyan} /></View>
          <View style={{ flex: 1 }}><Text style={{ color: C.text, fontWeight: '800', fontSize: 14 }}>Finish setting up your workspace</Text><Text style={s.leadMeta}>A guided setup configures your assistant, services & CRM.</Text></View>
          <Icon name="arrow" size={18} color={C.cyan} />
        </Pressable>
      ) : null}
      <View style={s.quickRow}>
        <Pressable style={s.qa} onPress={onNew}><View style={s.qaIcon}><Icon name="plus" size={18} color={C.cyan} /></View><Text style={s.qaText}>New lead</Text></Pressable>
        <Pressable style={s.qa} onPress={onTest}><View style={s.qaIcon}><Icon name="send" size={18} color={C.cyan} /></View><Text style={s.qaText}>Test lead</Text></Pressable>
        <Pressable style={s.qa} onPress={onSetup}><View style={s.qaIcon}><Icon name="cog" size={18} color={C.cyan} /></View><Text style={s.qaText}>Setup</Text></Pressable>
      </View>
      <View style={s.statGrid}>
        {stats.map((st) => (
          <Card key={st[0]} style={s.stat}><Text style={s.statLabel}>{st[0]}</Text><Text style={s.statValue}>{st[1]}</Text></Card>
        ))}
      </View>
      <Text style={s.section}>Leads by status</Text>
      <Card><StatusDonut counts={counts} total={leads.length} /></Card>
      <Text style={s.section}>Needs attention</Text>
      {attention.length ? attention.map((l) => <LeadCard key={l.id} lead={l} sync={crmLeadStatus(crm, l.id)} onPress={() => onOpen(l.id)} />)
        : <Card><Text style={s.body}>Nothing urgent right now — you're all caught up.</Text></Card>}
    </ScrollView>
  );
}

/* ---------- Leads ---------- */
function Leads({ leads, onOpen, onNew, crm }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const query = q.toLowerCase().trim();
  const list = leads
    .filter((l) => filter === 'All' || l.status === filter)
    .filter((l) => !query || (l.name + ' ' + l.service + ' ' + (l.email || '')).toLowerCase().includes(query))
    .sort((a, b) => b.at - a.at);
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <H title="Leads" sub="Every enquiry from calls, chat, forms and more." right={<Pressable onPress={onNew} style={s.iconBtn}><Icon name="plus" size={18} color={C.cyan} sw={2} /></Pressable>} />
      <View style={s.search}>
        <TextInput value={q} onChangeText={setQ} placeholder="Search by name, service or email…" placeholderTextColor={C.muted} style={{ flex: 1, color: C.text, fontSize: 14, paddingVertical: 2 }} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {['All', ...STATUSES].map((c) => <Chip key={c} label={c} active={filter === c} onPress={() => setFilter(c)} />)}
      </ScrollView>
      {list.length ? list.map((l) => <LeadCard key={l.id} lead={l} sync={crmLeadStatus(crm, l.id)} onPress={() => onOpen(l.id)} />)
        : <Card><View style={{ alignItems: 'center', padding: 20 }}><Text style={s.cardTitle}>No matching leads</Text><Text style={s.body}>Try a different search or filter.</Text><GradientBtn label="Add a lead" icon="plus" onPress={onNew} style={{ marginTop: 14 }} /></View></Card>}
    </ScrollView>
  );
}

/* ---------- New lead ---------- */
function NewLead({ onSave, onCancel }) {
  const [f, setF] = useState({ name: '', service: '', phone: '', email: '', urgency: 'Medium', source: 'Manual import', summary: '' });
  const up = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const save = () => {
    if (!f.name.trim() || !f.service.trim()) { Alert.alert('Missing details', 'Name and service are required.'); return; }
    const score = f.urgency === 'High' ? Math.floor(80 + Math.random() * 15) : f.urgency === 'Medium' ? Math.floor(60 + Math.random() * 18) : Math.floor(40 + Math.random() * 18);
    onSave({ id: uid(), name: f.name.trim(), service: f.service.trim(), phone: f.phone.trim(), email: f.email.trim(), urgency: f.urgency, source: f.source, status: 'New', score, at: Date.now(), summary: f.summary.trim(), notes: '', assignee: 'Unassigned' });
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <Pressable onPress={onCancel} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 }}><Icon name="back" size={18} color={C.muted} /><Text style={{ color: C.muted }}>Back</Text></Pressable>
        <H title="New lead" sub="Manually add an enquiry." />
        <Card>
          <Field label="Name *" value={f.name} onChangeText={up('name')} placeholder="Full name" />
          <Field label="Service / enquiry *" value={f.service} onChangeText={up('service')} placeholder="e.g. Boiler repair quote" />
          <Field label="Phone" value={f.phone} onChangeText={up('phone')} placeholder="+44 …" keyboardType="phone-pad" />
          <Field label="Email" value={f.email} onChangeText={up('email')} placeholder="name@example.com" autoCapitalize="none" keyboardType="email-address" />
          <Text style={s.label}>Urgency</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>{URGENCIES.map((u) => <Chip key={u} label={u} active={f.urgency === u} onPress={() => up('urgency')(u)} />)}</View>
          <Text style={s.label}>Source</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>{SOURCES.map((so) => <Chip key={so} label={so} active={f.source === so} onPress={() => up('source')(so)} />)}</ScrollView>
          <Field label="Summary" value={f.summary} onChangeText={up('summary')} placeholder="What does the customer need?" multiline />
          <GradientBtn label="Save lead" icon="check" onPress={save} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ---------- Lead detail ---------- */
function LeadDetail({ lead, onMove, onNote, onDelete, onBack, crmSyncs, onRetry }) {
  const [note, setNote] = useState(lead.notes || '');
  const info = [['Phone', lead.phone || '—'], ['Email', lead.email || '—'], ['Service', lead.service], ['Urgency', lead.urgency], ['Source', lead.source], ['Assignee', lead.assignee || '—']];
  return (
    <KeyboardAvoidingView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="back" size={18} color={C.muted} /><Text style={{ color: C.muted }}>Back</Text></Pressable>
          <View style={{ flex: 1 }} />
          <Badge label={lead.status} color={STATUS_COLOR[lead.status] || C.muted} />
        </View>
        <Text style={s.h1}>{lead.name}</Text>
        <Text style={s.sub}>{lead.id} · score <Text style={{ color: scoreColor(lead.score), fontWeight: '700' }}>{lead.score}</Text> · {ago(lead.at)}</Text>
        <Card style={{ marginTop: 14 }}><Text style={s.cardTitle}>Summary</Text><Text style={s.body}>{lead.summary || 'No summary captured.'}</Text></Card>
        <Card style={{ marginTop: 12 }}>
          <Text style={s.cardTitle}>Move status</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{STATUSES.map((st) => <Chip key={st} label={st} active={st === lead.status} onPress={() => onMove(lead.id, st)} />)}</View>
        </Card>
        <Card style={{ marginTop: 12 }}>
          <Text style={s.cardTitle}>Details</Text>
          {info.map((i) => <View key={i[0]} style={s.kv}><Text style={s.kvK}>{i[0]}</Text><Text style={s.kvV}>{i[1]}</Text></View>)}
        </Card>
        <Card style={{ marginTop: 12 }}>
          <Text style={s.cardTitle}>CRM sync</Text>
          {(crmSyncs && crmSyncs.length) ? crmSyncs.map((r, idx) => {
            const p = crmProviderN(r.provider) || { name: r.provider, accent: C.primary, icon: 'crm' };
            const ok = r.status === 'synced';
            return (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: idx ? 1 : 0, borderTopColor: C.border }}>
                <ProviderLogo p={p} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>{p.name}</Text>
                  <Text style={s.leadMeta} numberOfLines={1}>{ok ? ('#' + (r.ext.contact || '') + (r.ext.deal ? (' · deal #' + r.ext.deal) : '')) : (r.error ? r.error.code : '')}</Text>
                </View>
                {ok ? <Text style={{ color: C.green, fontWeight: '700', fontSize: 12 }}>Synced</Text>
                  : <Pressable onPress={() => onRetry && onRetry(r.connection_id, lead.id)} style={s.smallBtn}><Text style={s.smallBtnText}>Retry</Text></Pressable>}
              </View>
            );
          }) : <Text style={s.body}>Not synced to any CRM yet.</Text>}
        </Card>
        <Card style={{ marginTop: 12 }}>
          <Text style={s.cardTitle}>Internal notes</Text>
          <TextInput value={note} onChangeText={setNote} placeholder="Add a note…" placeholderTextColor={C.muted} style={[s.input, { minHeight: 70 }]} multiline />
          <GradientBtn label="Save note" onPress={() => onNote(lead.id, note)} style={{ marginTop: 10 }} />
        </Card>
        <Pressable onPress={() => Alert.alert('Delete lead', 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => onDelete(lead.id) }])} style={s.dangerBtn}>
          <Icon name="trash" size={16} color="#ff9aa6" /><Text style={{ color: '#ff9aa6', fontWeight: '700' }}>Delete lead</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ---------- AI receptionist (voice) — trilingual + smart number speech ---------- */
const VLANGS = [['en', 'EN'], ['es', 'ES'], ['ar', 'عربي']];
const VTTS = { en: 'en-GB', es: 'es-ES', ar: 'ar-SA' };
/* Voice packs (male/female) + gender detection by name — mirrors the web app. */
const VNAME_F = /(female|libby|sonia|aria|samantha|serena|karen|martha|stephanie|fiona|moira|tessa|elvira|dalia|monica|mónica|paulina|marisol|helena|sabina|hala|salma|amany|laila|zira|jenny|michelle|clara|catherine|susan|hazel|heather|zoe|nora|yara)/i;
const VNAME_M = /(male|ryan|guy|daniel|arthur|george|oliver|alex|fred|david|mark|james|paul|richard|alvaro|jorge|diego|carlos|pablo|juan|hamed|shakir|maged|tarik|naayf|naayef)/i;
/* Warm, upbeat, human prosody — never flat, never sad. Tuned per language + gender. */
function vProsody(lang, gender) {
  const male = gender === 'male';
  if (lang === 'ar') return male ? { rate: 0.93, pitch: 0.97 } : { rate: 0.96, pitch: 1.08 };
  if (lang === 'es') return male ? { rate: 1.0, pitch: 0.95 } : { rate: 1.03, pitch: 1.12 };
  return male ? { rate: 0.99, pitch: 0.94 } : { rate: 1.02, pitch: 1.12 };
}
/* Say the brand in a script the active voice can pronounce, so Arabic flows naturally. */
function sayBrand(text, lang) {
  if (lang === 'ar') return String(text).replace(/Alsaiti Growth/gi, 'الصايتي جروث').replace(/Alsaiti/gi, 'الصايتي');
  return String(text);
}
/* Pick an OS voice matching BOTH the language and the requested gender; null if none. */
function pickVoice(voices, langCode, gender) {
  if (!voices || !voices.length) return null;
  const pre = (langCode || 'en').slice(0, 2).toLowerCase();
  const want = gender === 'male' ? VNAME_M : VNAME_F, avoid = gender === 'male' ? VNAME_F : VNAME_M;
  const inLang = voices.filter((v) => (v.language || '').toLowerCase().indexOf(pre) === 0);
  if (!inLang.length) return null; // never substitute another language
  const score = (v) => {
    const n = ((v.name || '') + ' ' + (v.identifier || '')).toLowerCase(); let s = 0;
    if (want.test(n)) s += 20; if (avoid.test(n)) s -= 30;
    if ((v.quality || '').toLowerCase() === 'enhanced' || /neural|premium|natural/.test(n)) s += 10;
    return s;
  };
  inLang.sort((a, b) => score(b) - score(a));
  return inLang[0] ? inLang[0].identifier : null;
}
// read long digit runs (phone numbers) one digit at a time so TTS never says "million"
const normDigits = (s) => String(s || '').replace(/[٠-٩]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 1632 + 48)).replace(/[۰-۹]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 1776 + 48));
const speechClean = (text) => String(text).replace(/[+]?\d[\d ]{3,}\d/g, (m) => { const ds = m.replace(/[^\d]/g, ''); return ds.length >= 7 ? ds.split('').join(' ') : m; });
const fillTpl = (str, p) => String(str).replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? p[k] : m));
const VT = {
  en: {
    title: 'AI receptionist', sub: 'Talk to your AI receptionist — it greets the caller, qualifies them, and creates a lead.',
    start: 'Start call', end: 'End call', intro: 'Tap “Start call” and talk to your AI receptionist.',
    voicePack: 'Voice', voiceFemale: 'Female', voiceMale: 'Male',
    yourTurn: 'Your turn — type your reply and Send.', reply: 'Type your reply (or use the keyboard mic)…',
    created: 'Lead created — see it in the Leads tab.', ended: 'Call ended.', transcript: 'Transcript',
    transcriptPh: 'The conversation will appear here once you start the call.', toast: 'Voice lead created',
    sound: '🔊 Turn your iPhone silent switch off and volume up to hear the assistant.',
    greet: 'Good day, and thank you for calling Alsaiti Growth. This is your AI receptionist. May I take your name, please?',
    service: 'Lovely to meet you, {name}. How can we help you today?',
    urgency: 'Thank you. Is this something urgent, or are you planning ahead?',
    phone: 'Perfect. What is the best phone number to reach you on?',
    ack: 'I understand this is urgent — I\'ll flag it as a priority for the team.',
    close: 'Thank you, {name}. I have logged your enquiry about {service}, and our team will call you back on {phone}. Have a wonderful day!',
    closeUrgent: 'Thank you, {name}. I\'ve logged this as an urgent enquiry about {service}, and our team will call you back very shortly on {phone}. Take care!',
    defName: 'there', defService: 'a general enquiry',
  },
  es: {
    title: 'Recepcionista con IA', sub: 'Hable con su recepcionista con IA: saluda a la persona que llama, la cualifica y crea un cliente potencial.',
    start: 'Iniciar llamada', end: 'Finalizar llamada', intro: 'Pulse “Iniciar llamada” y hable con su recepcionista con IA.',
    voicePack: 'Voz', voiceFemale: 'Femenina', voiceMale: 'Masculina',
    yourTurn: 'Es su turno: escriba su respuesta y pulse Enviar.', reply: 'Escriba su respuesta (o use el micro del teclado)…',
    created: 'Cliente potencial creado: véalo en la pestaña Clientes potenciales.', ended: 'Llamada finalizada.', transcript: 'Transcripción',
    transcriptPh: 'La conversación aparecerá aquí en cuanto inicie la llamada.', toast: 'Cliente potencial de voz creado',
    sound: '🔊 Desactive el interruptor de silencio del iPhone y suba el volumen para oír al asistente.',
    greet: 'Muy buenas y gracias por llamar a Alsaiti Growth. Soy su recepcionista con IA. ¿Me podría decir su nombre, por favor?',
    service: 'Encantada de saludarle, {name}. ¿En qué podemos ayudarle hoy?',
    urgency: 'Gracias. ¿Se trata de algo urgente o lo está planificando con antelación?',
    phone: 'Perfecto. ¿Cuál es el mejor número de teléfono para localizarle?',
    ack: 'Entiendo que es urgente. Lo marcaré como prioritario para el equipo.',
    close: 'Gracias, {name}. He registrado su consulta sobre {service} y nuestro equipo le devolverá la llamada al {phone}. ¡Que tenga un día estupendo!',
    closeUrgent: 'Gracias, {name}. He registrado esto como una consulta urgente sobre {service} y nuestro equipo le devolverá la llamada muy pronto al {phone}. ¡Cuídese!',
    defName: 'buenas', defService: 'una consulta general',
  },
  ar: {
    title: 'موظف الاستقبال الذكي', sub: 'تحدّث مع موظف الاستقبال الذكي — يرحّب بالمتّصل، ويؤهّله، وينشئ عميلًا محتملًا.',
    start: 'بدء المكالمة', end: 'إنهاء المكالمة', intro: 'اضغط “بدء المكالمة” وتحدّث مع موظف الاستقبال الذكي.',
    voicePack: 'الصوت', voiceFemale: 'أنثى', voiceMale: 'ذكر',
    yourTurn: 'دورك — اكتب ردّك واضغط إرسال.', reply: 'اكتب ردّك (أو استخدم ميكروفون لوحة المفاتيح)…',
    created: 'تم إنشاء عميل محتمل — شاهده في تبويب العملاء المحتملين.', ended: 'انتهت المكالمة.', transcript: 'نص المحادثة',
    transcriptPh: 'ستظهر المحادثة هنا بمجرد أن تبدأ المكالمة.', toast: 'تم إنشاء عميل محتمل عبر الصوت',
    sound: '🔊 أوقف مفتاح الصامت في iPhone وارفع الصوت لسماع المساعد.',
    greet: 'طابَ يومُك، وشكرًا لاتصالك بـ Alsaiti Growth. معك موظف الاستقبال الذكي. هل لي أن أعرف اسمك الكريم، من فضلك؟',
    service: 'سعدتُ بمعرفتك، {name}. كيف يمكننا مساعدتك اليوم؟',
    urgency: 'شكرًا لك. هل الأمر عاجل، أم أنك تخطّط له مسبقًا؟',
    phone: 'ممتاز. ما أفضل رقم هاتف يمكننا التواصل معك عليه؟',
    ack: 'أتفهّم أن الأمر عاجل — سأميّزه كأولوية قصوى للفريق.',
    close: 'شكرًا لك، {name}. لقد سجّلتُ استفسارك بخصوص {service}، وسيعاود فريقنا الاتصال بك على {phone}. أتمنى لك يومًا رائعًا!',
    closeUrgent: 'شكرًا لك، {name}. لقد سجّلتُ هذا كاستفسار عاجل بخصوص {service}، وسيعاود فريقنا الاتصال بك في أقرب وقت على {phone}. اعتنِ بنفسك!',
    defName: 'عزيزي', defService: 'استفسار عام',
  },
};
const QORDER = ['greet', 'service', 'urgency', 'phone'];
const QKEY = ['name', 'service', 'urgency', 'phone'];
/* varied acknowledgements + natural close when no phone was given */
const VACK_N = {
  en: ['Of course — we can certainly help with that.', 'Absolutely, we handle that all the time.'],
  es: ['Por supuesto, podemos ayudarle con eso.', 'Claro que sí, nos encargamos de ese tipo de solicitudes a diario.'],
  ar: ['بالتأكيد، يمكننا مساعدتك في ذلك.', 'بكل تأكيد، نتعامل مع مثل هذه الطلبات يوميًا.'],
};
const VCLOSE_NP_N = {
  en: { normal: 'Thank you, {name}. I have logged your enquiry about {service}, and our team will be in touch very soon. Have a wonderful day!', urgent: 'Thank you, {name}. I have logged this as an urgent enquiry about {service}, and our team will be in touch right away. Take care!' },
  es: { normal: 'Gracias, {name}. He registrado su consulta sobre {service} y nuestro equipo se pondrá en contacto con usted muy pronto. ¡Que tenga un día estupendo!', urgent: 'Gracias, {name}. He registrado esto como una consulta urgente sobre {service} y nuestro equipo se pondrá en contacto de inmediato. ¡Cuídese!' },
  ar: { normal: 'شكرًا لك، {name}. لقد سجّلتُ استفسارك بخصوص {service}، وسيتواصل معك فريقنا قريبًا جدًا. أتمنى لك يومًا رائعًا!', urgent: 'شكرًا لك، {name}. لقد سجّلتُ هذا كاستفسار عاجل بخصوص {service}، وسيتواصل معك فريقنا فورًا. اعتنِ بنفسك!' },
};
function VoiceScreen({ onCreateLead, showToast }) {
  const [lang, setLang] = useState('en');
  const T = VT[lang];
  const rtl = lang === 'ar';
  const voice = useRef({ active: false, step: 0, data: {}, urgent: false, timer: null, pendingTxt: null, retry: {} }).current;
  const [transcript, setTranscript] = useState([]);
  const [status, setStatus] = useState(VT.en.intro);
  const [input, setInput] = useState('');
  const [active, setActive] = useState(false);
  const [gender, setGender] = useState('female');
  const voicesRef = useRef([]);
  useEffect(() => { let alive = true; (async () => {
    try { const g = await store.get('av_voice_gender', 'female'); if (alive && (g === 'male' || g === 'female')) setGender(g); } catch (e) {}
    try { const vs = await Speech.getAvailableVoicesAsync(); if (alive) voicesRef.current = vs || []; } catch (e) {}
  })(); return () => { alive = false; }; }, []);
  const chooseGender = async (g) => { g = g === 'male' ? 'male' : 'female'; setGender(g); try { await store.set('av_voice_gender', g); } catch (e) {}
    const sample = { en: 'Hi! This is your AI receptionist — lovely to meet you.', es: '¡Hola! Soy su recepcionista con IA. ¡Encantada de saludarle!', ar: 'مرحبًا! معك موظف الاستقبال الذكي. سعدتُ بالتحدث إليك!' };
    try { Speech.stop(); speakWith(sample[lang] || sample.en, g); } catch (e) {} };
  const speakWith = (txt, g) => { try {
    const code = VTTS[lang]; const pr = vProsody(lang, g);
    const opts = { language: code, pitch: pr.pitch, rate: pr.rate };
    const vid = pickVoice(voicesRef.current, code, g); if (vid) opts.voice = vid; // same-language, right gender
    Speech.stop(); Speech.speak(speechClean(sayBrand(txt, lang)), opts);
  } catch (e) {} };
  const speak = (txt) => speakWith(txt, gender);
  const add = (who, text) => setTranscript((p) => [...p, { who, text }]);
  /* the receptionist pauses like a human: typing dots, then the reply */
  const botSay = (txt) => {
    /* if a reply is still "typing", flush it into the transcript instead of dropping it */
    if (voice.timer) {
      clearTimeout(voice.timer); voice.timer = null;
      if (voice.pendingTxt) { const pt = voice.pendingTxt; voice.pendingTxt = null; setTranscript((p) => [...p.filter((m) => m.who !== 'typing'), { who: 'bot', text: pt }]); }
    }
    voice.pendingTxt = txt;
    setTranscript((p) => [...p.filter((m) => m.who !== 'typing'), { who: 'typing' }]);
    voice.timer = setTimeout(() => {
      voice.timer = null; voice.pendingTxt = null;
      setTranscript((p) => [...p.filter((m) => m.who !== 'typing'), { who: 'bot', text: txt }]);
      speak(txt);
    }, 650 + Math.floor(Math.random() * 400));
  };
  const askText = () => {
    const which = QORDER[voice.step];
    const name = cap(voice.data.name || '') || T.defName;
    let txt = fillTpl(T[which], { name });
    if (which === 'urgency') { const acks = VACK_N[lang] || VACK_N.en; txt = acks[Math.floor(Math.random() * acks.length)] + ' ' + txt; }
    if (which === 'phone' && voice.urgent) txt = T.ack + ' ' + txt;
    return txt;
  };
  const ask = () => { botSay(askText()); setStatus(T.yourTurn); };
  const start = () => { voice.active = true; voice.step = 0; voice.data = {}; voice.urgent = false; voice.retry = {}; setActive(true); setTranscript([]); ask(); };
  const finish = () => {
    voice.active = false; setActive(false);
    const d = voice.data;
    const name = cap(d.name || '') || T.defName;
    const leadName = cap(d.name || '') || 'Voice caller';
    const service = (d.service || '').trim() || T.defService;
    const urgency = parseUrgency(d.urgency);
    let phone = normDigits(d.phone || '').replace(/[^0-9+ ]/g, '').trim();
    if (phone.replace(/[^0-9]/g, '').length < 6) phone = '';
    const score = urgency === 'High' ? Math.floor(82 + Math.random() * 14) : urgency === 'Medium' ? Math.floor(62 + Math.random() * 16) : Math.floor(45 + Math.random() * 15);
    onCreateLead({ id: uid(), name: leadName, service, urgency, source: 'Voice call', status: 'New', score, at: Date.now(), phone, email: '', summary: 'Captured by the Alsaiti Growth AI receptionist. Caller: ' + leadName + '. Needs: ' + service + '. Urgency: ' + urgency + '.', notes: '', assignee: 'Unassigned' });
    let msg;
    if (phone) msg = fillTpl(urgency === 'High' ? T.closeUrgent : T.close, { name, service, phone });
    else { const np = VCLOSE_NP_N[lang] || VCLOSE_NP_N.en; msg = fillTpl(urgency === 'High' ? np.urgent : np.normal, { name, service }); }
    botSay(msg); setStatus(T.created); showToast(T.toast);
  };
  const send = () => {
    const v = input.trim(); if (!v || !voice.active) return; setInput(''); add('user', v);
    const key = QKEY[voice.step];
    const vd = validateAnswer(key, v);
    let val = v;
    if (!vd.ok) {
      voice.retry[key] = (voice.retry[key] || 0) + 1;
      if (voice.retry[key] <= vd.max) { setStatus(T.yourTurn); botSay((VRETRY[lang] || VRETRY.en)[vd.field]); return; }
      if (key === 'name' || key === 'service') val = '';
    }
    voice.data[key] = val;
    if (key === 'urgency') voice.urgent = parseUrgency(val) === 'High';
    voice.step += 1;
    if (voice.step < QORDER.length) ask(); else finish();
  };
  const end = () => { voice.active = false; setActive(false); if (voice.timer) { clearTimeout(voice.timer); voice.timer = null; } voice.pendingTxt = null; setTranscript((p) => p.filter((m) => m.who !== 'typing')); try { Speech.stop(); } catch (e) {} setStatus(T.ended); };
  const switchLang = (l) => { if (voice.active || voice.timer) end(); setLang(l); setTranscript([]); setStatus(VT[l].intro); };
  useEffect(() => () => { if (voice.timer) clearTimeout(voice.timer); try { Speech.stop(); } catch (e) {} }, []);
  return (
    <KeyboardAvoidingView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <H title={T.title} sub={T.sub} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
          {VLANGS.map(([code, lbl]) => (
            <Pressable key={code} onPress={() => switchLang(code)} style={[s.chip, { marginRight: 0 }, lang === code && s.chipActive]}>
              <Text style={{ color: lang === code ? '#04223f' : C.muted, fontWeight: '700', fontSize: 13 }}>{lbl}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>{T.voicePack || 'Voice'}</Text>
          {[['female', T.voiceFemale || 'Female'], ['male', T.voiceMale || 'Male']].map(([g, lbl]) => (
            <Pressable key={g} onPress={() => chooseGender(g)} style={[s.chip, { marginRight: 0, flexDirection: 'row', alignItems: 'center', gap: 5 }, gender === g && s.chipActive]}>
              <Icon name="mic" size={12} color={gender === g ? '#04223f' : C.muted} sw={2} />
              <Text style={{ color: gender === g ? '#04223f' : C.muted, fontWeight: '700', fontSize: 12.5 }}>{lbl}</Text>
            </Pressable>
          ))}
        </View>
        <Card style={{ alignItems: 'center' }}>
          <Pressable onPress={active ? end : start}>
            <LinearGradient colors={[C.primary, C.glow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.vmic}><Icon name="mic" size={38} color="#fff" sw={2} /></LinearGradient>
          </Pressable>
          <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 14 }}>{status}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Pressable onPress={start} style={s.ghostBtn}><Text style={s.ghostBtnText}>{T.start}</Text></Pressable>
            <Pressable onPress={end} style={[s.ghostBtn, { borderColor: 'rgba(255,122,138,0.5)' }]}><Text style={[s.ghostBtnText, { color: '#ff9aa6' }]}>{T.end}</Text></Pressable>
          </View>
          <Text style={{ color: C.muted, fontSize: 11.5, textAlign: 'center', marginTop: 12 }}>{T.sound}</Text>
        </Card>
        {active ? (
          <View style={s.voiceInput}>
            <TextInput value={input} onChangeText={setInput} placeholder={T.reply} placeholderTextColor={C.muted} style={{ flex: 1, color: C.text, fontSize: 14, textAlign: rtl ? 'right' : 'left' }} onSubmitEditing={send} returnKeyType="send" blurOnSubmit={false} />
            <Pressable onPress={send} style={s.sendBtn}><Icon name="send" size={18} color="#fff" sw={2} /></Pressable>
          </View>
        ) : null}
        <Text style={s.section}>{T.transcript}</Text>
        <Card>
          {transcript.length === 0 ? <Text style={[s.body, { textAlign: rtl ? 'right' : 'left' }]}>{T.transcriptPh}</Text>
            : transcript.map((m, i) => (
              m.who === 'typing'
                ? <View key={i} style={[s.bubble, s.bubbleBot]}><Text style={{ color: C.muted, fontSize: 14, letterSpacing: 2 }}>• • •</Text></View>
                : <View key={i} style={[s.bubble, m.who === 'user' ? s.bubbleUser : s.bubbleBot]}>
                    <Text style={{ color: m.who === 'user' ? '#fff' : C.text, fontSize: 14, textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }}>{m.text}</Text>
                  </View>
            ))}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ---------- Analytics ---------- */
function Analytics({ leads }) {
  const order = ['New', 'Contacted', 'Qualified', 'Booked', 'Won'];
  const total = leads.length || 1;
  const funnel = order.map((st, i) => { const n = leads.filter((l) => order.indexOf(l.status) >= i).length; return [st, Math.round(n / total * 100), n]; });
  const won = leads.filter((l) => l.status === 'Won').length;
  const qualified = Math.round(leads.filter((l) => ['Qualified', 'Booked', 'Won'].includes(l.status)).length / total * 100);
  const avg = leads.length ? Math.round(leads.reduce((a, l) => a + l.score, 0) / leads.length) : 0;
  const cards = [['Total leads', leads.length], ['Qualified rate', qualified + '%'], ['Won', won], ['Avg score', avg]];
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <H title="Analytics" sub="Conversion and quality across your leads." />
      <View style={s.statGrid}>{cards.map((c) => <Card key={c[0]} style={s.stat}><Text style={s.statLabel}>{c[0]}</Text><Text style={s.statValue}>{c[1]}</Text></Card>)}</View>
      <Text style={s.section}>Conversion funnel</Text>
      <Card style={{ alignItems: 'center' }}>
        {funnel.map((f, i) => (
          <React.Fragment key={f[0]}>
            <LinearGradient colors={[FUNNEL_COLORS[i % FUNNEL_COLORS.length], FUNNEL_COLORS[(i + 1) % FUNNEL_COLORS.length]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: Math.max(46, f[1]) + '%', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: '#052033', fontWeight: '800', fontSize: 13 }}>{f[0]}  <Text style={{ fontSize: 12 }}>({f[2]})</Text></Text>
              <Text style={{ color: '#052033', fontWeight: '800', fontSize: 14 }}>{f[1]}%</Text>
            </LinearGradient>
            {i < funnel.length - 1 ? <Text style={{ color: C.muted, fontSize: 11.5, marginVertical: 5, fontWeight: '600' }}>↓ {funnel[i + 1][2]} continued · {f[2] > 0 ? Math.round((f[2] - funnel[i + 1][2]) / f[2] * 100) : 0}% drop-off</Text> : null}
          </React.Fragment>
        ))}
      </Card>
    </ScrollView>
  );
}

/* ---------- Settings ---------- */
function Settings({ profile, user, leadCount, onSave, onLogout, onReset }) {
  const [biz, setBiz] = useState(profile?.biz || user?.biz || '');
  return (
    <KeyboardAvoidingView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <H title="Settings" sub="Your business profile and account." />
        <Card>
          <Text style={s.cardTitle}>Business profile</Text>
          <Field label="Business name" value={biz} onChangeText={setBiz} />
          <GradientBtn label="Save changes" onPress={() => onSave({ ...profile, biz })} />
        </Card>
        <Card style={{ marginTop: 12 }}>
          <Text style={s.cardTitle}>Account</Text>
          <View style={s.kv}><Text style={s.kvK}>Signed in as</Text><Text style={s.kvV}>{user?.name}</Text></View>
          <View style={s.kv}><Text style={s.kvK}>Email</Text><Text style={s.kvV}>{user?.email}</Text></View>
          <View style={s.kv}><Text style={s.kvK}>Leads stored</Text><Text style={s.kvV}>{leadCount}</Text></View>
          <Pressable onPress={onLogout} style={[s.ghostBtn, { marginTop: 14, alignItems: 'center', paddingVertical: 12, flexDirection: 'row', justifyContent: 'center', gap: 8 }]}><Icon name="logout" size={16} color={C.text} /><Text style={s.ghostBtnText}>Sign out</Text></Pressable>
          <Pressable onPress={() => Alert.alert('Reset data', 'Replace your leads with the sample set?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: onReset }])} style={[s.ghostBtn, { marginTop: 10, alignItems: 'center', paddingVertical: 12, borderColor: 'rgba(255,122,138,0.5)' }]}><Text style={[s.ghostBtnText, { color: '#ff9aa6' }]}>Reset sample data</Text></Pressable>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ---------- Integrations ---------- */
function ProviderLogo({ p, size = 42 }) {
  return (
    <LinearGradient colors={[p.accent, 'rgba(0,0,0,0.32)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={p.icon} size={Math.round(size * 0.5)} color="#fff" sw={2} />
    </LinearGradient>
  );
}
const CS_META = { connected: { c: C.green, label: 'Connected' }, paused: { c: '#C3D3EA', label: 'Paused' }, attention: { c: C.amber, label: 'Attention' }, none: { c: C.muted, label: 'Not connected' }, soon: { c: '#B6A9FF', label: 'Coming soon' } };
function StatusPill({ kind }) {
  const m = CS_META[kind] || CS_META.none;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: m.c + '55', backgroundColor: m.c + '1f', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
      {kind !== 'soon' ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: m.c }} /> : null}
      <Text style={{ color: m.c, fontSize: 11, fontWeight: '700' }}>{m.label}</Text>
    </View>
  );
}
function Integrations({ crm, mode, onSetMode, onConnect, onPause, onResume, onDisconnect, onTest, onRetry }) {
  const [wiz, setWiz] = useState(null);
  const conns = crm.conns.filter((c) => c.status !== 'disconnected');
  const active = conns.filter((c) => c.status === 'connected' && c.sync_enabled).length;
  const syncedTotal = Object.keys(crm.syncs).filter((k) => crm.syncs[k].status === 'synced').length;
  const succ = crm.attempts.length ? Math.round(crm.attempts.filter((a) => a.status === 'success').length / crm.attempts.length * 100) : 100;
  const connectedIds = {}; conns.forEach((c) => { connectedIds[c.provider] = true; });
  const avail = CRM_PROVIDERS.filter((p) => !connectedIds[p.id]);
  const summary = [['Active', active], ['Synced', syncedTotal], ['Success', succ + '%']];
  const openWiz = (p) => setWiz({ provider: p.id, triggers: { 'lead.created': true, 'lead.status_changed': true }, actions: { contact: true, ...((p.entity === 'deal' || p.entity === 'opportunity') ? { deal: true, note: true } : {}) } });
  const toggle = (grp, k) => setWiz((w) => ({ ...w, [grp]: { ...w[grp], [k]: !w[grp][k] } }));
  const wizP = wiz ? crmProviderN(wiz.provider) : null;
  const activate = () => {
    const triggers = Object.keys(wiz.triggers).filter((k) => wiz.triggers[k]);
    const actions = Object.keys(wiz.actions).filter((k) => wiz.actions[k]);
    const account = (wizP.kind === 'custom' || wizP.id === 'generic_webhook') ? 'https://api.yourapp.com/hooks/alsaiti' : (wizP.id === 'hubspot' ? 'Bright Smile Dental' : wizP.name + ' workspace');
    onConnect({ provider: wizP.id, name: wizP.name, account, triggers, actions });
    setWiz(null);
  };
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <H title="CRM Integrations" sub="Sync every lead to your CRM — via a secure n8n automation layer." />
      <View style={s.modeRow}>
        {[['internal', 'Built-in'], ['external', 'External'], ['hybrid', 'Hybrid']].map((mm) => {
          const on = (mode || 'hybrid') === mm[0];
          return (<Pressable key={mm[0]} onPress={() => onSetMode(mm[0])} style={[s.modeBtn, on && s.modeBtnOn]}><Text style={[s.modeText, on && { color: '#04223f' }]}>{mm[1]}</Text></Pressable>);
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        {summary.map((x) => (
          <Card key={x[0]} style={{ flex: 1, paddingVertical: 12 }}><Text style={s.statLabel}>{x[0]}</Text><Text style={[s.statValue, { fontSize: 22 }]}>{x[1]}</Text></Card>
        ))}
      </View>
      <Card style={{ marginBottom: 6, flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(58,166,255,0.14)', alignItems: 'center', justifyContent: 'center' }}><Icon name="shield" size={18} color={C.cyan} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontWeight: '700', fontSize: 13.5 }}>Your data stays safe</Text>
          <Text style={[s.body, { marginTop: 3 }]}>Supabase is the source of truth. n8n routes signed events to your CRM. If a CRM is offline, leads stay safe and sync retries automatically.</Text>
        </View>
      </Card>
      {conns.length ? <Text style={s.section}>Connected</Text> : null}
      {conns.map((c) => {
        const paused = !c.sync_enabled, attn = c.health === 'attention';
        const kind = paused ? 'paused' : (attn ? 'attention' : 'connected');
        const p = crmProviderN(c.provider) || { name: c.provider, accent: C.primary, icon: 'crm' };
        return (
          <Card key={c.id} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ProviderLogo p={p} />
              <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>{p.name}</Text><Text style={s.leadMeta} numberOfLines={1}>{c.account}</Text></View>
              <StatusPill kind={kind} />
            </View>
            <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
              <View style={{ flex: 1 }}><Text style={s.kvK}>Synced</Text><Text style={{ color: C.text, fontWeight: '700', marginTop: 2 }}>{c.synced || 0}</Text></View>
              <View style={{ flex: 1 }}><Text style={s.kvK}>Last ok</Text><Text style={{ color: C.text, fontWeight: '700', marginTop: 2 }}>{c.last_success ? ago(c.last_success) : 'Never'}</Text></View>
              <View style={{ flex: 1 }}><Text style={s.kvK}>Health</Text><Text style={{ color: attn ? C.amber : C.green, fontWeight: '700', marginTop: 2 }}>{attn ? 'Attention' : 'Healthy'}</Text></View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <Pressable onPress={() => onTest(c.id)} style={s.smallBtn}><Text style={s.smallBtnText}>Test</Text></Pressable>
              {paused
                ? <Pressable onPress={() => onResume(c.id)} style={s.smallBtn}><Text style={s.smallBtnText}>Resume</Text></Pressable>
                : <Pressable onPress={() => onPause(c.id)} style={s.smallBtn}><Text style={s.smallBtnText}>Pause</Text></Pressable>}
              <Pressable onPress={() => onDisconnect(c.id, p.name)} style={[s.smallBtn, { borderColor: 'rgba(255,122,138,0.5)' }]}><Text style={[s.smallBtnText, { color: '#ff9aa6' }]}>Disconnect</Text></Pressable>
            </View>
          </Card>
        );
      })}
      <Text style={s.section}>Available integrations</Text>
      {avail.map((p) => {
        const soon = p.kind === 'soon';
        return (
          <Card key={p.id} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <ProviderLogo p={p} />
              <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>{p.name}</Text><Text style={s.leadMeta} numberOfLines={1}>{p.desc}</Text></View>
              <StatusPill kind={soon ? 'soon' : 'none'} />
            </View>
            <Pressable disabled={soon} onPress={() => openWiz(p)} style={[soon ? s.smallBtn : s.connectBtn, { marginTop: 12, opacity: soon ? 0.5 : 1, alignSelf: 'flex-start' }]}>
              <Text style={soon ? s.smallBtnText : { color: '#04223f', fontWeight: '700', fontSize: 13 }}>{soon ? 'Coming soon' : (p.kind === 'custom' ? 'Connect API' : 'Connect')}</Text>
            </Pressable>
          </Card>
        );
      })}
      <Text style={s.section}>Recent sync activity</Text>
      <Card>
        {crm.attempts.length === 0 ? <Text style={s.body}>No sync activity yet.</Text>
          : crm.attempts.slice(0, 8).map((a) => {
            const ok = a.status === 'success'; const p = crmProviderN(a.provider) || { name: a.provider };
            return (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border }}>
                <Icon name={ok ? 'check' : 'close'} size={15} color={ok ? C.green : '#ff9aa6'} sw={2.2} />
                <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{a.event_type}</Text><Text style={s.leadMeta} numberOfLines={1}>{p.name} · {a.lead_name || '—'}</Text></View>
                {ok ? <Text style={{ color: C.green, fontWeight: '700', fontSize: 12 }}>{a.code}</Text>
                  : <Pressable onPress={() => onRetry(a.conn, a.lead_id)} style={s.smallBtn}><Text style={s.smallBtnText}>Retry</Text></Pressable>}
              </View>
            );
          })}
      </Card>
      <View style={{ height: 16 }} />
      <Modal visible={!!wiz} transparent animationType="fade" onRequestClose={() => setWiz(null)}>
        <View style={s.modalWrap}>
          <View style={s.modalCard}>
            {wizP ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <ProviderLogo p={wizP} size={38} />
                  <Text style={{ color: C.text, fontWeight: '800', fontSize: 16, flex: 1 }}>Connect {wizP.name}</Text>
                  <Pressable onPress={() => setWiz(null)}><Icon name="close" size={18} color={C.muted} /></Pressable>
                </View>
                <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                  <Text style={s.section2}>Sync triggers</Text>
                  {CRM_TRIGGERS.map(([id, label]) => (
                    <Pressable key={id} onPress={() => toggle('triggers', id)} style={[s.checkRow, wiz.triggers[id] && s.checkRowOn]}>
                      <View style={[s.checkBox, wiz.triggers[id] && s.checkBoxOn]}>{wiz.triggers[id] ? <Icon name="check" size={12} color="#fff" sw={2.6} /> : null}</View>
                      <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>{label}</Text>
                    </Pressable>
                  ))}
                  <Text style={s.section2}>CRM actions</Text>
                  {CRM_ACTIONS.map(([id, label]) => (
                    <Pressable key={id} onPress={() => toggle('actions', id)} style={[s.checkRow, wiz.actions[id] && s.checkRowOn]}>
                      <View style={[s.checkBox, wiz.actions[id] && s.checkBoxOn]}>{wiz.actions[id] ? <Icon name="check" size={12} color="#fff" sw={2.6} /> : null}</View>
                      <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>{label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <GradientBtn label={'Activate ' + wizP.name} onPress={activate} style={{ marginTop: 14 }} />
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

/* ---------- Onboarding (guided setup, mirrors the web wizard) ---------- */
function obF(label, value, onChange, ph) {
  return (<View style={{ marginBottom: 12 }}><Text style={s.label}>{label}</Text><TextInput value={value || ''} onChangeText={onChange} placeholder={ph} placeholderTextColor={C.muted} style={s.input} /></View>);
}
function obFArea(label, value, onChange, ph) {
  return (<View style={{ marginBottom: 12 }}><Text style={s.label}>{label}</Text><TextInput value={value || ''} onChangeText={onChange} placeholder={ph} placeholderTextColor={C.muted} style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline /></View>);
}
function obSelChips(label, opts, value, onChange) {
  return (<View style={{ marginBottom: 12 }}><Text style={s.label}>{label}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{opts.map((o) => <Chip key={o} label={o} active={value === o} onPress={() => onChange(o)} />)}</View></View>);
}
function obTogRow(label, on, onToggle) {
  return (<Pressable onPress={onToggle} style={[s.checkRow, on && s.checkRowOn]}><View style={[s.checkBox, on && s.checkBoxOn]}>{on ? <Icon name="check" size={12} color="#fff" sw={2.6} /> : null}</View><Text style={{ color: C.text, fontSize: 13, flex: 1 }}>{label}</Text></Pressable>);
}
function Onboarding({ onboard, crm, onSetMode, onConnectCrm, onActivate, onExit }) {
  const STEPS = ['Welcome', 'Your business', 'Services', 'AI receptionist', 'Manage leads', 'Notifications', 'Review & go live'];
  const [step, setStep] = useState((onboard && onboard.step) || 0);
  const [a, setA] = useState((onboard && onboard.answers) || { crm_mode: (crm && crm.mode) || 'hybrid', services: [] });
  const [svc, setSvc] = useState('');
  const set = (k, v) => setA((p) => ({ ...p, [k]: v }));
  const tog = (k) => setA((p) => ({ ...p, [k]: !p[k] }));
  const addSvc = () => { if (!svc.trim()) return; setA((p) => ({ ...p, services: [...(p.services || []), { name: svc.trim(), category: 'General', value: 'Medium' }] })); setSvc(''); };
  const removeSvc = (i) => setA((p) => ({ ...p, services: (p.services || []).filter((_, idx) => idx !== i) }));
  const mode = a.crm_mode || 'hybrid';
  const setMode = (m) => { set('crm_mode', m); if (onSetMode) onSetMode(m); };
  const total = STEPS.length, optional = [2, 5];
  const next = () => { if (step >= total - 1) { onActivate(a); return; } setStep(step + 1); };
  const back = () => setStep(Math.max(0, step - 1));
  const pct = Math.round(step / (total - 1) * 100);
  const conns = crm.conns.filter((c) => c.status !== 'disconnected');
  let content;
  if (step === 0) content = (<><Text style={s.h1}>Welcome to Alsaiti Voice</Text><Text style={[s.sub, { marginTop: 8, fontSize: 14.5 }]}>We will ask a few questions about your business so we can configure your lead dashboard, AI assistant and CRM.</Text><View style={[s.badge, { alignSelf: 'flex-start', marginTop: 16, borderColor: C.borderHi, backgroundColor: 'rgba(58,166,255,0.14)' }]}><Icon name="clock" size={13} color={C.cyan} /><Text style={{ color: C.cyan, fontWeight: '700', fontSize: 12 }}>About 2 minutes</Text></View></>);
  else if (step === 1) content = (<><Text style={s.h1}>Your business</Text>{obF('Company name', a.business_name, (v) => set('business_name', v), 'Bright Smile Dental')}{obF('Website', a.website_url, (v) => set('website_url', v), 'https://…')}{obF('Main phone', a.main_phone, (v) => set('main_phone', v), '+44 …')}{obF('Main email', a.main_email, (v) => set('main_email', v), 'you@business.com')}{obSelChips('Industry', ['Dental clinic', 'Aesthetic clinic', 'Home services', 'Real estate', 'Consultant', 'Other'], a.industry, (v) => set('industry', v))}</>);
  else if (step === 2) content = (<><Text style={s.h1}>Services</Text><Text style={[s.sub, { marginTop: 8 }]}>Add the services customers enquire about.</Text>{(a.services || []).map((sv2, i) => (<View key={i} style={s.obSvc}><View style={{ flex: 1 }}><Text style={{ color: C.text, fontWeight: '700' }}>{sv2.name}</Text><Text style={s.leadMeta}>{sv2.category} · {sv2.value}</Text></View><Pressable onPress={() => removeSvc(i)}><Icon name="trash" size={16} color="#ff9aa6" /></Pressable></View>))}<View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}><TextInput value={svc} onChangeText={setSvc} placeholder="Service name" placeholderTextColor={C.muted} style={[s.input, { flex: 1 }]} /><Pressable onPress={addSvc} style={s.connectBtn}><Text style={{ color: '#04223f', fontWeight: '700' }}>Add</Text></Pressable></View></>);
  else if (step === 3) content = (<><Text style={s.h1}>AI receptionist</Text>{obF('Assistant name', a.assistant_name, (v) => set('assistant_name', v), 'Alsaiti receptionist')}{obFArea('Greeting', a.assistant_greeting, (v) => set('assistant_greeting', v), 'Good day, thank you for calling…')}{obSelChips('Tone', ['Friendly', 'Professional', 'Formal'], a.tone, (v) => set('tone', v))}{obTogRow('Assistant discloses it is an AI', !!a.ai_disclosure, () => tog('ai_disclosure'))}</>);
  else if (step === 4) content = (<><Text style={s.h1}>Manage leads</Text><Text style={[s.sub, { marginTop: 8 }]}>Use the built-in CRM, connect your own, or both.</Text>{[['internal', 'Built-in Alsaiti Voice CRM', 'Manage leads, notes, tasks and pipeline here. No external CRM needed.'], ['external', 'Connect an existing CRM', 'Keep using your CRM — we send new leads and updates into it.'], ['hybrid', 'Use both (recommended)', 'Alsaiti Voice is your inbox and also syncs to your external CRM.']].map((o) => (<Pressable key={o[0]} onPress={() => setMode(o[0])} style={[s.obOpt, mode === o[0] && s.obOptOn]}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name={mode === o[0] ? 'check' : 'crm'} size={16} color={mode === o[0] ? C.cyan : C.muted} /><Text style={{ color: C.text, fontWeight: '800', fontSize: 14, flex: 1 }}>{o[1]}</Text></View><Text style={[s.leadMeta, { marginTop: 5 }]}>{o[2]}</Text></Pressable>))}{mode !== 'internal' ? (<View style={{ marginTop: 8 }}>{conns.map((c) => { const p = crmProviderN(c.provider) || { name: c.provider, accent: C.primary, icon: 'crm' }; return (<View key={c.id} style={s.obSvc}><ProviderLogo p={p} size={30} /><Text style={{ color: C.text, fontWeight: '700', flex: 1, marginLeft: 8 }}>{p.name}</Text><Text style={{ color: C.green, fontWeight: '700', fontSize: 12 }}>Connected</Text></View>); })}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>{CRM_PROVIDERS.filter((p) => p.kind === 'core').slice(0, 3).map((p) => (<Pressable key={p.id} onPress={() => onConnectCrm({ provider: p.id, name: p.name, account: p.id === 'hubspot' ? 'Bright Smile Dental' : p.name + ' workspace', triggers: ['lead.created', 'lead.status_changed'], actions: ['contact', 'deal', 'note'] })} style={s.smallBtn}><Text style={s.smallBtnText}>Connect {p.name}</Text></Pressable>))}</View></View>) : null}</>);
  else if (step === 5) content = (<><Text style={s.h1}>Notifications</Text><Text style={[s.sub, { marginTop: 8 }]}>How and when we should alert your team.</Text>{obTogRow('Email', a.ch_email !== false, () => tog('ch_email'))}{obTogRow('New lead', !!a.ev_new, () => tog('ev_new'))}{obTogRow('Urgent lead', !!a.ev_urgent, () => tog('ev_urgent'))}{obTogRow('CRM sync failed', !!a.ev_crmfail, () => tog('ev_crmfail'))}{obTogRow('Daily summary', !!a.ev_daily, () => tog('ev_daily'))}</>);
  else { const rev = [['Business', !!a.business_name], ['Services', (a.services || []).length > 0], ['AI assistant', !!a.assistant_name || !!a.assistant_greeting], ['CRM mode', !!a.crm_mode], ['Notifications', !!a.ch_email || !!a.ev_new]]; content = (<><Text style={s.h1}>Review & go live</Text><Text style={[s.sub, { marginTop: 8 }]}>Check everything, then activate. You can change anything later in Settings.</Text>{rev.map((r) => (<View key={r[0]} style={s.obRev}><Text style={{ color: C.text, fontWeight: '700', flex: 1 }}>{r[0]}</Text><Text style={{ color: r[1] ? C.green : C.muted, fontWeight: '700', fontSize: 12 }}>{r[1] ? 'Complete' : 'Skipped'}</Text></View>))}<Text style={[s.sub, { marginTop: 12 }]}>Tap Activate to create your workspace and go live.</Text></>); }
  return (
    <KeyboardAvoidingView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text style={s.obStepno}>Step {step + 1} of {total} · {STEPS[step]}</Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => onExit(step, a)} style={s.smallBtn}><Text style={s.smallBtnText}>Save & exit</Text></Pressable>
        </View>
        <View style={s.obProg}><View style={[s.obProgFill, { width: pct + '%' }]} /></View>
        <Card style={{ marginTop: 16 }}>{content}</Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }}>
          {step > 0 ? <Pressable onPress={back} style={s.smallBtn}><Text style={s.smallBtnText}>Back</Text></Pressable> : null}
          <View style={{ flex: 1 }} />
          {optional.indexOf(step) >= 0 ? <Pressable onPress={next} style={s.smallBtn}><Text style={s.smallBtnText}>Skip</Text></Pressable> : null}
          <GradientBtn label={step >= total - 1 ? 'Activate Alsaiti Voice' : 'Next'} onPress={next} style={{ minWidth: 120 }} />
        </View>
        <View style={{ height: 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ---------- App ---------- */
const TABS = [['dashboard', 'Home', 'grid'], ['leads', 'Leads', 'users'], ['voice', 'Voice', 'mic'], ['integrations', 'Sync', 'plug'], ['analytics', 'Stats', 'chart'], ['settings', 'More', 'cog']];

export default function App() {
  const [booted, setBooted] = useState(false);
  const usersRef = useRef({});
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [leads, setLeads] = useState([]);
  const [crm, setCrm] = useState({ mode: 'hybrid', conns: [], events: [], syncs: {}, attempts: [] });
  const [onboard, setOnboardState] = useState(null);
  const [screen, setScreen] = useState('landing');
  const [activeId, setActiveId] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authErr, setAuthErr] = useState('');
  const [authBusy, setAuthBusy] = useState(false); // network round-trip to Supabase Auth in flight
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const showToast = (m) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2000); };

  useEffect(() => { (async () => {
    const u = await store.get('av_users', {}); usersRef.current = u;
    const sess = await store.get('av_session', null);
    if (sess && u[sess]) await loadUser(sess, u);
    setBooted(true);
  })(); }, []);

  async function loadUser(em, u) {
    setSession(em);
    // Corrupted/legacy stored values must never crash the app — validate shapes on read.
    let l = await store.get('leads_' + em, null);
    if (!Array.isArray(l)) { l = seedLeads(); await store.set('leads_' + em, l); }
    setLeads(l);
    let cr = await store.get('crm_' + em, null);
    if (!cr || typeof cr !== 'object' || Array.isArray(cr) || !Array.isArray(cr.conns) || !Array.isArray(cr.events) || !cr.syncs || typeof cr.syncs !== 'object' || !Array.isArray(cr.attempts)) { cr = crmSeed(l); await store.set('crm_' + em, cr); }
    if (!cr.mode) cr.mode = 'hybrid';
    setCrm(cr);
    const ob = await store.get('onboard_' + em, null);
    setOnboardState(ob && typeof ob === 'object' && !Array.isArray(ob) && ob.answers && typeof ob.answers === 'object' ? ob : null);
    const prof = await store.get('profile_' + em, null);
    setProfile(prof && typeof prof === 'object' && !Array.isArray(prof) ? prof : { biz: u[em].biz, email: em });
    setScreen('dashboard');
  }
  /* Record an identity ALREADY verified by Supabase. Deliberately writes no `pass`/`salt`,
     so a stolen device yields no credential to crack. */
  async function adoptExternal(em, name, biz) {
    const u = { ...usersRef.current };
    const prev = Object.prototype.hasOwnProperty.call(u, em) ? u[em] : null;
    u[em] = {
      name: String(name || (prev && prev.name) || em.split('@')[0]).trim().slice(0, 60),
      biz: String(biz || (prev && prev.biz) || 'My business').trim().slice(0, 80),
      email: em, auth: 'supabase', created: (prev && prev.created) || Date.now(),
    };
    usersRef.current = u;
    await store.set('av_users', u);
    await store.set('av_session', em);
    return u;
  }
  async function doSignup({ name, biz, email, pass }) {
    try {
      const em = (email || '').toLowerCase().trim();
      if (!name.trim() || !biz.trim() || !em) throw new Error('Please fill in every field.');
      if (!passOK(pass)) throw new Error('Password must be at least 8 characters and include a letter and a number.');

      if (supaAuth.configured()) {
        setAuthBusy(true);
        try {
          const res = await supaAuth.signUp(em, pass, { full_name: name.trim(), business_name: biz.trim() });
          if (!res.session) { setAuthErr('Account created — confirm your email, then sign in.'); return; }
          const u = await adoptExternal(em, name, biz);
          setAuthErr(''); await loadUser(em, u); showToast('Welcome to Alsaiti Growth');
          const ob0 = { status: 'in_progress', step: 0, answers: { crm_mode: 'hybrid', services: [], business_name: biz.trim(), main_email: em } };
          await store.set('onboard_' + em, ob0); setOnboardState(ob0); setScreen('onboarding');
        } finally { setAuthBusy(false); }
        return;
      }

      /* Offline fallback: local demo account (clearly not real security). */
      const u = { ...usersRef.current };
      if (u[em]) throw new Error('An account with this email already exists.');
      const salt = makeSalt();
      u[em] = { name: name.trim().slice(0, 60), biz: biz.trim().slice(0, 80), email: em, salt, pass: hashPass(pass, salt) };
      usersRef.current = u; await store.set('av_users', u); await store.set('av_session', em);
      setAuthErr(''); await loadUser(em, u); showToast('Welcome to Alsaiti Growth');
      const ob0 = { status: 'in_progress', step: 0, answers: { crm_mode: 'hybrid', services: [], business_name: biz.trim(), main_email: em } };
      await store.set('onboard_' + em, ob0); setOnboardState(ob0); setScreen('onboarding');
    } catch (e) { setAuthErr(authErrorText(e.message)); }
  }
  async function doLogin({ email, pass }) {
    try {
      const em = (email || '').toLowerCase().trim();
      const lk = await store.get('av_lock', {});
      const rec = lk[em];
      if (rec && rec.until && rec.until > Date.now()) throw new Error('Too many failed attempts. Please try again in a few minutes.');
      if (!em || /^(__proto__|constructor|prototype)$/.test(em)) throw new Error('Incorrect email or password.');

      /* Real auth first: Supabase verifies the password server-side. Local accounts are only
         consulted as a fallback (demo account / offline), never for a Supabase-backed user. */
      const localAcc = Object.prototype.hasOwnProperty.call(usersRef.current, em) ? usersRef.current[em] : null;
      const isLocalDemo = localAcc && localAcc.auth !== 'supabase' && localAcc.pass;
      if (supaAuth.configured() && !isLocalDemo) {
        setAuthBusy(true);
        try {
          await supaAuth.signIn(em, pass);
          const u = await adoptExternal(em, localAcc && localAcc.name, localAcc && localAcc.biz);
          if (lk[em]) { delete lk[em]; await store.set('av_lock', lk); }
          setAuthErr(''); await loadUser(em, u); showToast('Signed in securely');
        } finally { setAuthBusy(false); }
        return;
      }
      const acc = Object.prototype.hasOwnProperty.call(usersRef.current, em) ? usersRef.current[em] : null;
      let ok = false;
      if (acc) {
        if (acc.salt) { ok = acc.pass === hashPass(pass, acc.salt); }
        else if (acc.pass === legacyHash(pass)) {
          // migrate legacy accounts to salted hashing on first successful login
          ok = true;
          const u = { ...usersRef.current };
          const salt = makeSalt();
          u[em] = { ...acc, salt, pass: hashPass(pass, salt) };
          usersRef.current = u; await store.set('av_users', u);
        }
      }
      if (!ok) {
        const r = rec || { n: 0 }; r.n = (r.n || 0) + 1;
        if (r.n >= 5) { r.until = Date.now() + 5 * 60000; r.n = 0; }
        lk[em] = r; await store.set('av_lock', lk);
        throw new Error('Incorrect email or password.');
      }
      if (lk[em]) { delete lk[em]; await store.set('av_lock', lk); }
      await store.set('av_session', em); setAuthErr(''); await loadUser(em, usersRef.current); showToast('Signed in');
    } catch (e) { setAuthErr(authErrorText(e.message)); }
  }
  async function doDemo() {
    const em = 'demo@alsaiti.app'; const u = { ...usersRef.current };
    if (!u[em] || !u[em].salt) {
      const salt = makeSalt();
      u[em] = { name: 'Demo User', biz: 'Bright Smile Dental', email: em, salt, pass: hashPass('demo1234', salt) };
      usersRef.current = u; await store.set('av_users', u);
    }
    await store.set('av_session', em); await loadUser(em, usersRef.current);
    let ob = await store.get('onboard_' + em, null);
    if (!ob || ob.status !== 'complete') {
      ob = { status: 'complete', step: 6, completed: Date.now(), answers: { crm_mode: 'hybrid', business_name: 'Bright Smile Dental', industry: 'Dental clinic', main_email: em, services: [{ name: 'Dental implant consult', category: 'Implants', value: 'High' }, { name: 'Invisalign consultation', category: 'Orthodontics', value: 'High' }], ch_email: true, ev_new: true, ev_urgent: true } };
      await store.set('onboard_' + em, ob);
    }
    setOnboardState(ob);
    showToast('Welcome to the live demo');
  }
  async function logout() { await store.del('av_session'); try { await supaAuth.signOut(); } catch (e) {} /* drop the JWT too */ setSession(null); setProfile(null); setLeads([]); setCrm({ mode: 'hybrid', conns: [], events: [], syncs: {}, attempts: [] }); setOnboardState(null); setScreen('landing'); showToast('Signed out'); }
  async function saveLeads(next) { setLeads(next); if (session) await store.set('leads_' + session, next); }
  const persistCrm = async (next) => { setCrm(next); if (session) await store.set('crm_' + session, next); };
  const crmEmitLead = async (eventType, lead) => { await persistCrm(crmEmit(crm, eventType, lead)); };
  const openLead = (id) => { setActiveId(id); setScreen('lead'); };
  const addLead = (l) => { saveLeads([l, ...leads]); crmEmitLead('lead.created', l); setScreen('leads'); showToast('Lead added'); };
  const moveStatus = (id, st) => {
    const nextLeads = leads.map((l) => (l.id === id ? { ...l, status: st } : l));
    saveLeads(nextLeads);
    const moved = nextLeads.find((l) => l.id === id);
    if (moved) { let next = crm; crmStatusEvents(st).forEach((ev) => { next = crmEmit(next, ev, moved); }); persistCrm(next); }
    showToast('Moved to ' + st);
  };
  const saveNote = (id, note) => { saveLeads(leads.map((l) => (l.id === id ? { ...l, notes: note } : l))); showToast('Note saved'); };
  const deleteLead = (id) => { saveLeads(leads.filter((l) => l.id !== id)); setScreen('leads'); showToast('Lead deleted'); };
  async function resetData() { const l = seedLeads(); await saveLeads(l); await persistCrm(crmSeed(l)); showToast('Sample data restored'); }
  async function saveProfile(p) { setProfile(p); if (session) await store.set('profile_' + session, p); showToast('Settings saved'); }
  const crmConnect = async ({ provider, name, account, triggers, actions }) => {
    const conn = { id: 'conn_' + crmRand(8), provider, name, status: 'connected', account, portal: provider === 'hubspot' ? String(20000000 + Math.floor(Math.random() * 9000000)) : '', sync_enabled: true, triggers, actions, pipeline: 'Sales Pipeline', stage: 'New Lead', owner: 'Front desk', tags: ['alsaiti-voice'], mapping: crmDefaultMapping(), synced: 0, last_success: null, last_failure: null, last_error: null, connected_at: Date.now(), tested_at: Date.now(), health: 'healthy' };
    let next = crmClone(crm); next.conns.push(conn);
    leads.slice(0, 3).forEach((l) => { next = crmEmit(next, 'lead.created', l); });
    await persistCrm(next); showToast(name + ' connected');
  };
  const crmSetEnabled = async (id, on) => { const next = crmClone(crm); const c = next.conns.find((x) => x.id === id); if (c) { c.sync_enabled = on; if (on) c.status = 'connected'; } await persistCrm(next); showToast(on ? 'Sync resumed' : 'Sync paused'); };
  const crmTest = async (id) => { const next = crmClone(crm); const c = next.conns.find((x) => x.id === id); if (c) { c.tested_at = Date.now(); c.health = 'healthy'; c.last_error = null; } await persistCrm(next); showToast('Connection healthy'); };
  const crmDisconnectConn = (id, name) => { Alert.alert('Disconnect ' + name, 'Leads stay safe; syncing will stop.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Disconnect', style: 'destructive', onPress: async () => { const next = crmClone(crm); const c = next.conns.find((x) => x.id === id); if (c) { c.status = 'disconnected'; c.sync_enabled = false; } await persistCrm(next); showToast(name + ' disconnected'); } }]); };
  const crmRetrySync = async (connId, leadId) => {
    const next = crmClone(crm); const c = next.conns.find((x) => x.id === connId); const key = connId + '|' + leadId; const rec = next.syncs[key];
    if (c && rec) {
      const ext = { contact: crmExtId(c.provider) }; if ((c.actions || []).indexOf('deal') >= 0) ext.deal = crmExtId(c.provider);
      next.syncs[key] = { ...rec, status: 'synced', ext, error: null, last_synced: Date.now(), url: crmRecordUrl(c, ext) };
      c.synced = (c.synced || 0) + 1; c.last_success = Date.now(); c.health = 'healthy'; c.last_error = null;
      next.attempts.unshift({ id: 'att_' + crmRand(6), event_id: 'evt_' + crmRand(20), conn: c.id, provider: c.provider, lead_id: leadId, lead_name: rec.lead_name, event_type: 'lead.created', status: 'success', code: 201, actions: crmActionsList(c, true), at: Date.now() });
    }
    await persistCrm(next); showToast('Sync retried — success');
  };
  const crmSetMode = async (mode) => { const next = crmClone(crm); next.mode = mode; await persistCrm(next); };
  const persistOnboard = async (ob) => { setOnboardState(ob); if (session) await store.set('onboard_' + session, ob); };
  const onboardActivate = async (answers) => {
    await persistOnboard({ status: 'complete', step: 6, completed: Date.now(), answers });
    const p = { ...(profile || {}), biz: answers.business_name || (profile && profile.biz), industry: answers.industry || (profile && profile.industry) };
    await saveProfile(p);
    const next = crmClone(crm); next.mode = answers.crm_mode || 'hybrid'; await persistCrm(next);
    setScreen('dashboard'); showToast('Your workspace is live 🎉');
  };
  const onboardLaunch = () => { if (!onboard) setOnboardState({ status: 'in_progress', step: 0, answers: { crm_mode: crm.mode || 'hybrid', services: [] } }); setScreen('onboarding'); };
  const dashTestLead = () => {
    const svc = (onboard && onboard.answers && onboard.answers.services && onboard.answers.services[0] && onboard.answers.services[0].name) || 'Test enquiry';
    const lead = { id: uid(), name: 'Test Lead (setup)', service: svc, urgency: 'Medium', source: 'Manual import', status: 'New', score: 70, at: Date.now(), phone: '+44 7700 900000', email: 'test@alsaitigrowth.com', summary: 'Clearly-marked TEST lead. Safe to delete.', notes: '', assignee: 'Unassigned', isTest: true };
    saveLeads([lead, ...leads]); crmEmitLead('lead.created', lead); setScreen('leads'); showToast('Test lead created');
  };

  let body;
  if (!booted) body = <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.cyan} /></View>;
  else if (!session) {
    if (screen === 'landing') body = <Landing onDemo={doDemo} onGetStarted={() => { setAuthErr(''); setAuthMode('signup'); setScreen('auth'); }} onSignin={() => { setAuthErr(''); setAuthMode('login'); setScreen('auth'); }} />;
    else body = <AuthScreen mode={authMode} error={authErr} onSubmit={authMode === 'signup' ? doSignup : doLogin} onSwitch={() => { setAuthErr(''); setAuthMode(authMode === 'signup' ? 'login' : 'signup'); }} onBack={() => { setAuthErr(''); setScreen('landing'); }} />;
  } else {
    const user = usersRef.current[session];
    let screenEl;
    if (screen === 'dashboard') screenEl = <Dashboard leads={leads} crm={crm} onboard={onboard} onOpen={openLead} onNew={() => setScreen('new')} onTest={dashTestLead} onSetup={onboardLaunch} />;
    else if (screen === 'leads') screenEl = <Leads leads={leads} crm={crm} onOpen={openLead} onNew={() => setScreen('new')} />;
    else if (screen === 'voice') screenEl = <VoiceScreen onCreateLead={(l) => { saveLeads([l, ...leads]); crmEmitLead('lead.created', l); }} showToast={showToast} />;
    else if (screen === 'integrations') screenEl = <Integrations crm={crm} mode={crm.mode} onSetMode={crmSetMode} onConnect={crmConnect} onPause={(id) => crmSetEnabled(id, false)} onResume={(id) => crmSetEnabled(id, true)} onDisconnect={crmDisconnectConn} onTest={crmTest} onRetry={crmRetrySync} />;
    else if (screen === 'onboarding') screenEl = <Onboarding onboard={onboard} crm={crm} onSetMode={crmSetMode} onConnectCrm={crmConnect} onActivate={onboardActivate} onExit={async (st, ans) => { await persistOnboard({ status: (onboard && onboard.status === 'complete') ? 'complete' : 'in_progress', step: st, answers: ans }); setScreen('dashboard'); }} />;
    else if (screen === 'analytics') screenEl = <Analytics leads={leads} />;
    else if (screen === 'settings') screenEl = <Settings profile={profile} user={user} leadCount={leads.length} onSave={saveProfile} onLogout={logout} onReset={resetData} />;
    else if (screen === 'new') screenEl = <NewLead onSave={addLead} onCancel={() => setScreen('leads')} />;
    else if (screen === 'lead') { const l = leads.find((x) => x.id === activeId); screenEl = l ? <LeadDetail lead={l} crmSyncs={crmLeadSyncs(crm, l.id)} onRetry={crmRetrySync} onMove={moveStatus} onNote={saveNote} onDelete={deleteLead} onBack={() => setScreen('leads')} /> : <Dashboard leads={leads} crm={crm} onboard={onboard} onOpen={openLead} onNew={() => setScreen('new')} onTest={dashTestLead} onSetup={onboardLaunch} />; }
    else screenEl = <Dashboard leads={leads} crm={crm} onboard={onboard} onOpen={openLead} onNew={() => setScreen('new')} onTest={dashTestLead} onSetup={onboardLaunch} />;
    const tabActive = ['lead', 'new'].includes(screen) ? 'leads' : screen;
    body = (
      <View style={{ flex: 1 }}>
        <View style={s.topbar}>
          <LinearGradient colors={[C.primary, C.glow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.logo}><Icon name="mic" size={18} color="#fff" sw={2} /></LinearGradient>
          <View><Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>Alsaiti Growth</Text><Text style={{ color: C.muted, fontSize: 10.5 }}>{profile?.biz || user?.biz}</Text></View>
          <View style={{ flex: 1 }} />
          <Avatar name={user?.name || 'A'} size={36} />
        </View>
        <View style={{ flex: 1 }}>{screenEl}</View>
        <View style={s.tabbar}>
          {TABS.map((t) => {
            const on = tabActive === t[0];
            return (
              <Pressable key={t[0]} style={s.tab} onPress={() => setScreen(t[0])}>
                <View style={[s.tabIcon, on && s.tabIconOn]}><Icon name={t[2]} size={20} color={on ? C.cyan : C.muted} sw={on ? 2.1 : 1.8} /></View>
                <Text style={{ fontSize: 9.5, fontWeight: on ? '700' : '500', color: on ? C.cyan : C.muted, marginTop: 3 }}>{t[1]}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <BackgroundGlow />
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        {body}
      </SafeAreaView>
      {toast ? <View style={s.toast}><Icon name="check" size={16} color={C.green} sw={2.4} /><Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>{toast}</Text></View> : null}
    </View>
  );
}

const shadow = (e, col = '#000') => Platform.select({ ios: { shadowColor: col, shadowOpacity: 0.35, shadowRadius: e, shadowOffset: { width: 0, height: e / 2 } }, android: { elevation: e } });
const s = StyleSheet.create({
  safe: { flex: 1, paddingTop: Platform.OS === 'android' ? 28 : 0 },
  scroll: { padding: 16, paddingBottom: 34 },
  h1: { color: C.text, fontSize: 23, fontWeight: '800' },
  sub: { color: C.muted, fontSize: 13, marginTop: 4 },
  section: { color: C.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 20, marginBottom: 10 },
  body: { color: C.text, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16, ...shadow(5) },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  logo: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', ...shadow(8, C.glow) },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  iconBtn: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { width: '47%', flexGrow: 1 },
  statLabel: { color: C.muted, fontSize: 12 },
  statValue: { color: C.text, fontSize: 26, fontWeight: '800', marginTop: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  barTrack: { flex: 1, height: 9, borderRadius: 999, backgroundColor: 'rgba(148,163,199,0.18)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999, backgroundColor: C.primary },
  leadCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 12, marginBottom: 10, ...shadow(4) },
  leadName: { color: C.text, fontSize: 15, fontWeight: '600' },
  leadSub: { color: C.muted, fontSize: 13, marginTop: 2 },
  leadMeta: { color: C.muted, fontSize: 12 },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 7, marginRight: 8, backgroundColor: C.card },
  chipActive: { backgroundColor: C.cyan, borderColor: C.cyan, ...shadow(5, C.glow) },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  label: { color: C.muted, fontSize: 13, marginBottom: 6 },
  input: { backgroundColor: 'rgba(2,11,31,0.6)', borderWidth: 1, borderColor: C.border, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 11, color: C.text, fontSize: 14 },
  gradBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14, ...shadow(8, C.glow) },
  gradBtnText: { fontWeight: '800', fontSize: 15 },
  ghostBtn: { borderWidth: 1, borderColor: C.border, backgroundColor: C.card, borderRadius: 11, paddingHorizontal: 16, paddingVertical: 9 },
  ghostBtnText: { color: C.text, fontWeight: '700', fontSize: 14 },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,122,138,0.5)', borderRadius: 12, paddingVertical: 13, marginTop: 14 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.border },
  kvK: { color: C.muted, fontSize: 13 },
  kvV: { color: C.text, fontSize: 13, fontWeight: '600' },
  featIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(58,166,255,0.14)', borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroTitle: { color: C.text, fontSize: 34, fontWeight: '800', textAlign: 'center', lineHeight: 38 },
  heroSub: { color: C.muted, fontSize: 15, textAlign: 'center', marginTop: 14, lineHeight: 22 },
  vmic: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', ...shadow(10, C.glow) },
  voiceInput: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 12 },
  sendBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '88%', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 13, marginBottom: 8 },
  bubbleBot: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.border, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: C.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border, backgroundColor: 'rgba(7,23,53,0.96)', paddingVertical: 8, paddingBottom: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  tabIcon: { width: 40, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabIconOn: { backgroundColor: 'rgba(89,199,255,0.14)', borderWidth: 1, borderColor: 'rgba(89,199,255,0.28)' },
  smallBtn: { borderWidth: 1, borderColor: C.border, backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  smallBtnText: { color: C.text, fontWeight: '700', fontSize: 13 },
  connectBtn: { backgroundColor: C.cyan, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, ...shadow(5, C.glow) },
  section2: { color: C.cyan, fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8, marginBottom: 8 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(2,8,22,0.7)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalCard: { width: '100%', maxWidth: 460, backgroundColor: '#0B1730', borderWidth: 1, borderColor: C.borderHi, borderRadius: 18, padding: 18, ...shadow(14) },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.border, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, backgroundColor: 'rgba(2,11,31,0.4)' },
  checkRowOn: { borderColor: C.primary, backgroundColor: 'rgba(58,166,255,0.1)' },
  checkBox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: C.borderHi, alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: C.primary, borderColor: C.primary },
  setupBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C.borderHi, borderRadius: 16, padding: 14, marginBottom: 14, backgroundColor: 'rgba(58,166,255,0.12)' },
  setupIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: 'rgba(58,166,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  qa: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 12, backgroundColor: C.card, gap: 8 },
  qaIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(58,166,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  qaText: { color: C.text, fontSize: 12.5, fontWeight: '700' },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  modeBtn: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 11, paddingVertical: 9, alignItems: 'center', backgroundColor: C.card },
  modeBtnOn: { backgroundColor: C.cyan, borderColor: C.cyan },
  modeText: { color: C.muted, fontWeight: '700', fontSize: 13 },
  obStepno: { color: C.cyan, fontSize: 12.5, fontWeight: '700' },
  obProg: { height: 6, borderRadius: 999, backgroundColor: 'rgba(148,163,199,0.2)', overflow: 'hidden' },
  obProgFill: { height: '100%', borderRadius: 999, backgroundColor: C.cyan },
  obSvc: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 11, marginTop: 8, backgroundColor: 'rgba(2,11,31,0.4)' },
  obOpt: { borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginTop: 10, backgroundColor: 'rgba(2,11,31,0.4)' },
  obOptOn: { borderColor: C.borderHi, backgroundColor: 'rgba(58,166,255,0.1)' },
  obRev: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 8, backgroundColor: 'rgba(2,11,31,0.4)' },
  toast: { position: 'absolute', left: 20, right: 20, bottom: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.borderHi, borderRadius: 12, paddingVertical: 12, ...shadow(12) },
});
