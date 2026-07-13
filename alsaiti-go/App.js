import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView, ScrollView, View, Text, Pressable, TextInput, StyleSheet, StatusBar,
  Platform, Dimensions, KeyboardAvoidingView, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Rect, Defs, RadialGradient, Stop } from 'react-native-svg';
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
};
function Icon({ name, size = 22, color = C.text, sw = 1.8 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name] || null}
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
  get: async (k, d) => { try { const v = await AsyncStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: async (k, v) => { try { await AsyncStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del: async (k) => { try { await AsyncStorage.removeItem(k); } catch (e) {} },
};

/* ---------- Helpers ---------- */
const uid = () => 'LD-' + Math.random().toString(36).slice(2, 7).toUpperCase();
const initials = (n) => String(n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const cap = (s) => { s = (s || '').trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; };
const scoreColor = (v) => (v > 75 ? C.green : v > 50 ? C.cyan : '#ff9aa6');
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); }
function ago(t) {
  const s = Math.floor((Date.now() - t) / 1000); if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24); return d === 1 ? 'Yesterday' : d + 'd ago';
}
function parseUrgency(s) {
  s = (s || '').toLowerCase();
  if (/urgent|asap|emergency|today|right now|straight away|leak|no hot water|broken|urgente|hoy|emergencia|عاجل|طارئ|اليوم/.test(s)) return 'High';
  if (/no|not|just|browsing|later|whenever|no rush|enquiry|quote|no hay prisa|más tarde|luego|لاحقا|استفسار/.test(s)) return 'Low';
  return 'Medium';
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
function LeadCard({ lead, onPress }) {
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
        <LinearGradient colors={[C.primary, C.glow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.logo}><Icon name="mic" size={18} color="#fff" sw={2} /></LinearGradient>
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 22, paddingTop: 40 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 }}>
          <Icon name="back" size={18} color={C.muted} /><Text style={{ color: C.muted }}>Back</Text>
        </Pressable>
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <LinearGradient colors={[C.primary, C.glow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.logo, { width: 44, height: 44 }]}><Icon name="mic" size={22} color="#fff" sw={2} /></LinearGradient>
          <Text style={{ color: C.text, fontSize: 21, fontWeight: '800', marginTop: 12 }}>{isSignup ? 'Create your account' : 'Welcome back'}</Text>
          <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{isSignup ? 'Start capturing every enquiry.' : 'Sign in to your lead workspace.'}</Text>
        </View>
        <Card style={{ marginTop: 14 }}>
          {isSignup ? <Field label="Your name" value={name} onChangeText={setName} placeholder="Alex Carter" /> : null}
          {isSignup ? <Field label="Business name" value={biz} onChangeText={setBiz} placeholder="Bright Smile Dental" /> : null}
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@business.com" autoCapitalize="none" keyboardType="email-address" />
          <Field label="Password" value={pass} onChangeText={setPass} placeholder="At least 6 characters" secureTextEntry />
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

/* ---------- Dashboard ---------- */
function Dashboard({ leads, onOpen, onNew }) {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const today = leads.filter((l) => l.at >= dayStart.getTime()).length;
  const urgent = leads.filter((l) => l.urgency === 'High' && ['New', 'Contacted', 'Qualified'].includes(l.status)).length;
  const won = leads.filter((l) => l.status === 'Won').length;
  const active = leads.filter((l) => ['New', 'Contacted', 'Qualified', 'Booked'].includes(l.status)).length;
  const stats = [['Leads today', today], ['High priority', urgent], ['Active pipeline', active], ['Won', won]];
  const counts = {}; STATUSES.forEach((st) => { counts[st] = leads.filter((l) => l.status === st).length; });
  const maxC = Math.max(1, ...STATUSES.map((st) => counts[st]));
  const attention = leads.filter((l) => ['New', 'Qualified'].includes(l.status)).sort((a, b) => b.at - a.at).slice(0, 5);
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <H title="Dashboard" sub="Who's arrived, who's urgent, what needs action." right={<Pressable onPress={onNew} style={s.iconBtn}><Icon name="plus" size={18} color={C.cyan} sw={2} /></Pressable>} />
      <View style={s.statGrid}>
        {stats.map((st) => (
          <Card key={st[0]} style={s.stat}><Text style={s.statLabel}>{st[0]}</Text><Text style={s.statValue}>{st[1]}</Text></Card>
        ))}
      </View>
      <Text style={s.section}>Leads by status</Text>
      <Card>
        {STATUSES.map((st) => (
          <View key={st} style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 6, gap: 10 }}>
            <View style={{ width: 78 }}><Badge label={st} color={STATUS_COLOR[st]} /></View>
            <View style={s.barTrack}><View style={[s.barFill, { width: (counts[st] / maxC * 100) + '%' }]} /></View>
            <Text style={{ color: C.text, fontWeight: '700', width: 22, textAlign: 'right' }}>{counts[st]}</Text>
          </View>
        ))}
      </Card>
      <Text style={s.section}>Needs attention</Text>
      {attention.length ? attention.map((l) => <LeadCard key={l.id} lead={l} onPress={() => onOpen(l.id)} />)
        : <Card><Text style={s.body}>Nothing urgent right now — you're all caught up.</Text></Card>}
    </ScrollView>
  );
}

