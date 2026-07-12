import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  SafeAreaView, ScrollView, View, Text, Pressable, StyleSheet, StatusBar, Platform,
  Dimensions, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Rect, Line, Polyline, Defs, RadialGradient, Stop } from 'react-native-svg';

/* ---------- Brand (Alsaiti Growth) — palette mirrors alsaitigrowth.com ---------- */
const C = {
  bg: '#020B1F', bg2: '#071735', card: 'rgba(11,27,58,0.72)', cardHi: 'rgba(15,34,68,0.9)',
  primary: '#3AA6FF', cyan: '#59C7FF', glow: '#1E90FF', purple: '#7E6FEF',
  text: '#F5F9FF', muted: '#93A8C7', border: 'rgba(83,167,255,0.18)', borderHi: 'rgba(89,199,255,0.4)',
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
const STAT_ICONS = ['activity', 'phone', 'bolt', 'mail']; // presentation only
const REVENUE = { label: 'Revenue Protected', value: '£18.4k', delta: '+24%' };
const REVENUE_SPARK = [12, 18, 15, 22, 19, 28, 24, 31, 27, 34, 30, 37];

const LEADS = [
  { id: '1', name: 'Sarah Mitchell', service: 'Dental consultation', urgency: 'Hot', status: 'Booked' },
  { id: '2', name: "James O'Connor", service: 'Property viewing', urgency: 'Hot', status: 'Contacted' },
  { id: '3', name: 'Aisha Rahman', service: 'Boiler repair quote', urgency: 'Warm', status: 'New' },
  { id: '4', name: 'Daniel Carter', service: 'Implant enquiry', urgency: 'Hot', status: 'Follow-up' },
  { id: '5', name: 'Lucia Romero', service: 'Rental viewing', urgency: 'Warm', status: 'Contacted' },
  { id: '6', name: 'Tom Whitfield', service: 'Emergency plumbing', urgency: 'Hot', status: 'Booked' },
];

const INDUSTRIES = [
  { t: 'Dental Clinics', icon: 'tooth', d: 'Book more consultations, recover missed calls, and fill your appointment book automatically.' },
  { t: 'Letting Agents', icon: 'home', d: 'Qualify tenants, arrange viewings, and respond to property enquiries within seconds.' },
  { t: 'Home Services', icon: 'wrench', d: 'Capture emergency jobs, send quote requests to your team, and never miss a customer call.' },
  { t: 'Custom AI System', icon: 'bolt', d: "Tell us your workflow and we'll build a tailored AI receptionist around your business." },
];

const STEPS = [
  'Customer calls or messages your business',
  'Your AI responds instantly, 24/7',
  'Lead details are captured automatically',
  'Your team gets notified straight away',
  'Everything appears in your live dashboard',
];

/* ---------- Icons (Feather-style, mirrors the website) ---------- */
const ICONS = {
  grid: <><Rect x="3" y="3" width="7" height="7" rx="1.5" /><Rect x="14" y="3" width="7" height="7" rx="1.5" /><Rect x="3" y="14" width="7" height="7" rx="1.5" /><Rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  users: <><Circle cx="9" cy="8" r="3.2" /><Path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><Path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 20a5.2 5.2 0 0 0-3-4.7" /></>,
  briefcase: <><Rect x="2" y="7" width="20" height="14" rx="2" /><Path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
  activity: <Path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  mail: <><Rect x="2" y="4" width="20" height="16" rx="2" /><Path d="M2 7l10 6 10-6" /></>,
  bolt: <Path d="M13 2 4 14h6l-1 8 9-12h-6z" />,
  phone: <Path d="M6 3h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z" />,
  mic: <><Rect x="9" y="3" width="6" height="11" rx="3" /><Path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  check: <Path d="M20 6 9 17l-5-5" />,
  bell: <Path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6zM10 20a2 2 0 0 0 4 0" />,
  chevronR: <Path d="M9 6l6 6-6 6" />,
  home: <Path d="M4 11l8-7 8 7M6 10v10h12V10" />,
  wrench: <Path d="M14.5 6a3.5 3.5 0 0 0 4.6 4.6L21 12l-8 8-2-2 1.4-2.9A3.5 3.5 0 0 0 7.4 10L5 5l3-3 5 2.4A3.5 3.5 0 0 0 14.5 6z" />,
  tooth: <Path d="M8 3c-2.5 0-4 2-4 5 0 3 1 4 1.5 7S6 21 7 21s1.2-4 2-4 1 4 2 4 1.5-3 2-6 1.5-4 1.5-7c0-3-1.5-5-4-5a5 5 0 0 0-2.5.8A5 5 0 0 0 8 3z" />,
};

function Icon({ name, size = 22, color = C.text, sw = 1.8 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name] || null}
    </Svg>
  );
}

