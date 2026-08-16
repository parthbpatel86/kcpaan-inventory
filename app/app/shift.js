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
  const counted = paanCash + tobaccoCash;
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

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl * 2 }}>
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

            <Text style={styles.fieldLabel}>Paan counter total</Text>
            <TextInput
              style={styles.moneyInput}
              value={paan}
              onChangeText={setPaan}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textLight}
              textAlign="center"
            />

            <Text style={styles.fieldLabel}>Tobacco counter total</Text>
            <TextInput
              style={styles.moneyInput}
              value={tobacco}
              onChangeText={setTobacco}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textLight}
              textAlign="center"
            />

            <View style={styles.mathCard}>
              <View style={styles.mathRow}>
                <Text style={styles.mathLabel}>Counted</Text>
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
            </View>

            {/* Previous days are listed one row per day ON PURPOSE. We deliberately
                do NOT render any all-time / grand total across days — the owner
                keeps the cumulative figure private. Do not "helpfully" add a sum. */}
            <Text style={styles.sectionTitle}>Previous days</Text>
            {closes.length === 0 ? (
              <Text style={styles.muted}>No previous closes recorded yet.</Text>
            ) : (
              closes.map((c, i) => {
                const cCounted = num(c.paan_cash) + num(c.tobacco_cash);
                const cOs = c.over_short == null ? cCounted - num(c.expected_cash) : num(c.over_short);
                return (
                  <View key={c.id != null ? String(c.id) : `${c.business_date}-${i}`} style={styles.dayCard}>
                    <View style={styles.dayTop}>
                      <Text style={styles.dayDate}>{c.business_date}</Text>
                      <Text style={[styles.dayOs, { color: cOs < 0 ? colors.danger : colors.healthy }]}>
                        {cOs === 0 ? '✓ Balanced' : `${cOs > 0 ? '+' : '−'}${money(Math.abs(cOs))}`}
                      </Text>
                    </View>
                    <Text style={styles.dayLine}>
                      Expected {money(num(c.expected_cash))} · Counted {money(cCounted)}
                    </Text>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.white, fontSize: 30, fontWeight: '700' },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 14 },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.textMuted, marginTop: spacing.xl, marginBottom: spacing.sm },
  fieldLabel: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: spacing.md, marginBottom: spacing.xs },

  expectedCard: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', ...shadow.card },
  expectedLabel: { color: colors.primaryLight, fontSize: 15, fontWeight: '800' },
  expectedValue: { color: colors.white, fontSize: 44, fontWeight: '900', marginTop: spacing.xs },
  expectedHint: { color: colors.primaryLight, fontSize: 12, fontWeight: '600', marginTop: spacing.xs, textAlign: 'center' },

  warnLine: { color: colors.low, fontSize: 13, fontWeight: '800', marginTop: spacing.md },

  moneyInput: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, fontSize: 30, fontWeight: '800', paddingVertical: spacing.md, color: colors.text },
  noteInput: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, fontSize: 16, paddingVertical: spacing.md, paddingHorizontal: spacing.md, color: colors.text },

  mathCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg, borderWidth: 2, borderColor: colors.border },
  mathRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs },
  mathLabel: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
  mathValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  mathDivider: { height: 2, backgroundColor: colors.border, marginVertical: spacing.sm },
  osLabel: { fontSize: 18, fontWeight: '900' },
  osValue: { fontSize: 26, fontWeight: '900' },

  closeBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.xl, ...shadow.card },
  closeBtnText: { color: colors.white, fontSize: 20, fontWeight: '900' },

  miniRow: { flexDirection: 'row', gap: spacing.md },
  miniCard: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md },
  miniLabel: { fontSize: 12, fontWeight: '800', color: colors.textMuted },
  miniValue: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },

  dayCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 2, borderColor: colors.border },
  dayTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayDate: { fontSize: 16, fontWeight: '800', color: colors.text },
  dayOs: { fontSize: 16, fontWeight: '900' },
  dayLine: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: 2 },
});
