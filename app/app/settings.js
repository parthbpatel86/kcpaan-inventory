// Manager settings — discount rules, punch guard-rail, and staff accounts.
//
// NOTE on staff identity: staff are identified by a 4-digit PIN, not by the
// phone's fingerprint sensor. Android's biometric API only proves "the device
// owner authenticated" — it cannot say WHICH employee is standing there. A PIN
// is the only thing on this hardware that identifies a specific person.
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { api } from '../src/lib/api';
import KeyboardScreen from '../src/components/KeyboardScreen';

export default function Settings() {
  const router = useRouter();
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
                        style={styles.faceBtn}
                        onPress={() =>
                          router.push({ pathname: '/enroll-face', params: { id: e.id, name: e.name } })
                        }
                        hitSlop={8}
                      >
                        <Text style={styles.faceText}>😀 Face</Text>
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
  muted: { color: colors.textMuted, fontSize: 14 },
  ownerToggle: {
    marginTop: spacing.xl, paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'flex-start',
  },
  ownerToggleText: { fontSize: 15, fontWeight: '800', color: colors.textMuted },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.textMuted, marginTop: spacing.xl, marginBottom: spacing.sm },
  fieldLabel: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  help: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },

  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 2, borderColor: colors.border, ...shadow.card },
  numInput: { backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, fontSize: 24, fontWeight: '800', paddingVertical: spacing.md, paddingHorizontal: spacing.md, color: colors.text },
  textInput: { backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, fontSize: 18, paddingVertical: spacing.md, paddingHorizontal: spacing.md, color: colors.text, marginTop: spacing.sm },

  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.sm, ...shadow.card },
  saveBtnText: { color: colors.white, fontSize: 18, fontWeight: '900' },

  staffCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 2, borderColor: colors.border },
  staffName: { fontSize: 17, fontWeight: '800', color: colors.text },
  staffState: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginTop: 2 },
  faceBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  faceText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  deactivateBtn: { backgroundColor: colors.danger, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  deactivateText: { color: colors.white, fontSize: 13, fontWeight: '800' },

  addBtn: { backgroundColor: colors.healthy, borderRadius: radius.md, alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.lg },
  addBtnText: { color: colors.white, fontSize: 17, fontWeight: '900' },
});
