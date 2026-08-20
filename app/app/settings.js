// Manager settings — discount rules, punch guard-rail, and staff accounts.
//
// NOTE on staff identity: staff are identified by a 4-digit PIN, not by the
// phone's fingerprint sensor. Android's biometric API only proves "the device
// owner authenticated" — it cannot say WHICH employee is standing there. A PIN
// is the only thing on this hardware that identifies a specific person.
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { api } from '../src/lib/api';
import KeyboardScreen from '../src/components/KeyboardScreen';
import { useNfc } from '../src/components/NfcProvider';

export default function Settings() {
  const router = useRouter();
  const { supported: nfcSupported, enabled: nfcEnabled, captureTag, cancelCapture } = useNfc();
  const [tagFor, setTagFor] = useState(null);   // employee awaiting a tag tap
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [empDiscount, setEmpDiscount] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [punchHours, setPunchHours] = useState('');
  const [employees, setEmployees] = useState([]);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const loadEmployees = () =>
    api.listEmployees()
      .then((e) => setEmployees(Array.isArray(e) ? e : []))
      .catch(() => {});

  const load = () =>
    Promise.all([api.settings().catch(() => null), loadEmployees()])
      .then(([s]) => {
        if (s) {
          setEmpDiscount(str(s.employee_discount_pct));
          setMaxDiscount(str(s.max_discount_pct));
          setPunchHours(str(s.punch_max_hours));
        }
      })
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await api.updateSettings({
        employee_discount_pct: num(empDiscount),
        max_discount_pct: num(maxDiscount),
        punch_max_hours: num(punchHours),
      });
      Alert.alert('Saved', 'Settings updated.');
    } catch (e) {
      Alert.alert('Could not save', String(e.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function addStaff() {
    if (addBusy) return;
    const name = newName.trim();
    const pin = newPin.trim();
    if (!name) return Alert.alert('Name required', 'Enter the staff member’s name.');
    if (!/^\d{4}$/.test(pin)) return Alert.alert('PIN must be 4 digits', 'Enter exactly 4 numbers.');
    setAddBusy(true);
    try {
      await api.createEmployee({ name, pin });
      setNewName('');
      setNewPin('');
      await loadEmployees();
      Alert.alert('Staff added', `${name} can now punch in with PIN ${pin}.`);
    } catch (e) {
      Alert.alert('Could not add staff', String(e.message || e));
    } finally {
      setAddBusy(false);
    }
  }

  function deactivate(emp) {
    Alert.alert(
      `Deactivate ${emp.name}?`,
      'Their PIN stops working. Past punches and sales are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.updateEmployee(emp.id, { active: 0 });
              await loadEmployees();
            } catch (e) {
              Alert.alert('Could not deactivate', String(e.message || e));
            }
          },
        },
      ],
    );
  }

  // Assign a physical tag to one member of staff. The ambient reader hands the
  // next tap here instead of clocking anybody in.
  async function registerTag(emp) {
    if (!nfcSupported) {
      return Alert.alert('No NFC', 'This device cannot read tags. Staff can still use their PIN.');
    }
    if (!nfcEnabled) {
      return Alert.alert('NFC is off', 'Switch NFC on in Android settings, then try again.');
    }
    setTagFor(emp);
    try {
      const uid = await captureTag();
      await api.updateEmployee(emp.id, { nfc_uid: uid });
      setTagFor(null);
      Alert.alert('Tag registered', `${emp.name} can now clock in by tapping this tag.`);
      load();
    } catch (e) {
      setTagFor(null);
      const msg = String(e?.message || e);
      if (msg === 'cancelled') return;
      Alert.alert(
        'Could not register',
        /409/.test(msg) ? 'That tag is already assigned to someone else.' : msg,
      );
    }
  }

  async function removeTag(emp) {
    try {
      await api.updateEmployee(emp.id, { nfc_uid: '' });
      load();
    } catch (e) {
      Alert.alert('Could not remove', String(e?.message || e));
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardScreen>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Add staff</Text>
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.textInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Ramesh"
                placeholderTextColor={colors.textLight}
              />
              <Text style={styles.fieldLabel}>4-digit PIN</Text>
              <Text style={styles.help}>They type this to punch in and out. Keep it unique.</Text>
              <TextInput
                style={styles.numInput}
                value={newPin}
                onChangeText={setNewPin}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="0000"
                placeholderTextColor={colors.textLight}
              />
              <Pressable style={[styles.addBtn, addBusy && { opacity: 0.5 }]} onPress={addStaff} disabled={addBusy}>
                <Text style={styles.addBtnText}>Add staff member</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Staff</Text>
            <Text style={styles.help}>
              Staff are identified by a 4-digit PIN. The phone’s fingerprint sensor can only verify
              the device owner — it cannot tell which employee is using the app — so the PIN is what
              ties a punch or a sale to a person.
            </Text>

            {employees.length === 0 ? (
              <Text style={styles.muted}>No staff registered yet.</Text>
            ) : (
              employees.map((e) => (
                <View key={String(e.id)} style={styles.staffCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.staffName}>{e.name}</Text>
                    <Text style={styles.staffState}>{isActive(e) ? 'Active' : 'Inactive'}</Text>
                  </View>
                  {isActive(e) ? (
                    <>
                      <Pressable
                        style={[styles.faceBtn, e.has_nfc && styles.tagBtnOn]}
                        onPress={() => (e.has_nfc ? removeTag(e) : registerTag(e))}
                        hitSlop={8}
                      >
                        <Text style={styles.faceText}>
                          {e.has_nfc ? '✓ Tag' : '📶 Tag'}
                        </Text>
                      </Pressable>
                      <Pressable style={styles.deactivateBtn} onPress={() => deactivate(e)} hitSlop={8}>
                        <Text style={styles.deactivateText}>Deactivate</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              ))
            )}


            {/* Owner-only. Parth: "Rules in the settings needs to be hidden
                for manager as its an owner thing." Hidden behind a tap so a
                manager cannot casually change the discount percentages. */}
            <Pressable style={styles.ownerToggle} onPress={() => setShowRules(!showRules)}>
              <Text style={styles.ownerToggleText}>
                {showRules ? "▾  Owner settings" : "▸  Owner settings"}
              </Text>
            </Pressable>
            {showRules ? (
              <>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Employee discount %</Text>
              <Text style={styles.help}>Employee discount % applied by the EMPLOYEE button.</Text>
              <TextInput
                style={styles.numInput}
                value={empDiscount}
                onChangeText={setEmpDiscount}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textLight}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Maximum discount %</Text>
              <Text style={styles.help}>The largest discount staff can give on any sale.</Text>
              <TextInput
                style={styles.numInput}
                value={maxDiscount}
                onChangeText={setMaxDiscount}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textLight}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Punch maximum hours</Text>
              <Text style={styles.help}>A shift longer than this is flagged as a forgotten punch-out.</Text>
              <TextInput
                style={styles.numInput}
                value={punchHours}
                onChangeText={setPunchHours}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textLight}
              />
            </View>

            <Pressable style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={save} disabled={saving}>
              <Text style={styles.saveBtnText}>Save settings</Text>
            </Pressable>

              </>
            ) : null}
          </>
        )}
      </KeyboardScreen>
      <Modal visible={!!tagFor} transparent animationType="fade"
             onRequestClose={() => { cancelCapture(); setTagFor(null); }}>
        <View style={styles.tagModalBg}>
          <View style={styles.tagModalCard}>
            <Text style={styles.tagModalEmoji}>📶</Text>
            <Text style={styles.tagModalName}>{tagFor?.name}</Text>
            <Text style={styles.tagModalHint}>
              Hold the tag against the BACK of the phone.
            </Text>
            <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />
            <Pressable style={styles.tagModalCancel}
                       onPress={() => { cancelCapture(); setTagFor(null); }}>
              <Text style={styles.tagModalCancelTxt}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function isActive(e) {
  return e.active === undefined || e.active === null ? true : !!Number(e.active);
}

