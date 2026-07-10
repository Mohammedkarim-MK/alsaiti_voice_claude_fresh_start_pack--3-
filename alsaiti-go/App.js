import React, { useMemo, useState } from 'react';
import {
  SafeAreaView, ScrollView, View, Text, Pressable, StyleSheet, StatusBar, Platform,
} from 'react-native';

/* ---------- Brand (Alsaiti Growth) ---------- */
const C = {
  bg: '#020B1F', card: 'rgba(11,27,58,0.85)', primary: '#3AA6FF', cyan: '#59C7FF',
  glow: '#1E90FF', text: '#F5F9FF', muted: '#93A8C7', border: 'rgba(83,167,255,0.18)',
  green: '#57E39A', amber: '#FBBF5A', red: '#FF7A8A',
};

const STATUS_COLOR = { New: C.cyan, Contacted: '#C3D3EA', Booked: C.green, 'Follow-up': '#B6A9FF' };
const URGENCY_COLOR = { Hot: C.red, Warm: C.amber };

/* ---------- Data (mirrors alsaitigrowth.com dashboard) ---------- */
const STATS = [
  { label: "Today's Enquiries", value: '47', delta: '+12' },
  { label: 'Missed Calls Recovered', value: '9', delta: '+3' },
  { label: 'Hot Leads', value: '14', delta: '+6' },
  { label: 'Follow-ups Sent', value: '86', delta: '+22' },
];
const REVENUE = { label: 'Revenue Protected', value: '£18.4k', delta: '+24%' };

const LEADS = [
  { id: '1', name: 'Sarah Mitchell', service: 'Dental consultation', urgency: 'Hot', status: 'Booked' },
  { id: '2', name: "James O'Connor", service: 'Property viewing', urgency: 'Hot', status: 'Contacted' },
  { id: '3', name: 'Aisha Rahman', service: 'Boiler repair quote', urgency: 'Warm', status: 'New' },
  { id: '4', name: 'Daniel Carter', service: 'Implant enquiry', urgency: 'Hot', status: 'Follow-up' },
  { id: '5', name: 'Lucia Romero', service: 'Rental viewing', urgency: 'Warm', status: 'Contacted' },
  { id: '6', name: 'Tom Whitfield', service: 'Emergency plumbing', urgency: 'Hot', status: 'Booked' },
];

const INDUSTRIES = [
  { t: 'Dental Clinics', d: 'Book more consultations, recover missed calls, and fill your appointment book automatically.' },
  { t: 'Letting Agents', d: 'Qualify tenants, arrange viewings, and respond to property enquiries within seconds.' },
  { t: 'Home Services', d: 'Capture emergency jobs, send quote requests to your team, and never miss a customer call.' },
  { t: 'Custom AI System', d: "Tell us your workflow and we'll build a tailored AI receptionist around your business." },
];

const STEPS = [
  'Customer calls or messages your business',
  'Your AI responds instantly, 24/7',
  'Lead details are captured automatically',
  'Your team gets notified straight away',
  'Everything appears in your live dashboard',
];

/* ---------- UI helpers ---------- */
const Badge = ({ label, color }) => (
  <View style={[s.badge, { borderColor: color + '66', backgroundColor: color + '22' }]}>
    <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{label}</Text>
  </View>
);
const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;
const H = ({ title, sub }) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={s.h1}>{title}</Text>
    {sub ? <Text style={s.sub}>{sub}</Text> : null}
  </View>
);

const LeadRow = ({ lead }) => (
  <View style={s.leadRow}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={s.leadName}>{lead.name}</Text>
      <Text style={s.leadMeta}>{lead.service}</Text>
    </View>
    <Badge label={lead.urgency} color={URGENCY_COLOR[lead.urgency]} />
    <Badge label={lead.status} color={STATUS_COLOR[lead.status] || C.muted} />
  </View>
);

/* ---------- Screens ---------- */
function Home() {
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Text style={s.h1}>Live Dashboard</Text>
        <View style={s.livePill}><View style={s.liveDot} /><Text style={s.liveText}>Live</Text></View>
      </View>
      <Text style={s.sub}>Every lead. Every call. In one place.</Text>

      <View style={s.statGrid}>
        {STATS.map((st) => (
          <Card key={st.label} style={s.stat}>
            <Text style={s.statLabel}>{st.label}</Text>
            <Text style={s.statValue}>{st.value}</Text>
            <Text style={s.statDelta}>{st.delta}</Text>
          </Card>
        ))}
      </View>

      <Card style={{ marginTop: 4, borderColor: C.cyan + '55' }}>
        <Text style={s.statLabel}>{REVENUE.label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
          <Text style={[s.statValue, { fontSize: 30, color: C.green }]}>{REVENUE.value}</Text>
          <Text style={[s.statDelta, { marginBottom: 6 }]}>{REVENUE.delta}</Text>
        </View>
      </Card>

      <Text style={s.section}>Recent leads</Text>
      <Card style={{ padding: 6 }}>
        {LEADS.map((l) => <LeadRow key={l.id} lead={l} />)}
      </Card>
    </ScrollView>
  );
}

