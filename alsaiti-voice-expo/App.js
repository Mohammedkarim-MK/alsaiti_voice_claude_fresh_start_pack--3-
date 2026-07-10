import React, { useState } from 'react';
import {
  SafeAreaView, ScrollView, View, Text, Pressable, StyleSheet, StatusBar, Platform,
} from 'react-native';

/* ---------- Brand (from 04_FIRST_PROMPT / brand design) ---------- */
const C = {
  bg: '#020B1F', secondary: '#071735', primary: '#3AA6FF', cyan: '#59C7FF',
  glow: '#1E90FF', text: '#F5F9FF', muted: '#93A8C7',
  glass: 'rgba(11,27,58,0.85)', border: 'rgba(83,167,255,0.18)',
};

const STATUSES = ['New', 'Contacted', 'Qualified', 'Booked', 'Won', 'Lost', 'Spam'];
const STATUS_COLOR = {
  New: C.cyan, Contacted: '#c3d3ea', Qualified: '#b6a9ff', Booked: '#7bf0b4',
  Won: '#57E39A', Lost: '#ff9aa6', Spam: '#8ea0bd',
};

const LEADS = [
  { id: 'LD-1042', name: 'Sarah Whitfield', service: 'Dental implant consult', urgency: 'High', source: 'Voice call', status: 'New', score: 92, time: '3m ago', phone: '+44 7700 900112', email: 'sarah.w@example.com', callback: 'Today 4:00pm', summary: 'Caller asking about implant options after losing a molar. Wants earliest appointment; mentioned pain when chewing.', reasons: ['High urgency (pain reported)', 'Clear service intent', 'Valid contact details'] },
  { id: 'LD-1041', name: 'James Okoro', service: 'Boiler not firing', urgency: 'High', source: 'Website chat', status: 'New', score: 88, time: '11m ago', phone: '+44 7700 900431', email: 'j.okoro@example.com', callback: 'ASAP', summary: 'No hot water since morning, family with young child. Requesting same-day engineer visit.', reasons: ['Emergency keyword detected', 'Address provided', 'Repeat visitor'] },
  { id: 'LD-1040', name: 'Priya Nair', service: '2-bed flat viewing', urgency: 'Medium', source: 'Contact form', status: 'Contacted', score: 74, time: '42m ago', phone: '+44 7700 900677', email: 'priya.n@example.com', callback: 'Tomorrow AM', summary: 'Interested in the Docklands 2-bed listing, asking about availability and pet policy.', reasons: ['Budget in range', 'Specific listing referenced'] },
  { id: 'LD-1039', name: 'Tom Bradley', service: 'Botox consultation', urgency: 'Low', source: 'Website chat', status: 'Qualified', score: 69, time: '1h ago', phone: '+44 7700 900988', email: 'tom.b@example.com', callback: 'This week', summary: 'First-time aesthetic client, comparing clinics, price-sensitive but ready to book a consult.', reasons: ['Ready to book consult', 'Comparing providers'] },
  { id: 'LD-1038', name: 'Amelia Cross', service: 'Kitchen leak repair', urgency: 'High', source: 'Voice call', status: 'Booked', score: 81, time: '2h ago', phone: '+44 7700 900233', email: 'amelia.c@example.com', callback: 'Booked Thu 9am', summary: 'Under-sink leak, water contained. Booked engineer for Thursday morning.', reasons: ['Slot confirmed', 'Deposit taken'] },
  { id: 'LD-1036', name: 'Grace Oduya', service: 'Property valuation', urgency: 'Medium', source: 'API', status: 'Won', score: 77, time: 'Yesterday', phone: '+44 7700 900555', email: 'grace.o@example.com', callback: 'Completed', summary: 'Requested valuation for a semi-detached; instructed the agency to list.', reasons: ['Signed instruction', 'High intent'] },
  { id: 'LD-1035', name: 'Oliver Payne', service: 'Invisalign quote', urgency: 'Low', source: 'Manual import', status: 'Lost', score: 41, time: 'Yesterday', phone: '+44 7700 900744', email: 'oliver.p@example.com', callback: 'No answer', summary: 'Requested quote, went with a competitor closer to home.', reasons: ['Price objection', 'Location preference'] },
];

