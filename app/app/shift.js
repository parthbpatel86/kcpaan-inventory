// Manager end-of-day close. The app TELLS the manager what should be in the
// drawer (expected_cash), the manager counts the two counters, and the app
// works out over/short.
//
// NOTE: closing the shift does NOT touch punches. Employees can still clock
// out accurately after the manager has closed the drawer and left.
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { api } from '../src/lib/api';
import KeyboardScreen from '../src/components/KeyboardScreen';

export default function CloseShift() {
  const router = useRouter();
  const [summary, setSummary] = useState(null);
  const [closes, setCloses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [paan, setPaan] = useState('');
  const [tobacco, setTobacco] = useState('');
  const [note, setNote] = useState('');

  const load = () =>
    Promise.all([
      api.shiftSummary().catch(() => null),
      api.shiftCloses().catch(() => []),
    ])
      .then(([s, c]) => {
        setSummary(s);
        setCloses(Array.isArray(c) ? c : (c && c.closes) || []);
      })
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const expected = num(summary && summary.expected_cash);
  const paanCash = num(paan);
  const tobaccoCash = num(tobacco);
  // Only the tobacco counter is rung up through this app, so only that number
  // reconciles against expected cash. The paan counter is a separate cash
  // business — recorded for the books, never added to the drawer comparison.
  const counted = tobaccoCash;
  const overShort = counted - expected;
  const balanced = overShort === 0;
  const osColor = overShort < 0 ? colors.danger : colors.healthy;

  async function doClose() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.closeShift({
        paan_cash: paanCash,
        tobacco_cash: tobaccoCash,
        note: note.trim(),
      });
      const os = num(res && res.over_short);
      Alert.alert(
        'Shift closed',
        os === 0
          ? '✓ Balanced — drawer matches exactly.'
          : `${os > 0 ? 'Over' : 'Short'} by ${money(Math.abs(os))}`,
      );
      setPaan('');
      setTobacco('');
      setNote('');
      load();
    } catch (e) {
      Alert.alert('Could not close shift', String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Close Shift</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardScreen>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View style={styles.expectedCard}>
              <Text style={styles.expectedLabel}>Expected in drawer</Text>
              <Text style={styles.expectedValue}>{money(expected)}</Text>
              <Text style={styles.expectedHint}>Cash sales today, after any cash refunds.</Text>
            </View>

            {summary && summary.closed ? (
              <Text style={styles.warnLine}>⚠️ Today has already been closed once.</Text>
            ) : null}

            <Text style={styles.sectionTitle}>Count the drawers</Text>

            <Text style={styles.fieldLabel}>Tobacco counter total</Text>
            <Text style={styles.fieldHint}>Rung up in this app — this is what must match.</Text>
            <TextInput
              style={styles.moneyInput}
              value={tobacco}
              onChangeText={setTobacco}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textLight}
              textAlign="center"
            />

            <Text style={styles.fieldLabel}>Paan counter total</Text>
            <Text style={styles.fieldHint}>Recorded for the books only — not compared to expected.</Text>
            <TextInput
              style={styles.moneyInput}
              value={paan}
              onChangeText={setPaan}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textLight}
              textAlign="center"
            />

            <View style={styles.mathCard}>
              <View style={styles.mathRow}>
                <Text style={styles.mathLabel}>Tobacco counted</Text>
                <Text style={styles.mathValue}>{money(counted)}</Text>
              </View>
              <View style={styles.mathRow}>
                <Text style={styles.mathLabel}>Expected</Text>
                <Text style={styles.mathValue}>{money(expected)}</Text>
              </View>
              <View style={styles.mathDivider} />
              <View style={styles.mathRow}>
                <Text style={[styles.osLabel, { color: osColor }]}>
                  {balanced ? '✓ Balanced' : overShort > 0 ? 'Over' : 'Short'}
                </Text>
                <Text style={[styles.osValue, { color: osColor }]}>
                  {balanced ? money(0) : `${overShort > 0 ? '+' : '−'}${money(Math.abs(overShort))}`}
                </Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="e.g. $20 taken for change"
              placeholderTextColor={colors.textLight}
            />

            <Pressable
              style={[styles.closeBtn, busy && { opacity: 0.5 }]}
              onPress={doClose}
              disabled={busy}
            >
              <Text style={styles.closeBtnText}>Close shift</Text>
            </Pressable>
            {busy && <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} />}

            <Text style={styles.sectionTitle}>Other totals today</Text>
            <View style={styles.miniRow}>
              <View style={styles.miniCard}>
                <Text style={styles.miniLabel}>Card</Text>
                <Text style={styles.miniValue}>{money(num(summary && summary.cc_total))}</Text>
              </View>
              <View style={styles.miniCard}>
                <Text style={styles.miniLabel}>Shop</Text>
                <Text style={styles.miniValue}>{money(num(summary && summary.shop_total))}</Text>
              </View>
              <View style={styles.miniCard}>
                <Text style={styles.miniLabel}>Paan</Text>
                <Text style={styles.miniValue}>{money(paanCash)}</Text>
              </View>
            </View>

            {/* Who was on the clock — the manager wants this beside the drawer
                count, so the day's hours and the day's cash are seen together. */}
            <Text style={styles.sectionTitle}>Who worked today</Text>
            {(summary && summary.staff_today && summary.staff_today.length > 0) ? (
              <>
                {summary.staff_today.map((s, i) => (
                  <View key={`${s.name}-${i}`} style={styles.staffRow}>
                    <Text style={styles.staffRowName}>{s.name}</Text>
                    <Text style={styles.staffRowTimes}>
                      {clockTime(s.punch_in)} → {s.on_clock ? 'still in' : clockTime(s.punch_out)}
                    </Text>
                    <Text style={styles.staffRowHours}>
                      {s.hours != null ? `${s.hours.toFixed(2)}h` : '—'}
                    </Text>
                  </View>
                ))}
                <View style={styles.staffTotalRow}>
                  <Text style={styles.staffTotalLabel}>Total hours</Text>
                  <Text style={styles.staffTotalValue}>
                    {num(summary.staff_hours_total).toFixed(2)}h
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.muted}>Nobody clocked in today.</Text>
            )}

            {/* Previous days are listed one row per day ON PURPOSE. We deliberately
                do NOT render any all-time / grand total across days — the owner
                keeps the cumulative figure private. Do not "helpfully" add a sum. */}
            <Text style={styles.sectionTitle}>Previous days</Text>
            {closes.length === 0 ? (
              <Text style={styles.muted}>No previous closes recorded yet.</Text>
            ) : (
              closes.map((c, i) => {
                // Only tobacco reconciles against expected — so only tobacco may
                // be shown next to it. Summing paan in here produced rows that
                // read "Expected $0.00 · Counted $100.00 — ✓ Balanced".
                const cTobacco = num(c.tobacco_cash);
                const cOs = c.over_short == null ? cTobacco - num(c.expected_cash) : num(c.over_short);
                return (
                  <View key={c.id != null ? String(c.id) : `${c.business_date}-${i}`} style={styles.dayCard}>
                    <View style={styles.dayTop}>
                      <Text style={styles.dayDate}>{c.business_date}</Text>
                      <Text style={[styles.dayOs, { color: cOs < 0 ? colors.danger : colors.healthy }]}>
                        {cOs === 0 ? '✓ Balanced' : `${cOs > 0 ? '+' : '−'}${money(Math.abs(cOs))}`}
                      </Text>
                    </View>
                    <Text style={styles.dayLine}>
                      Tobacco {money(cTobacco)} · Expected {money(num(c.expected_cash))}
                    </Text>
                    <Text style={styles.dayLine}>Paan {money(num(c.paan_cash))}</Text>
                  </View>
                );
              })
            )}
          </>
        )}
      </KeyboardScreen>
    </SafeAreaView>
  );
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  // The shop is in Cerritos, CA — dollars, matching every other screen.
  return `$${num(v).toFixed(2)}`;
}