/* ---------- Leads ---------- */
function Leads({ leads, onOpen, onNew }) {
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
      {list.length ? list.map((l) => <LeadCard key={l.id} lead={l} onPress={() => onOpen(l.id)} />)
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
function LeadDetail({ lead, onMove, onNote, onDelete, onBack }) {
  const [note, setNote] = useState(lead.notes || '');
  const info = [['Phone', lead.phone || '—'], ['Email', lead.email || '—'], ['Service', lead.service], ['Urgency', lead.urgency], ['Source', lead.source], ['Assignee', lead.assignee || '—']];
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
// read long digit runs (phone numbers) one digit at a time so TTS never says "million"
const speechClean = (text) => String(text).replace(/[+]?\d[\d ]{3,}\d/g, (m) => m.replace(/[^\d]/g, '').split('').join(' '));
const fillTpl = (str, p) => String(str).replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? p[k] : m));
const VT = {
  en: {
    title: 'AI receptionist', sub: 'Talk to your AI receptionist — it greets the caller, qualifies them, and creates a lead.',
    start: 'Start call', end: 'End call', intro: 'Tap “Start call” and talk to your AI receptionist.',
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
function VoiceScreen({ onCreateLead, showToast }) {
  const [lang, setLang] = useState('en');
  const T = VT[lang];
  const rtl = lang === 'ar';
  const voice = useRef({ active: false, step: 0, data: {}, urgent: false }).current;
  const [transcript, setTranscript] = useState([]);
  const [status, setStatus] = useState(VT.en.intro);
  const [input, setInput] = useState('');
  const [active, setActive] = useState(false);
  const speak = (txt) => { try { Speech.stop(); Speech.speak(speechClean(txt), { language: VTTS[lang], rate: lang === 'ar' ? 0.95 : 1.0 }); } catch (e) {} };
  const add = (who, text) => setTranscript((p) => [...p, { who, text }]);
  const askText = () => {
    const which = QORDER[voice.step];
    const name = cap(voice.data.name || '') || T.defName;
    let txt = fillTpl(T[which], { name });
    if (which === 'phone' && voice.urgent) txt = T.ack + ' ' + txt;
    return txt;
  };
  const ask = () => { const txt = askText(); add('bot', txt); speak(txt); setStatus(T.yourTurn); };
  const start = () => { voice.active = true; voice.step = 0; voice.data = {}; voice.urgent = false; setActive(true); setTranscript([]); ask(); };
  const finish = () => {
    voice.active = false; setActive(false);
    const d = voice.data;
    const name = cap(d.name || '') || T.defName;
    const leadName = cap(d.name || '') || 'Voice caller';
    const service = (d.service || '').trim() || T.defService;
    const urgency = parseUrgency(d.urgency);
    const phone = (d.phone || '').replace(/[^0-9+ ]/g, '').trim();
    const score = urgency === 'High' ? Math.floor(82 + Math.random() * 14) : urgency === 'Medium' ? Math.floor(62 + Math.random() * 16) : Math.floor(45 + Math.random() * 15);
    onCreateLead({ id: uid(), name: leadName, service, urgency, source: 'Voice call', status: 'New', score, at: Date.now(), phone, email: '', summary: 'Captured by the Alsaiti Growth AI receptionist. Caller: ' + leadName + '. Needs: ' + service + '. Urgency: ' + urgency + '.', notes: '', assignee: 'Unassigned' });
    const msg = fillTpl(urgency === 'High' ? T.closeUrgent : T.close, { name, service, phone: phone || '' });
    add('bot', msg); speak(msg); setStatus(T.created); showToast(T.toast);
  };
  const send = () => {
    const v = input.trim(); if (!v || !voice.active) return; setInput(''); add('user', v);
    const key = QKEY[voice.step]; voice.data[key] = v;
    if (key === 'urgency') voice.urgent = parseUrgency(v) === 'High';
    voice.step += 1;
    if (voice.step < QORDER.length) ask(); else finish();
  };
  const end = () => { voice.active = false; setActive(false); try { Speech.stop(); } catch (e) {} setStatus(T.ended); };
  const switchLang = (l) => { if (voice.active) end(); setLang(l); setTranscript([]); setStatus(VT[l].intro); };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <H title={T.title} sub={T.sub} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
          {VLANGS.map(([code, lbl]) => (
            <Pressable key={code} onPress={() => switchLang(code)} style={[s.chip, { marginRight: 0 }, lang === code && s.chipActive]}>
              <Text style={{ color: lang === code ? '#04223f' : C.muted, fontWeight: '700', fontSize: 13 }}>{lbl}</Text>
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
              <View key={i} style={[s.bubble, m.who === 'user' ? s.bubbleUser : s.bubbleBot]}>
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
      <Card>
        {funnel.map((f) => (
          <View key={f[0]} style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 6, gap: 10 }}>
            <Text style={{ color: C.text, width: 78 }}>{f[0]}</Text>
            <View style={s.barTrack}><View style={[s.barFill, { width: f[1] + '%' }]} /></View>
            <Text style={{ color: C.text, fontWeight: '700', width: 54, textAlign: 'right' }}>{f[2]} · {f[1]}%</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

/* ---------- Settings ---------- */
function Settings({ profile, user, leadCount, onSave, onLogout, onReset }) {
  const [biz, setBiz] = useState(profile?.biz || user?.biz || '');
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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

/* ---------- App ---------- */
const TABS = [['dashboard', 'Home', 'grid'], ['leads', 'Leads', 'users'], ['voice', 'Voice', 'mic'], ['analytics', 'Stats', 'chart'], ['settings', 'More', 'cog']];

export default function App() {
  const [booted, setBooted] = useState(false);
  const usersRef = useRef({});
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [leads, setLeads] = useState([]);
  const [screen, setScreen] = useState('landing');
  const [activeId, setActiveId] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authErr, setAuthErr] = useState('');
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
    let l = await store.get('leads_' + em, null);
    if (l == null) { l = seedLeads(); await store.set('leads_' + em, l); }
    setLeads(l);
    setProfile(await store.get('profile_' + em, { biz: u[em].biz, email: em }));
    setScreen('dashboard');
  }
  async function doSignup({ name, biz, email, pass }) {
    try {
      const em = (email || '').toLowerCase().trim();
      if (!name.trim() || !biz.trim() || !em) throw new Error('Please fill in every field.');
      if ((pass || '').length < 6) throw new Error('Password must be at least 6 characters.');
      const u = { ...usersRef.current };
      if (u[em]) throw new Error('An account with this email already exists.');
      u[em] = { name: name.trim(), biz: biz.trim(), email: em, pass: hash(pass) };
      usersRef.current = u; await store.set('av_users', u); await store.set('av_session', em);
      setAuthErr(''); await loadUser(em, u); showToast('Welcome to Alsaiti Growth');
    } catch (e) { setAuthErr(e.message); }
  }
  async function doLogin({ email, pass }) {
    try {
      const em = (email || '').toLowerCase().trim(); const acc = usersRef.current[em];
      if (!acc || acc.pass !== hash(pass)) throw new Error('Incorrect email or password.');
      await store.set('av_session', em); setAuthErr(''); await loadUser(em, usersRef.current); showToast('Signed in');
    } catch (e) { setAuthErr(e.message); }
  }
  async function doDemo() {
    const em = 'demo@alsaiti.app'; const u = { ...usersRef.current };
    if (!u[em]) { u[em] = { name: 'Demo User', biz: 'Bright Smile Dental', email: em, pass: hash('demo1234') }; usersRef.current = u; await store.set('av_users', u); }
    await store.set('av_session', em); await loadUser(em, usersRef.current); showToast('Welcome to the live demo');
  }
  async function logout() { await store.del('av_session'); setSession(null); setProfile(null); setLeads([]); setScreen('landing'); showToast('Signed out'); }
  async function saveLeads(next) { setLeads(next); if (session) await store.set('leads_' + session, next); }
  const openLead = (id) => { setActiveId(id); setScreen('lead'); };
  const addLead = (l) => { saveLeads([l, ...leads]); setScreen('leads'); showToast('Lead added'); };
  const moveStatus = (id, st) => { saveLeads(leads.map((l) => (l.id === id ? { ...l, status: st } : l))); showToast('Moved to ' + st); };
  const saveNote = (id, note) => { saveLeads(leads.map((l) => (l.id === id ? { ...l, notes: note } : l))); showToast('Note saved'); };
  const deleteLead = (id) => { saveLeads(leads.filter((l) => l.id !== id)); setScreen('leads'); showToast('Lead deleted'); };
  async function resetData() { const l = seedLeads(); await saveLeads(l); showToast('Sample data restored'); }
  async function saveProfile(p) { setProfile(p); if (session) await store.set('profile_' + session, p); showToast('Settings saved'); }

  let body;
  if (!booted) body = <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.cyan} /></View>;
  else if (!session) {
    if (screen === 'landing') body = <Landing onDemo={doDemo} onGetStarted={() => { setAuthErr(''); setAuthMode('signup'); setScreen('auth'); }} onSignin={() => { setAuthErr(''); setAuthMode('login'); setScreen('auth'); }} />;
    else body = <AuthScreen mode={authMode} error={authErr} onSubmit={authMode === 'signup' ? doSignup : doLogin} onSwitch={() => { setAuthErr(''); setAuthMode(authMode === 'signup' ? 'login' : 'signup'); }} onBack={() => { setAuthErr(''); setScreen('landing'); }} />;
  } else {
    const user = usersRef.current[session];
    let screenEl;
    if (screen === 'dashboard') screenEl = <Dashboard leads={leads} onOpen={openLead} onNew={() => setScreen('new')} />;
    else if (screen === 'leads') screenEl = <Leads leads={leads} onOpen={openLead} onNew={() => setScreen('new')} />;
    else if (screen === 'voice') screenEl = <VoiceScreen onCreateLead={(l) => saveLeads([l, ...leads])} showToast={showToast} />;
    else if (screen === 'analytics') screenEl = <Analytics leads={leads} />;
    else if (screen === 'settings') screenEl = <Settings profile={profile} user={user} leadCount={leads.length} onSave={saveProfile} onLogout={logout} onReset={resetData} />;
    else if (screen === 'new') screenEl = <NewLead onSave={addLead} onCancel={() => setScreen('leads')} />;
    else if (screen === 'lead') { const l = leads.find((x) => x.id === activeId); screenEl = l ? <LeadDetail lead={l} onMove={moveStatus} onNote={saveNote} onDelete={deleteLead} onBack={() => setScreen('leads')} /> : <Dashboard leads={leads} onOpen={openLead} onNew={() => setScreen('new')} />; }
    else screenEl = <Dashboard leads={leads} onOpen={openLead} onNew={() => setScreen('new')} />;
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
  toast: { position: 'absolute', left: 20, right: 20, bottom: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.borderHi, borderRadius: 12, paddingVertical: 12, ...shadow(12) },
});