/* ---------- Ambient background glow (matches the website radial gradients) ---------- */
const { width: SW, height: SH } = Dimensions.get('window');
function BackgroundGlow() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={SW} height={SH}>
        <Defs>
          <RadialGradient id="g1" cx={SW * 0.85} cy={SH * -0.05} r={SW * 0.95} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#1E90FF" stopOpacity={0.28} />
            <Stop offset="1" stopColor="#1E90FF" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="g2" cx={SW * -0.1} cy={SH * 0.28} r={SW * 0.95} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#3AA6FF" stopOpacity={0.16} />
            <Stop offset="1" stopColor="#3AA6FF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={SW} height={SH} fill="url(#g1)" />
        <Rect x="0" y="0" width={SW} height={SH} fill="url(#g2)" />
      </Svg>
    </View>
  );
}

/* ---------- UI helpers ---------- */
const Badge = ({ label, color }) => (
  <View style={[s.badge, { borderColor: color + '66', backgroundColor: color + '1f' }]}>
    <View style={[s.badgeDot, { backgroundColor: color }]} />
    <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{label}</Text>
  </View>
);

const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;

const H = ({ title, sub }) => (
  <View style={{ marginBottom: 16 }}>
    <Text style={s.h1}>{title}</Text>
    {sub ? <Text style={s.sub}>{sub}</Text> : null}
  </View>
);

const Avatar = ({ name, size = 38, fontSize = 13 }) => {
  const initials = name.split(' ').map((n) => n[0]).slice(0, 2).join('');
  return (
    <LinearGradient colors={[C.primary, C.glow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize }}>{initials}</Text>
    </LinearGradient>
  );
};

const GradientButton = ({ label, colors = [C.primary, C.glow], textColor = '#04223f', icon, onPress, style }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }, style]}>
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.gradBtn}>
      {icon ? <Icon name={icon} size={18} color={textColor} sw={2} /> : null}
      <Text style={[s.gradBtnText, { color: textColor }]}>{label}</Text>
    </LinearGradient>
  </Pressable>
);

const LeadRow = ({ lead, last }) => (
  <View style={[s.leadRow, last && { borderBottomWidth: 0 }]}>
    <Avatar name={lead.name} size={38} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={s.leadName}>{lead.name}</Text>
      <Text style={s.leadMeta}>{lead.service}</Text>
    </View>
    <View style={{ alignItems: 'flex-end', gap: 6 }}>
      <Badge label={lead.urgency} color={URGENCY_COLOR[lead.urgency]} />
      <Badge label={lead.status} color={STATUS_COLOR[lead.status] || C.muted} />
    </View>
  </View>
);

