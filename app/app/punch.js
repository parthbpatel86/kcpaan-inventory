// Employee time clock — punch in / punch out only. No reports, no money.
//
// Identity is a per-employee PIN. NOTE: the phone's fingerprint sensor cannot
// be used here — Android's biometric API only proves "the device owner
// authenticated", it cannot say WHICH employee. A USB/Bluetooth fingerprint
// reader would call this same endpoint and nothing else would change.
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { api } from '../src/lib/api';
import { L } from '../src/lib/labels';

export default function Punch() {
  const router = useRouter();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = () =>
    api.listEmployees()
      .then((e) => setEmployees(e))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  async function doPunch(intent) {
    if (!pin.trim() || busy) return;
    setBusy(true);
    try {
      const res = await api.punch(pin.trim(), intent);
      const verb = res.action === 'in' ? 'Punched IN' : 'Punched OUT';
      Alert.alert(`${verb} — ${res.employee}`, res.warning ? `⚠️ ${res.warning}` : timeNow());
      setPin('');
      setSelected(null);
      load();
    } catch (e) {
      const msg = String(e.message || e);
      Alert.alert('Not recognised', /404/.test(msg) ? 'That PIN is not registered.' : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Time Clock</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Who is on the clock</Text>
            <View style={styles.staffRow}>
              {employees.length === 0 && (
                <Text style={styles.muted}>No staff registered yet — add them in Manager → Settings.</Text>
              )}
              {employees.map((e) => (
                <View key={e.id} style={[styles.staffChip, e.on_clock && styles.staffChipOn]}>
                  <Text style={[styles.staffName, e.on_clock && styles.staffNameOn]}>{e.name}</Text>
                  <Text style={[styles.staffState, e.on_clock && styles.staffNameOn]}>
                    {e.on_clock ? `● ${L.punchIn.en}` : `○ ${L.punchOut.en}`}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Enter your PIN</Text>
            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              placeholder="• • • •"
              placeholderTextColor={colors.textLight}
              textAlign="center"
            />

            <View style={styles.btnRow}>
              <Pressable
                style={[styles.bigBtn, { backgroundColor: colors.healthy }, (!pin || busy) && { opacity: 0.5 }]}
                onPress={() => doPunch('in')}
                disabled={!pin || busy}
              >
                <Text style={styles.bigEmoji}>🟢</Text>
                <Text style={styles.bigEn}>{L.punchIn.en}</Text>
                <Text style={styles.bigGu}>{L.punchIn.gu}</Text>
              </Pressable>
              <Pressable
                style={[styles.bigBtn, { backgroundColor: colors.accent }, (!pin || busy) && { opacity: 0.5 }]}
                onPress={() => doPunch('out')}
                disabled={!pin || busy}
              >
                <Text style={styles.bigEmoji}>🔴</Text>
                <Text style={styles.bigEn}>{L.punchOut.en}</Text>
                <Text style={styles.bigGu}>{L.punchOut.gu}</Text>
              </Pressable>
            </View>
            {busy && <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function timeNow() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.white, fontSize: 30, fontWeight: '700' },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 14 },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm },
  staffRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  staffChip: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 2, borderColor: colors.border, minWidth: 110 },
  staffChipOn: { backgroundColor: colors.healthy, borderColor: colors.healthy },
  staffName: { fontSize: 16, fontWeight: '800', color: colors.text },
  staffNameOn: { color: colors.white },
  staffState: { fontSize: 12, fontWeight: '700', color: colors.textMuted },

  pinInput: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, fontSize: 34, letterSpacing: 10, paddingVertical: spacing.md, color: colors.text },

  btnRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  bigBtn: { flex: 1, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, ...shadow.card },
  bigEmoji: { fontSize: 40 },
  bigEn: { color: colors.white, fontSize: 24, fontWeight: '900', marginTop: 4 },
  bigGu: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