const CONVERSATIONS = [
  { name: 'James Okoro', source: 'Website chat', time: '11m', thread: [
    ['in', "Hi, my boiler won't fire and we've got no hot water at all.", '09:14'],
    ['out', 'Sorry to hear that, James. Is anyone vulnerable in the home right now?', '09:14'],
    ['in', 'Yes, we have a 2 year old. Can someone come today?', '09:15'],
    ['out', "Understood — flagging this as urgent and creating a priority lead. What's the postcode?", '09:15'],
    ['in', 'E14 9GE', '09:16'],
    ['out', 'Thanks. An engineer will call you within 20 minutes to confirm a same-day slot.', '09:16'],
  ] },
  { name: 'Sarah Whitfield', source: 'Voice call', time: '3m', thread: [
    ['in', '(Call transcript) Hi, I lost a molar and it is painful to chew.', '16:02'],
    ['out', 'I can help with that. Are you an existing patient with us?', '16:02'],
    ['in', 'No, first time. How soon could I be seen?', '16:03'],
    ['out', 'We have implant consults this week. I will book a callback for 4pm today.', '16:03'],
  ] },
];

/* ---------- Small UI helpers ---------- */
const Badge = ({ status }) => (
  <View style={[s.badge, { borderColor: STATUS_COLOR[status] + '66' }]}>
    <Text style={{ color: STATUS_COLOR[status], fontSize: 12, fontWeight: '600' }}>{status}</Text>
  </View>
);
const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;
const H = ({ title, sub }) => (
  <View style={{ marginBottom: 16 }}>
    <Text style={s.h1}>{title}</Text>
    {sub ? <Text style={s.sub}>{sub}</Text> : null}
  </View>
);
const Bar = ({ pct, color }) => (
  <View style={s.barTrack}><View style={[s.barFill, { width: pct + '%', backgroundColor: color || C.primary }]} /></View>
);

/* ---------- Screens ---------- */
function Dashboard({ openLead }) {
  const stats = [['Leads today', '37', '+12%'], ['New / urgent', '6', '2 callbacks'], ['Avg response', '4m 12s', 'faster'], ['Won / week', '14', '£11.2k']];
  const statusCount = { New: 18, Contacted: 22, Qualified: 15, Booked: 9, Won: 14, Lost: 7, Spam: 5 };
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <H title="Dashboard" sub="Who arrived, who's urgent, which channels win." />
      <View style={s.statGrid}>
        {stats.map((st) => (
          <Card key={st[0]} style={s.stat}>
            <Text style={s.statLabel}>{st[0]}</Text>
            <Text style={s.statValue}>{st[1]}</Text>
            <Text style={s.statDelta}>{st[2]}</Text>
          </Card>
        ))}
      </View>
      <Card>
        <Text style={s.cardTitle}>Leads by status</Text>
        {STATUSES.map((st) => (
          <View key={st} style={s.legendRow}>
            <View style={{ width: 92 }}><Badge status={st} /></View>
            <View style={{ flex: 1, marginHorizontal: 10 }}><Bar pct={statusCount[st] * 3} /></View>
            <Text style={s.legendVal}>{statusCount[st]}</Text>
          </View>
        ))}
      </Card>
      <Card style={{ marginTop: 14 }}>
        <Text style={s.cardTitle}>Needs attention now</Text>
        {LEADS.filter((l) => ['New', 'Qualified'].includes(l.status)).map((l) => (
          <LeadRow key={l.id} lead={l} onPress={() => openLead(l)} />
        ))}
      </Card>
    </ScrollView>
  );
}

const LeadRow = ({ lead, onPress }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [s.leadRow, pressed && { backgroundColor: 'rgba(58,166,255,0.08)' }]}>
    <View style={{ flex: 1 }}>
      <Text style={s.leadName}>{lead.name}</Text>
      <Text style={s.leadMeta}>{lead.service} · {lead.source}</Text>
    </View>
    <Badge status={lead.status} />
    <Text style={[s.score, { color: lead.score > 75 ? '#57E39A' : lead.score > 50 ? C.cyan : '#ff9aa6' }]}>{lead.score}</Text>
  </Pressable>
);

function Leads({ openLead }) {
  const [filter, setFilter] = useState('All');
  const list = filter === 'All' ? LEADS : LEADS.filter((l) => l.status === filter);
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <H title="Leads" sub="Every enquiry from calls, chat, forms, API and CRM." />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {['All', ...STATUSES].map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[s.chip, filter === f && { borderColor: C.primary, backgroundColor: 'rgba(58,166,255,0.14)' }]}>
            <Text style={{ color: filter === f ? C.text : C.muted, fontSize: 13, fontWeight: '600' }}>{f}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Card style={{ padding: 6 }}>
        {list.map((l) => <LeadRow key={l.id} lead={l} onPress={() => openLead(l)} />)}
      </Card>
    </ScrollView>
  );
}

