import { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { api } from '../src/lib/api';

export default function Home() {
  const router = useRouter();
  const [pinVisible, setPinVisible] = useState(false);
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);

  async function submitPin() {
    setChecking(true);
    try {
      const res = await api.verifyPin(pin);
      if (res.ok) {
        setPinVisible(false);
        setPin('');
        router.push('/stock');
      } else {
        Alert.alert('Wrong PIN', 'That PIN is not correct.');
        setPin('');
      }
    } catch (e) {
      Alert.alert('Connection error', String(e.message || e));
    } finally {
      setChecking(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.brand}>KC Paan</Text>
        <Text style={styles.sub}>Point of Sale & Inventory</Text>
      </View>

      <View style={styles.cards}>
        <Pressable
          style={({ pressed }) => [styles.bigCard, styles.posCard, pressed && styles.pressed]}
          onPress={() => router.push('/pos')}
        >
          <Text style={styles.bigEmoji}>🛒</Text>
          <Text style={styles.bigTitle}>Shop Sales</Text>
          <Text style={styles.bigDesc}>Ring up orders, take payment</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.bigCard, styles.stockCard, pressed && styles.pressed]}
          onPress={() => setPinVisible(true)}
        >
          <Text style={styles.bigEmoji}>📦</Text>
          <Text style={styles.bigTitle}>Stock Management</Text>
          <Text style={styles.bigDesc}>Inventory & warehouse · PIN</Text>
        </Pressable>
      </View>

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
  header: { paddingTop: spacing.xl, paddingBottom: spacing.xl, alignItems: 'center' },
  brand: { fontSize: 40, fontWeight: '800', color: colors.white, letterSpacing: 0.5 },
  sub: { fontSize: 15, color: colors.primaryLight, marginTop: 4 },
  cards: { flex: 1, padding: spacing.lg, gap: spacing.lg, justifyContent: 'center' },
  bigCard: {
    borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center',
    justifyContent: 'center', minHeight: 180, ...shadow.card,
  },
  posCard: { backgroundColor: colors.white },
  stockCard: { backgroundColor: colors.gold },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  bigEmoji: { fontSize: 56, marginBottom: spacing.sm },
  bigTitle: { fontSize: 26, fontWeight: '800', color: colors.text },
  bigDesc: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
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