/** "9:05 AM" — no seconds; nobody counting a drawer cares about seconds. */
function clockTime(v) {
  if (!v) return '—';
  const d = new Date(String(v).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(v).slice(11, 16) || '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.white, fontSize: 30, fontWeight: '700' },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 18 },
  fieldHint: { fontSize: 18, color: colors.textMuted, marginTop: 2, marginBottom: 4 },
  staffRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.sm, ...shadow.card,
  },
  staffRowName: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.text },
  staffRowTimes: { fontSize: 18, color: colors.textMuted, marginRight: spacing.md },
  staffRowHours: { fontSize: 20, fontWeight: '800', color: colors.primary, minWidth: 58, textAlign: 'right' },
  staffTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  staffTotalLabel: { fontSize: 18, fontWeight: '700', color: colors.textMuted },
  staffTotalValue: { fontSize: 20, fontWeight: '900', color: colors.text },

  sectionTitle: { fontSize: 19, fontWeight: '800', color: colors.textMuted, marginTop: spacing.xl, marginBottom: spacing.sm },
  fieldLabel: { fontSize: 19, fontWeight: '800', color: colors.text, marginTop: spacing.md, marginBottom: spacing.xs },

  expectedCard: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', ...shadow.card },
  expectedLabel: { color: colors.primaryLight, fontSize: 19, fontWeight: '800' },
  expectedValue: { color: colors.white, fontSize: 44, fontWeight: '900', marginTop: spacing.xs },
  expectedHint: { color: colors.primaryLight, fontSize: 18, fontWeight: '600', marginTop: spacing.xs, textAlign: 'center' },

  warnLine: { color: colors.low, fontSize: 18, fontWeight: '800', marginTop: spacing.md },

  moneyInput: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, fontSize: 30, fontWeight: '800', paddingVertical: spacing.md, color: colors.text },
  noteInput: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, fontSize: 20, paddingVertical: spacing.md, paddingHorizontal: spacing.md, color: colors.text },

  mathCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg, borderWidth: 2, borderColor: colors.border },
  mathRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
  mathLabel: { fontSize: 19, fontWeight: '700', color: colors.textMuted },
  mathValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  mathDivider: { height: 2, backgroundColor: colors.border, marginVertical: spacing.sm },
  osLabel: { fontSize: 20, fontWeight: '900' },
  osValue: { fontSize: 26, fontWeight: '900' },

  closeBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.xl, ...shadow.card },
  closeBtnText: { color: colors.white, fontSize: 20, fontWeight: '900' },

  miniRow: { flexDirection: 'row', gap: spacing.md },
  miniCard: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md },
  miniLabel: { fontSize: 18, fontWeight: '800', color: colors.textMuted },
  miniValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },

  dayCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 2, borderColor: colors.border },
  dayTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayDate: { fontSize: 20, fontWeight: '800', color: colors.text },
  dayOs: { fontSize: 20, fontWeight: '900' },
  dayLine: { fontSize: 18, fontWeight: '600', color: colors.textMuted, marginTop: 2 },
});