function str(v) {
  return v === undefined || v === null ? '' : String(v);
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.white, fontSize: 30, fontWeight: '700' },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 18 },
  ownerToggle: {
    marginTop: spacing.xl, paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'flex-start',
  },
  ownerToggleText: { fontSize: 19, fontWeight: '800', color: colors.textMuted },

  sectionTitle: { fontSize: 19, fontWeight: '800', color: colors.textMuted, marginTop: spacing.xl, marginBottom: spacing.sm },
  fieldLabel: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  help: { fontSize: 18, fontWeight: '600', color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },

  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 2, borderColor: colors.border, ...shadow.card },
  numInput: { backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, fontSize: 24, fontWeight: '800', paddingVertical: spacing.md, paddingHorizontal: spacing.md, color: colors.text },
  textInput: { backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, fontSize: 20, paddingVertical: spacing.md, paddingHorizontal: spacing.md, color: colors.text, marginTop: spacing.sm },

  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.sm, ...shadow.card },
  saveBtnText: { color: colors.white, fontSize: 20, fontWeight: '900' },

  staffCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 2, borderColor: colors.border },
  staffName: { fontSize: 20, fontWeight: '800', color: colors.text },
  staffState: { fontSize: 18, fontWeight: '700', color: colors.textMuted, marginTop: 2 },
  faceBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  faceText: { color: colors.white, fontSize: 18, fontWeight: '800' },
  tagBtnOn: { backgroundColor: colors.healthy },
  tagModalBg: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  tagModalCard: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center' },
  tagModalEmoji: { fontSize: 54 },
  tagModalName: { fontSize: 28, fontWeight: '900', color: colors.text, marginTop: spacing.sm },
  tagModalHint: { fontSize: 20, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  tagModalCancel: { marginTop: spacing.xl, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  tagModalCancelTxt: { fontSize: 20, fontWeight: '800', color: colors.textMuted },
  deactivateBtn: { backgroundColor: colors.danger, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  deactivateText: { color: colors.white, fontSize: 18, fontWeight: '800' },

  addBtn: { backgroundColor: colors.healthy, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.lg },
  addBtnText: { color: colors.white, fontSize: 20, fontWeight: '900' },
});