function LeadDetail({ lead, back }) {
  const info = [['Phone', lead.phone], ['Email', lead.email], ['Service', lead.service], ['Urgency', lead.urgency], ['Source', lead.source], ['Callback', lead.callback]];
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Pressable onPress={back} style={s.backBtn}><Text style={{ color: C.cyan, fontWeight: '600' }}>‹ Back to leads</Text></Pressable>
      <View style={{ marginVertical: 12 }}>
        <Text style={s.h1}>{lead.name}</Text>
        <Text style={s.sub}>{lead.id} · score {lead.score} · {lead.time}</Text>
      </View>
      <Card><Text style={s.cardTitle}>Summary</Text><Text style={s.body}>{lead.summary}</Text></Card>
      <Card style={{ marginTop: 14 }}>
        <Text style={s.cardTitle}>Why this score</Text>
        {lead.reasons.map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, marginVertical: 5 }}>
            <Text style={{ color: '#57E39A' }}>✓</Text><Text style={s.body}>{r}</Text>
          </View>
        ))}
      </Card>
      <Card style={{ marginTop: 14 }}>
        <Text style={s.cardTitle}>Details</Text>
        {info.map((i) => (
          <View key={i[0]} style={s.infoRow}><Text style={s.infoK}>{i[0]}</Text><Text style={s.infoV}>{i[1]}</Text></View>
        ))}
      </Card>
      <Card style={{ marginTop: 14 }}>
        <Text style={s.cardTitle}>Move status</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {STATUSES.map((st) => (
            <View key={st} style={[s.chip, st === lead.status && { borderColor: C.primary }]}><Text style={{ color: C.muted, fontSize: 12 }}>{st}</Text></View>
          ))}
        </View>
        <Pressable style={s.primaryBtn}><Text style={s.primaryBtnText}>Call now</Text></Pressable>
      </Card>
    </ScrollView>
  );
}

