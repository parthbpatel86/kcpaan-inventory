// Employee time clock — punch in / punch out only. No reports, no money.
//
// Identity is a per-employee PIN. NOTE: the phone's fingerprint sensor cannot
// be used here — Android's biometric API only proves "the device owner
// authenticated", it cannot say WHICH employee. A USB/Bluetooth fingerprint
// reader would call this same endpoint and nothing else would change.
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ActivityIndicator, ScrollView, Modal } from 'react-native';
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

  // Parth: "no need to tap on name, then edit pin, and then in/out." The PIN
  // sheet opens the moment a name is tapped and fires as soon as the 4th digit
  // lands, so the whole clock-in is: tap name, type PIN. The server decides IN
  // vs OUT, so nobody is ever asked to choose.
  async function doPunch(person, code) {
    // Identity comes from the SELECTED person, not from the PIN alone. If two
    // people ever shared a PIN, a PIN-only punch could clock in the wrong one.
    if (!person || !code || busy) return;
    setBusy(true);
    try {
      const res = await api.punch(code, undefined, person.id);
      const verb = res.action === 'in' ? 'Punched IN' : 'Punched OUT';
      setSelected(null);
      setPin('');
      Alert.alert(`${verb} — ${res.employee}`, res.warning ? `⚠️ ${res.warning}` : timeNow());
      load();
    } catch (e) {
      const msg = String(e.message || e);
      setPin('');
      Alert.alert(
        'Not recognised',
        /404/.test(msg) ? `That PIN is not correct for ${person.name}.` : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  function onPinChange(person, value) {
    const code = value.replace(/\D/g, '').slice(0, 4);
    setPin(code);
    // PINs are exactly 4 digits (enforced when staff are created), so the 4th
    // digit is an unambiguous "go" — no extra button to find and press.
    if (code.length === 4) doPunch(person, code);
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
            {/* Tapping an NFC tag works on every screen, so this screen only
                explains it — the reader is already listening. Parth dropped the
                face option: "face scanning is not promising and has a lot of
                bugs." */}
            <View style={styles.tagCard}>
              <Text style={styles.tagEmoji}>📶</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.tagEn}>Tap your tag</Text>
                <Text style={styles.tagGu}>તમારું ટૅગ અડાડો</Text>
                <Text style={styles.tagHint}>Hold it to the back of the phone.</Text>
              </View>
            </View>

            <Text style={styles.orTxt}>— or —</Text>

            <Text style={styles.sectionTitle}>Tap your name</Text>
            <View style={styles.staffRow}>
              {employees.length === 0 && (
                <Text style={styles.muted}>No staff registered yet — add them in Manager → Settings.</Text>
              )}
              {employees.map((e) => (
                <Pressable
                  key={e.id}
                  style={[styles.staffChip, e.on_clock && styles.staffChipOn]}
                  onPress={() => { setSelected(e); setPin(''); }}
                >
                  <Text style={[styles.staffName, e.on_clock && styles.staffNameOn]}>{e.name}</Text>
                  <Text style={[styles.staffState, e.on_clock && styles.staffNameOn]}>
                    {e.on_clock ? `● ${L.punchIn.en}` : `○ ${L.punchOut.en}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* PIN sheet — opens on the name tap, submits on the 4th digit. The
          heading states the action the server is about to take, so nobody has
          to decide between IN and OUT. */}
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => { setSelected(null); setPin(''); }}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalName}>{selected?.name}</Text>
            <Text style={styles.modalAction}>
              {selected?.on_clock
                ? `🔴 Punch ${L.punchOut.en} · ${L.punchOut.gu}`
                : `🟢 Punch ${L.punchIn.en} · ${L.punchIn.gu}`}
            </Text>
            <Text style={styles.modalHint}>Enter your 4-digit PIN</Text>
            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={(v) => onPinChange(selected, v)}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              placeholder="• • • •"
              placeholderTextColor={colors.textLight}
              textAlign="center"
              autoFocus
              editable={!busy}
            />
            {busy ? (
              <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} />
            ) : (
              <Pressable
                style={styles.modalCancel}
                onPress={() => { setSelected(null); setPin(''); }}
              >
                <Text style={styles.modalCancelTxt}>{L.cancel.en}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
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
  muted: { color: colors.textMuted, fontSize: 18 },

  sectionTitle: { fontSize: 19, fontWeight: '800', color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm },
  staffRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  staffChip: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 2, borderColor: colors.border, minWidth: 110 },
  staffChipPicked: { borderColor: colors.primary, borderWidth: 3 },
  staffChipOn: { backgroundColor: colors.healthy, borderColor: colors.healthy },
  staffName: { fontSize: 20, fontWeight: '800', color: colors.text },
  staffNameOn: { color: colors.white },
  staffState: { fontSize: 18, fontWeight: '700', color: colors.textMuted },

  tagCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.primaryLight, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 2, borderColor: colors.primary,
  },
  tagEmoji: { fontSize: 40 },
  tagEn: { fontSize: 24, fontWeight: '900', color: colors.text },
  tagGu: { fontSize: 20, fontWeight: '700', color: colors.textMuted },
  tagHint: { fontSize: 18, color: colors.textMuted, marginTop: 2 },
  orTxt: { fontSize: 19, fontWeight: '700', color: colors.textLight, textAlign: 'center', marginTop: spacing.lg },

  modalBg: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', gap: 4 },
  modalName: { fontSize: 30, fontWeight: '900', color: colors.text },
  modalAction: { fontSize: 22, fontWeight: '800', color: colors.textMuted, marginBottom: spacing.sm },
  modalHint: { fontSize: 19, color: colors.textMuted, marginBottom: spacing.sm },
  modalCancel: { marginTop: spacing.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  modalCancelTxt: { fontSize: 20, fontWeight: '800', color: colors.textMuted },

  punchBtn: { borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, marginTop: spacing.xl, ...shadow.card },
  punchEmoji: { fontSize: 44 },
  punchEn: { color: colors.white, fontSize: 22, fontWeight: '900', marginTop: 4, textAlign: 'center' },
  punchGu: { color: colors.white, fontSize: 20, fontWeight: '700' },
  pinInput: { alignSelf: 'stretch', backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, fontSize: 34, letterSpacing: 10, paddingVertical: spacing.md, color: colors.text },

  // Face is an EXTRA path, not a replacement — the PIN below it always works.
  faceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: spacing.xl, ...shadow.card },
  faceEmoji: { fontSize: 40 },
  faceEn: { color: colors.white, fontSize: 22, fontWeight: '900' },
  faceGu: { color: colors.white, fontSize: 19, fontWeight: '700' },

  btnRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  bigBtn: { flex: 1, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, ...shadow.card },
  bigEmoji: { fontSize: 40 },
  bigEn: { color: colors.white, fontSize: 24, fontWeight: '900', marginTop: 4 },
  bigGu: { color: colors.white, fontSize: 20, fontWeight: '700' },
});
