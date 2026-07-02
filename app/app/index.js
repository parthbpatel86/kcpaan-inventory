import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, TextInput, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { api } from '../src/lib/api';
import { verifyPin } from '../src/lib/pin';

export default function Home() {
  const router = useRouter();
  const [pinVisible, setPinVisible] = useState(false);
  const [pinTarget, setPinTarget] = useState('/stock'); // where to go after PIN
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [dash, setDash] = useState(null);

  const loadDash = useCallback(async () => {
    try { setDash(await api.dashboard()); } catch (e) { /* offline — show nothing */ }
  }, []);

  // Refresh dashboard every time the home screen regains focus.
  useFocusEffect(useCallback(() => { loadDash(); }, [loadDash]));

  function askPin(target) {
    setPinTarget(target);
    setPin('');
    setPinVisible(true);
  }

  async function submitPin() {
    setChecking(true);
    try {
      const res = await verifyPin(pin);
      if (res.ok) {
        setPinVisible(false);
        setPin('');
        router.push(pinTarget);
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
        <View style={styles.header}>
          <Text style={styles.brand}>KC Paan</Text>
          <Text style={styles.sub}>Point of Sale & Inventory</Text>
        </View>

        {/* Manager glance: today's sales + reorder alert */}
        <View style={styles.glance}>
          <View style={styles.todayCard}>
            <Text style={styles.todayLabel}>Today's Sales</Text>
            <Text style={styles.todayValue}>
              ${dash ? dash.today.total.toFixed(2) : '—'}
            </Text>
            <Text style={styles.todayCount}>
              {dash ? `${dash.today.count} sale${dash.today.count === 1 ? '' : 's'}` : ' '}
            </Text>
          </View>

          <Pressable
            style={[styles.reorderCard, dash && dash.reorder_count > 0 ? styles.reorderAlert : styles.reorderOk]}
            onPress={() => askPin('/stock?filter=reorder')}
          >
            <Text style={styles.reorderNum}>{dash ? dash.reorder_count : '—'}</Text>
            <Text style={styles.reorderLabel}>
              {dash && dash.reorder_count > 0 ? 'Need reorder →' : 'All stocked ✓'}
            </Text>
          </Pressable>
        </View>

        {/* Primary actions */}
        <Pressable
          style={({ pressed }) => [styles.bigCard, styles.posCard, pressed && styles.pressed]}
          onPress={() => router.push('/pos')}
        >
          <Text style={styles.bigEmoji}>🛒</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigTitle}>Shop Sales</Text>
            <Text style={styles.bigDesc}>Ring up orders, take payment</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.bigCard, styles.stockCard, pressed && styles.pressed]}
          onPress={() => askPin('/stock')}
        >
          <Text style={styles.bigEmoji}>📦</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigTitle}>Stock Management</Text>
            <Text style={styles.bigDesc}>Inventory & warehouse · PIN</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>

        <View style={styles.secondaryRow}>
          <Pressable style={({ pressed }) => [styles.secCard, pressed && styles.pressed]} onPress={() => router.push('/history')}>
            <Text style={styles.secEmoji}>🧾</Text>
            <Text style={styles.secTitle}>History</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.secCard, pressed && styles.pressed]} onPress={() => askPin('/reports')}>
            <Text style={styles.secEmoji}>📊</Text>
            <Text style={styles.secTitle}>Reports · PIN</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={pinVisible} transparent animationType="fade" onRequestClose={() => setPinVisible(false)}>
        <View style={styles.modalBg}>
          <View style={styles.pinBox}>
            <Text style={styles.pinTitle}>Enter Stock PIN</Text>
            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              autoFocus
              placeholder="••••"
              placeholderTextColor={colors.textLight}
            />
            <View style={styles.pinRow}>
              <Pressable style={[styles.pinBtn, styles.pinCancel]} onPress={() => { setPinVisible(false); setPin(''); }}>
                <Text style={styles.pinCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.pinBtn, styles.pinGo]} onPress={submitPin} disabled={checking}>
                {checking ? <ActivityIndicator color={colors.white} /> : <Text style={styles.pinGoTxt}>Unlock</Text>}
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
  scroll: { padding: spacing.lg, gap: spacing.lg },
  header: { paddingTop: spacing.lg, alignItems: 'center' },
  brand: { fontSize: 38, fontWeight: '800', color: colors.white, letterSpacing: 0.5 },
  sub: { fontSize: 15, color: colors.primaryLight, marginTop: 2 },

  glance: { flexDirection: 'row', gap: spacing.md },
  todayCard: { flex: 1.4, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, ...shadow.card },
  todayLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  todayValue: { fontSize: 34, fontWeight: '800', color: colors.primary, marginTop: 2 },
  todayCount: { fontSize: 13, color: colors.textLight, marginTop: 2 },
  reorderCard: { flex: 1, borderRadius: radius.lg, padding: spacing.lg, justifyContent: 'center', alignItems: 'center', ...shadow.card },
  reorderOk: { backgroundColor: colors.healthy },
  reorderAlert: { backgroundColor: colors.order },
  reorderNum: { fontSize: 34, fontWeight: '800', color: colors.white },
  reorderLabel: { fontSize: 13, color: colors.white, fontWeight: '700', marginTop: 2, textAlign: 'center' },

  bigCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
    borderRadius: radius.xl, padding: spacing.xl, ...shadow.card,
  },
  posCard: { backgroundColor: colors.white },
  stockCard: { backgroundColor: colors.gold },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  bigEmoji: { fontSize: 46 },
  bigTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  bigDesc: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  chev: { fontSize: 36, color: colors.textLight, fontWeight: '300' },
  secondaryRow: { flexDirection: 'row', gap: spacing.md },
  secCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', ...shadow.card },
  secEmoji: { fontSize: 30 },
  secTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: spacing.xs },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.xl },
  pinBox: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl },
  pinTitle: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: spacing.lg },
  pinInput: {
    borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, fontSize: 28,
    textAlign: 'center', letterSpacing: 8, paddingVertical: spacing.md, color: colors.text,
    marginBottom: spacing.lg,
  },
  pinRow: { flexDirection: 'row', gap: spacing.md },
  pinBtn: { flex: 1, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  pinCancel: { backgroundColor: colors.surfaceAlt },
  pinCancelTxt: { color: colors.textMuted, fontWeight: '700', fontSize: 16 },
  pinGo: { backgroundColor: colors.primary },
  pinGoTxt: { color: colors.white, fontWeight: '700', fontSize: 16 },
});