function Leads() {
  const [filter, setFilter] = useState('All');
  const chips = ['All', 'New', 'Contacted', 'Booked', 'Follow-up'];
  const list = useMemo(
    () => (filter === 'All' ? LEADS : LEADS.filter((l) => l.status === filter)),
    [filter]
  );
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <H title="Leads" sub="Every enquiry your AI receptionist captured." />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {chips.map((c) => (
          <Pressable key={c} onPress={() => setFilter(c)}
            style={[s.chip, filter === c && { borderColor: C.primary, backgroundColor: 'rgba(58,166,255,0.16)' }]}>
            <Text style={{ color: filter === c ? C.text : C.muted, fontSize: 13, fontWeight: '600' }}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Card style={{ padding: 6 }}>
        {list.length ? list.map((l) => <LeadRow key={l.id} lead={l} />)
          : <Text style={{ color: C.muted, padding: 16 }}>No leads in this status.</Text>}
      </Card>
    </ScrollView>
  );
}

function Industries() {
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <H title="Industries" sub="Built for businesses that live on enquiries." />
      {INDUSTRIES.map((i) => (
        <Card key={i.t} style={{ marginBottom: 12, borderLeftColor: C.primary, borderLeftWidth: 3 }}>
          <Text style={s.cardTitle}>{i.t}</Text>
          <Text style={s.body}>{i.d}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

function Steps() {
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <H title="How it works" sub="Five simple steps. One smarter business." />
      {STEPS.map((step, i) => (
        <View key={i} style={s.stepRow}>
          <View style={s.stepNum}><Text style={s.stepNumText}>{String(i + 1).padStart(2, '0')}</Text></View>
          <Text style={[s.body, { flex: 1 }]}>{step}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function Contact() {
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <H title="Request your growth analysis" sub="We'll recommend the best AI system for your workflow." />
      <Card>
        <Text style={s.cardTitle}>Get in touch</Text>
        <View style={s.infoRow}><Text style={s.infoK}>Email</Text><Text style={s.infoV}>contact@alsaitigrowth.com</Text></View>
        <View style={s.infoRow}><Text style={s.infoK}>Phone / WhatsApp</Text><Text style={s.infoV}>+44 7365 331141</Text></View>
        <View style={s.infoRow}><Text style={s.infoK}>Website</Text><Text style={s.infoV}>alsaitigrowth.com</Text></View>
      </Card>
      <Pressable style={[s.primaryBtn, { backgroundColor: '#25D366' }]}>
        <Text style={[s.primaryBtnText, { color: '#053a1c' }]}>Message us on WhatsApp</Text>
      </Pressable>
      <Pressable style={s.primaryBtn}>
        <Text style={s.primaryBtnText}>Request my analysis</Text>
      </Pressable>
    </ScrollView>
  );
}

/* ---------- Shell with bottom tabs ---------- */
const TABS = [['Home', '▦'], ['Leads', '☰'], ['Industries', '▤'], ['Steps', '⚙'], ['Contact', '✉']];

export default function App() {
  const [tab, setTab] = useState('Home');
  let screen;
  if (tab === 'Home') screen = <Home />;
  else if (tab === 'Leads') screen = <Leads />;
  else if (tab === 'Industries') screen = <Industries />;
  else if (tab === 'Steps') screen = <Steps />;
  else screen = <Contact />;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.topbar}>
        <View style={s.logo}><Text style={{ color: '#fff', fontWeight: '700' }}>{'◆'}</Text></View>
        <View>
          <Text style={s.brand}>Alsaiti Growth</Text>
          <Text style={s.brandSub}>AI receptionists & lead systems</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={s.avatar}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>AG</Text></View>
      </View>

      <View style={{ flex: 1 }}>{screen}</View>

      <View style={s.tabbar}>
        {TABS.map((t) => {
          const active = tab === t[0];
          return (
            <Pressable key={t[0]} style={s.tab} onPress={() => setTab(t[0])}>
              <Text style={{ fontSize: 17, color: active ? C.cyan : C.muted }}>{t[1]}</Text>
              <Text style={{ fontSize: 9, color: active ? C.cyan : C.muted, marginTop: 2 }}>{t[0]}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? 28 : 0 },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  logo: { width: 32, height: 32, borderRadius: 9, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  brand: { color: C.text, fontWeight: '700', fontSize: 16 },
  brandSub: { color: C.muted, fontSize: 11, marginTop: 1 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.glow, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 30 },
  h1: { color: C.text, fontSize: 22, fontWeight: '700' },
  sub: { color: C.muted, fontSize: 13, marginTop: 4, marginBottom: 6 },
  section: { color: C.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 18, marginBottom: 8 },
  body: { color: C.text, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '600', marginBottom: 8 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  stat: { width: '47%', flexGrow: 1 },
  statLabel: { color: C.muted, fontSize: 12 },
  statValue: { color: C.text, fontSize: 24, fontWeight: '700', marginTop: 6 },
  statDelta: { color: C.green, fontSize: 12, marginTop: 4 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 10, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(87,227,154,0.15)', borderWidth: 1, borderColor: 'rgba(87,227,154,0.4)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  liveText: { color: C.green, fontSize: 11, fontWeight: '700' },
  leadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: C.border },
  leadName: { color: C.text, fontSize: 15, fontWeight: '600' },
  leadMeta: { color: C.muted, fontSize: 12, marginTop: 2 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, backgroundColor: C.card },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border },
  infoK: { color: C.muted, fontSize: 13 },
  infoV: { color: C.text, fontSize: 13 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  stepNum: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(58,166,255,0.14)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  stepNumText: { color: C.cyan, fontWeight: '700', fontSize: 14 },
  primaryBtn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
  primaryBtnText: { color: '#04223f', fontWeight: '700', fontSize: 15 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border, backgroundColor: 'rgba(7,23,53,0.95)', paddingVertical: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 4 },
});