/* Mini sparkline for the revenue card */
function Sparkline({ data, color, width = 150, height = 44 }) {
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - ((v - min) / (max - min || 1)) * (height - 6) - 3}`
  ).join(' ');
  return (
    <Svg width={width} height={height}>
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/* Animated "Live" pulse dot */
function LiveDot() {
  const a = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [a]);
  return <Animated.View style={[s.liveDot, { opacity: a }]} />;
}

/* ---------- Screens ---------- */
function Home() {
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={s.h1}>Live Dashboard</Text>
        <View style={s.livePill}><LiveDot /><Text style={s.liveText}>Live</Text></View>
      </View>
      <Text style={s.sub}>Every lead. Every call. In one place.</Text>

      <View style={s.statGrid}>
        {STATS.map((st, i) => (
          <Card key={st.label} style={s.stat}>
            <View style={s.statIcon}><Icon name={STAT_ICONS[i]} size={16} color={C.cyan} sw={2} /></View>
            <Text style={s.statLabel}>{st.label}</Text>
            <Text style={s.statValue}>{st.value}</Text>
            <View style={s.deltaRow}>
              <Icon name="chevronR" size={12} color={C.green} sw={2.5} />
              <Text style={s.statDelta}>{st.delta}</Text>
            </View>
          </Card>
        ))}
      </View>

      <Card style={{ marginTop: 12, borderColor: C.borderHi }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={s.statLabel}>{REVENUE.label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 4 }}>
              <Text style={[s.statValue, { fontSize: 32, color: C.green }]}>{REVENUE.value}</Text>
              <Text style={[s.statDelta, { marginBottom: 7, fontSize: 13 }]}>{REVENUE.delta}</Text>
            </View>
          </View>
          <Sparkline data={REVENUE_SPARK} color={C.green} width={130} height={48} />
        </View>
      </Card>

      <Text style={s.section}>Recent leads</Text>
      <Card style={{ padding: 6 }}>
        {LEADS.map((l, i) => <LeadRow key={l.id} lead={l} last={i === LEADS.length - 1} />)}
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
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <H title="Leads" sub="Every enquiry your AI receptionist captured." />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        {chips.map((c) => {
          const active = filter === c;
          return (
            <Pressable key={c} onPress={() => setFilter(c)}
              style={[s.chip, active && s.chipActive]}>
              <Text style={{ color: active ? '#04223f' : C.muted, fontSize: 13, fontWeight: '700' }}>{c}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Card style={{ padding: 6 }}>
        {list.length ? list.map((l, i) => <LeadRow key={l.id} lead={l} last={i === list.length - 1} />)
          : <Text style={{ color: C.muted, padding: 16 }}>No leads in this status.</Text>}
      </Card>
    </ScrollView>
  );
}

function Industries() {
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <H title="Industries" sub="Built for businesses that live on enquiries." />
      {INDUSTRIES.map((i) => (
        <Card key={i.t} style={s.industryCard}>
          <LinearGradient colors={[C.primary, C.glow]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.industryAccent} />
          <View style={s.industryIcon}><Icon name={i.icon} size={22} color={C.cyan} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{i.t}</Text>
            <Text style={s.body}>{i.d}</Text>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

function Steps() {
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <H title="How it works" sub="Five simple steps. One smarter business." />
      {STEPS.map((step, i) => (
        <View key={i} style={s.stepRow}>
          <View>
            <LinearGradient colors={[C.primary, C.glow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.stepNum}>
              <Text style={s.stepNumText}>{String(i + 1).padStart(2, '0')}</Text>
            </LinearGradient>
            {i < STEPS.length - 1 ? <View style={s.stepConnector} /> : null}
          </View>
          <Card style={{ flex: 1, paddingVertical: 14 }}>
            <Text style={[s.body, { fontWeight: '600' }]}>{step}</Text>
          </Card>
        </View>
      ))}
    </ScrollView>
  );
}

function Contact() {
  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <H title="Request your growth analysis" sub="We'll recommend the best AI system for your workflow." />
      <Card>
        <Text style={s.cardTitle}>Get in touch</Text>
        <View style={s.infoRow}><Text style={s.infoK}>Email</Text><Text style={s.infoV}>contact@alsaitigrowth.com</Text></View>
        <View style={s.infoRow}><Text style={s.infoK}>Phone / WhatsApp</Text><Text style={s.infoV}>+44 7365 331141</Text></View>
        <View style={s.infoRow}><Text style={s.infoK}>Website</Text><Text style={s.infoV}>alsaitigrowth.com</Text></View>
      </Card>
      <GradientButton label="Message us on WhatsApp" icon="phone" colors={['#25D366', '#128C4B']}
        textColor="#04240f" style={{ marginTop: 14 }} />
      <GradientButton label="Request my analysis" icon="bolt" style={{ marginTop: 12 }} />
    </ScrollView>
  );
}

/* ---------- Shell with bottom tabs ---------- */
const TABS = [
  ['Home', 'grid'], ['Leads', 'users'], ['Industries', 'briefcase'], ['Steps', 'activity'], ['Contact', 'mail'],
];

export default function App() {
  const [tab, setTab] = useState('Home');
  let screen;
  if (tab === 'Home') screen = <Home />;
  else if (tab === 'Leads') screen = <Leads />;
  else if (tab === 'Industries') screen = <Industries />;
  else if (tab === 'Steps') screen = <Steps />;
  else screen = <Contact />;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <BackgroundGlow />
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />

        <View style={s.topbar}>
          <LinearGradient colors={[C.primary, C.glow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.logo}>
            <Icon name="mic" size={19} color="#fff" sw={2} />
          </LinearGradient>
          <View>
            <Text style={s.brand}>Alsaiti Growth</Text>
            <Text style={s.brandSub}>AI receptionists & lead systems</Text>
          </View>
          <View style={{ flex: 1 }} />
          <View style={s.iconBtn}>
            <Icon name="bell" size={18} color={C.muted} />
            <View style={s.bellDot} />
          </View>
          <Avatar name="Alsaiti Growth" size={38} />
        </View>

        <View style={{ flex: 1 }}>{screen}</View>

        <View style={s.tabbar}>
          {TABS.map((t) => {
            const active = tab === t[0];
            return (
              <Pressable key={t[0]} style={s.tab} onPress={() => setTab(t[0])}>
                <View style={[s.tabIcon, active && s.tabIconActive]}>
                  <Icon name={t[1]} size={20} color={active ? C.cyan : C.muted} sw={active ? 2.1 : 1.8} />
                </View>
                <Text style={{ fontSize: 9.5, fontWeight: active ? '700' : '500', color: active ? C.cyan : C.muted, marginTop: 3 }}>{t[0]}</Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}

const shadow = (elev, color = '#000') => Platform.select({
  ios: { shadowColor: color, shadowOpacity: 0.35, shadowRadius: elev, shadowOffset: { width: 0, height: elev / 2 } },
  android: { elevation: elev },
});

const s = StyleSheet.create({
  safe: { flex: 1, paddingTop: Platform.OS === 'android' ? 28 : 0 },
  topbar: {
    flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  logo: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', ...shadow(8, C.glow) },
  brand: { color: C.text, fontWeight: '700', fontSize: 16, letterSpacing: 0.2 },
  brandSub: { color: C.muted, fontSize: 10.5, marginTop: 1 },
  iconBtn: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 8, right: 9, width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },

  scroll: { padding: 16, paddingBottom: 34 },
  h1: { color: C.text, fontSize: 23, fontWeight: '800', letterSpacing: 0.2 },
  sub: { color: C.muted, fontSize: 13, marginTop: 4, marginBottom: 6 },
  section: { color: C.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 20, marginBottom: 10 },
  body: { color: C.text, fontSize: 14, lineHeight: 20 },

  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16, ...shadow(6) },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 8 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  stat: { width: '47%', flexGrow: 1, paddingTop: 14 },
  statIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(58,166,255,0.14)', borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statLabel: { color: C.muted, fontSize: 12 },
  statValue: { color: C.text, fontSize: 26, fontWeight: '800', marginTop: 6 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 1, marginTop: 5 },
  statDelta: { color: C.green, fontSize: 12, fontWeight: '700' },

  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(87,227,154,0.15)', borderWidth: 1, borderColor: 'rgba(87,227,154,0.4)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  liveText: { color: C.green, fontSize: 11, fontWeight: '700' },

  leadRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  leadName: { color: C.text, fontSize: 15, fontWeight: '600' },
  leadMeta: { color: C.muted, fontSize: 12, marginTop: 2 },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },

  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, backgroundColor: C.card },
  chipActive: { backgroundColor: C.cyan, borderColor: C.cyan, ...shadow(6, C.glow) },

  industryCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12, overflow: 'hidden' },
  industryAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  industryIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: 'rgba(58,166,255,0.14)', borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },
  infoK: { color: C.muted, fontSize: 13 },
  infoV: { color: C.text, fontSize: 13, fontWeight: '600' },

  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 12 },
  stepNum: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', ...shadow(6, C.glow) },
  stepNumText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  stepConnector: { position: 'absolute', top: 46, left: 22, width: 2, height: 26, backgroundColor: C.border },

  gradBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, paddingVertical: 15, ...shadow(10, C.glow) },
  gradBtnText: { fontWeight: '800', fontSize: 15 },

  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border, backgroundColor: 'rgba(7,23,53,0.96)', paddingVertical: 8, paddingBottom: Platform.OS === 'ios' ? 8 : 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  tabIcon: { width: 40, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabIconActive: { backgroundColor: 'rgba(89,199,255,0.14)', borderWidth: 1, borderColor: 'rgba(89,199,255,0.28)' },
});