function Conversations() {
  const [i, setI] = useState(0);
  const c = CONVERSATIONS[i];
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <H title="Conversations" sub="Chat and call transcripts across channels." />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {CONVERSATIONS.map((x, idx) => (
          <Pressable key={x.name} onPress={() => setI(idx)} style={[s.chip, i === idx && { borderColor: C.primary, backgroundColor: 'rgba(58,166,255,0.14)' }]}>
            <Text style={{ color: i === idx ? C.text : C.muted, fontSize: 13 }}>{x.name.split(' ')[0]}</Text>
          </Pressable>
        ))}
      </View>
      <Card>
        <Text style={s.cardTitle}>{c.name} · {c.source}</Text>
        {c.thread.map((m, k) => (
          <View key={k} style={[s.msg, m[0] === 'out' ? s.msgOut : s.msgIn]}>
            <Text style={{ color: m[0] === 'out' ? '#04223f' : C.text, fontSize: 14 }}>{m[1]}</Text>
            <Text style={{ color: m[0] === 'out' ? '#0b3b66' : C.muted, fontSize: 10, marginTop: 3 }}>{m[2]}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

function Analytics() {
  const funnel = [['New', 100], ['Contacted', 78], ['Qualified', 61], ['Booked', 34], ['Won', 23]];
  const stats = [['Enquiries', '1,284'], ['Qualified', '61%'], ['Booked', '208'], ['Won', '96']];
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <H title="Analytics" sub="Volume, conversion and response speed." />
      <View style={s.statGrid}>
        {stats.map((st) => (
          <Card key={st[0]} style={s.stat}><Text style={s.statLabel}>{st[0]}</Text><Text style={s.statValue}>{st[1]}</Text></Card>
        ))}
      </View>
      <Card>
        <Text style={s.cardTitle}>Conversion funnel</Text>
        {funnel.map((f) => (
          <View key={f[0]} style={s.legendRow}>
            <Text style={{ color: C.text, width: 80, fontSize: 13 }}>{f[0]}</Text>
            <View style={{ flex: 1, marginHorizontal: 10 }}><Bar pct={f[1]} color={C.cyan} /></View>
            <Text style={s.legendVal}>{f[1]}%</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

function Settings() {
  const rows = [['New lead email', 'On'], ['Urgent lead SMS', 'On'], ['Daily summary', 'Off'], ['Row-level security', 'Active'], ['Two-factor auth', 'Set up']];
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <H title="Settings" sub="Workspace, notifications and security." />
      <Card>
        <Text style={s.cardTitle}>Bright Smile Dental · Growth plan</Text>
        {rows.map((r) => (
          <View key={r[0]} style={s.infoRow}><Text style={s.infoK}>{r[0]}</Text><Text style={{ color: r[1] === 'Off' ? C.muted : '#57E39A', fontSize: 13 }}>{r[1]}</Text></View>
        ))}
      </Card>
      <Card style={{ marginTop: 14, alignItems: 'center' }}>
        <Text style={{ color: C.muted, fontSize: 12 }}>Alsaiti Voice · demo preview</Text>
      </Card>
    </ScrollView>
  );
}

/* ---------- Shell with bottom tabs ---------- */
const TABS = [
  ['Dashboard', '▦'], ['Leads', '☰'], ['Chat', '✎'], ['Stats', '📊'], ['More', '⚙'],
];

export default function App() {
  const [tab, setTab] = useState('Dashboard');
  const [lead, setLead] = useState(null);
  const openLead = (l) => setLead(l);
  const back = () => setLead(null);

  let screen;
  if (lead) screen = <LeadDetail lead={lead} back={back} />;
  else if (tab === 'Dashboard') screen = <Dashboard openLead={openLead} />;
  else if (tab === 'Leads') screen = <Leads openLead={openLead} />;
  else if (tab === 'Chat') screen = <Conversations />;
  else if (tab === 'Stats') screen = <Analytics />;
  else screen = <Settings />;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.topbar}>
        <View style={s.logo}><Text style={{ color: '#fff', fontWeight: '700' }}>◆</Text></View>
        <Text style={s.brand}>Alsaiti Voice</Text>
        <View style={{ flex: 1 }} />
        <View style={s.avatar}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>BS</Text></View>
      </View>
      <View style={{ flex: 1 }}>{screen}</View>
      <View style={s.tabbar}>
        {TABS.map((t) => {
          const active = tab === t[0] && !lead;
          return (
            <Pressable key={t[0]} style={s.tab} onPress={() => { setLead(null); setTab(t[0]); }}>
              <Text style={{ fontSize: 18, color: active ? C.cyan : C.muted }}>{t[1]}</Text>
              <Text style={{ fontSize: 10, color: active ? C.cyan : C.muted, marginTop: 2 }}>{t[0]}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  logo: { width: 30, height: 30, borderRadius: 8, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  brand: { color: C.text, fontWeight: '700', fontSize: 16 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.glow, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 30 },
  h1: { color: C.text, fontSize: 22, fontWeight: '700' },
  sub: { color: C.muted, fontSize: 13, marginTop: 4 },
  body: { color: C.text, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: C.glass, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '600', marginBottom: 12 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  stat: { width: '47%', flexGrow: 1 },
  statLabel: { color: C.muted, fontSize: 12 },
  statValue: { color: C.text, fontSize: 24, fontWeight: '700', marginTop: 6 },
  statDelta: { color: '#57E39A', fontSize: 12, marginTop: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  legendVal: { color: C.text, fontWeight: '700', fontSize: 13, width: 34, textAlign: 'right' },
  barTrack: { height: 8, borderRadius: 8, backgroundColor: 'rgba(148,163,199,0.18)', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 8 },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: 'rgba(58,166,255,0.10)' },
  leadRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: C.border },
  leadName: { color: C.text, fontSize: 15, fontWeight: '600' },
  leadMeta: { color: C.muted, fontSize: 12, marginTop: 2 },
  score: { fontWeight: '700', fontSize: 15, width: 30, textAlign: 'right' },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, backgroundColor: C.glass },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.border },
  infoK: { color: C.muted, fontSize: 13 },
  infoV: { color: C.text, fontSize: 13 },
  backBtn: { paddingVertical: 4 },
  primaryBtn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  primaryBtnText: { color: '#04223f', fontWeight: '700', fontSize: 15 },
  msg: { maxWidth: '85%', padding: 11, borderRadius: 14, marginBottom: 8 },
  msgIn: { backgroundColor: 'rgba(11,27,58,0.9)', borderWidth: 1, borderColor: C.border, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  msgOut: { backgroundColor: C.cyan, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border, backgroundColor: 'rgba(7,23,53,0.95)', paddingVertical: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 4 },
});
