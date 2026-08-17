// Home — deliberately employee-first.
//
// Parth: "Move things for manager to manager portal on upper right corner."
// So staff see exactly two big choices (sell / clock), and everything a manager
// needs sits behind the ⚙ button top-right, gated by the stock PIN.
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, TextInput, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { api } from '../src/lib/api';
import { verifyPin } from '../src/lib/pin';
import { L } from '../src/lib/labels';

export default function Home() {
  const router = useRouter();
  const [pinVisible, setPinVisible] = useState(false);
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [dash, setDash] = useState(null);
  const [onClock, setOnClock] = useState([]);

  const loadDash = useCallback(async () => {
    try { setDash(await api.dashboard()); } catch (e) { /* offline — show nothing */ }
    try {
      const staff = await api.listEmployees();
      setOnClock((staff || []).filter((e) => e.on_clock));
    } catch (e) { /* offline — show nothing */ }
  }, []);

  useFocusEffect(useCallback(() => { loadDash(); }, [loadDash]));

  async function submitPin() {
    setChecking(true);
    try {
      const res = await verifyPin(pin);
      if (res.ok) {
        setPinVisible(false);
        setPin('');
        router.push('/manager');
      } else if (res.noCache) {
        Alert.alert('Offline', 'No connection and no saved PIN yet. Connect to the internet and unlock once first.');
        setPin('');
      } else {
        Alert.alert('Wrong PIN', 'That PIN is not correct.');
        setPin('');
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Manager door — top right, small on purpose so staff don't wander in */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }} />
          <Pressable style={styles.mgrBtn} onPress={() => { setPin(''); setPinVisible(true); }} hitSlop={10}>
            <Text style={styles.mgrEmoji}>⚙️</Text>
            <Text style={styles.mgrTxt}>{L.manager.en}</Text>
          </Pressable>
        </View>

        <View style={styles.header}>
          <Text style={styles.brand}>KC Paan</Text>
        </View>

        {/* The two things an employee ever needs */}
        <Pressable style={styles.primaryTile} onPress={() => router.push('/pos')}>
          <Text style={styles.primaryEmoji}>🛒</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.primaryTitle}>Shop Sales</Text>
            <Text style={styles.primarySub}>વેચાણ · Ring up orders</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>

        <Pressable style={[styles.primaryTile, styles.clockTile]} onPress={() => router.push('/face-punch')}>
          <Text style={styles.primaryEmoji}>🕐</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.primaryTitle}>Time Clock</Text>
            <Text style={styles.primarySub}>{L.punchIn.gu} / {L.punchOut.gu} · Punch in & out</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>

        {/* Who is on the clock right now. Parth: "On the main screen, show
            whoever is clocked in as names." */}
        {onClock.length > 0 && (
          <View style={styles.onClockCard}>
            <Text style={styles.onClockLabel}>● Working now</Text>
            <View style={styles.onClockNames}>
              {onClock.map((e) => (
                <View key={e.id} style={styles.onClockChip}>
                  <Text style={styles.onClockName}>{e.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Reorder alert is operationally useful to staff too */}
        {dash?.reorder_count > 0 && (
          <View style={styles.alertCard}>
            <Text style={styles.alertNum}>{dash.reorder_count}</Text>
            <Text style={styles.alertTxt}>items need reorder</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={pinVisible} transparent animationType="fade" onRequestClose={() => setPinVisible(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{L.manager.en} PIN</Text>
            <TextInput
              style={styles.modalInput}
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              autoFocus
              textAlign="center"
              onSubmitEditing={submitPin}
            />
            <View style={styles.modalBtns}>
              <Pressable style={styles.modalCancel} onPress={() => setPinVisible(false)} disabled={checking}>
                <Text style={styles.modalCancelTxt}>{L.cancel.en}</Text>
              </Pressable>
              <Pressable style={styles.modalOk} onPress={submitPin} disabled={checking}>
                {checking ? <ActivityIndicator color={colors.white} /> : <Text style={styles.modalOkTxt}>Unlock</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primary },
  scroll: { padding: spacing.lg, paddingTop: spacing.md },

  topBar: { flexDirection: 'row', alignItems: 'center' },
  mgrBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.xl },
  mgrEmoji: { fontSize: 20 },
  mgrTxt: { color: colors.white, fontWeight: '800', fontSize: 18 },

  header: { alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.xl },
  brand: { color: colors.white, fontSize: 44, fontWeight: '900' },

  primaryTile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, marginBottom: spacing.lg, ...shadow.card },
  clockTile: { backgroundColor: colors.gold },
  primaryEmoji: { fontSize: 44 },
  primaryTitle: { fontSize: 26, fontWeight: '900', color: colors.text },
  primarySub: { fontSize: 18, color: colors.textMuted, marginTop: 2 },
  chev: { fontSize: 34, color: colors.textLight },

  onClockCard: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  onClockLabel: { color: colors.white, fontSize: 18, fontWeight: '800', marginBottom: spacing.sm, opacity: 0.9 },
  onClockNames: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  onClockChip: { backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6 },
  onClockName: { color: colors.primaryDark, fontSize: 20, fontWeight: '900' },
  alertCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.order, borderRadius: radius.lg, padding: spacing.lg },
  alertNum: { color: colors.white, fontSize: 32, fontWeight: '900' },
  alertTxt: { color: colors.white, fontSize: 19, fontWeight: '700' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  modalCard: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' },
  modalInput: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 30, letterSpacing: 8, marginTop: spacing.lg, color: colors.text },
  modalBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modalCancel: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center' },
  modalCancelTxt: { fontSize: 20, fontWeight: '800', color: colors.textMuted },
  modalOk: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  modalOkTxt: { fontSize: 20, fontWeight: '800', color: colors.white },
});
