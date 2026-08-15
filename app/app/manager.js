// Manager Portal — everything staff should not routinely touch, behind one PIN.
//
// Parth: "Move things for manager to manager portal on upper right corner."
// The employee home screen keeps only Shop Sales and Punch In/Out.
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { api } from '../src/lib/api';

export default function ManagerPortal() {
  const router = useRouter();
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api.shiftSummary().then(setSummary).catch(() => {});
  }, []);

  const tiles = [
    { key: 'stock', emoji: '📦', title: 'Stock', sub: 'Inventory & reorder', to: '/stock' },
    { key: 'timesheet', emoji: '🕐', title: 'Timesheets', sub: 'Hours, fixes, audit log', to: '/timesheet' },
    { key: 'shift', emoji: '🧮', title: 'Close Shift', sub: 'Count drawer, end of day', to: '/shift' },
    { key: 'reports', emoji: '📊', title: 'Reports', sub: 'Sales by day & item', to: '/reports' },
    { key: 'history', emoji: '🧾', title: 'Sale History', sub: 'Recent sales, void', to: '/history' },
    { key: 'settings', emoji: '⚙️', title: 'Settings', sub: 'Discounts, PIN, staff', to: '/settings' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Manager</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        {summary && (
          <View style={styles.todayCard}>
            <Text style={styles.todayLabel}>Today</Text>
            <Text style={styles.todayTotal}>${(summary.sales_total ?? 0).toFixed(2)}</Text>
            <View style={styles.todayRow}>
              <Chip label="Cash" value={summary.expected_cash} />
              <Chip label="Card" value={summary.cc_total} />
              <Chip label="Shop" value={summary.shop_total} />
            </View>
          </View>
        )}

        <View style={styles.grid}>
          {tiles.map((t) => (
            <Pressable key={t.key} style={styles.tile} onPress={() => router.push(t.to)}>
              <Text style={styles.tileEmoji}>{t.emoji}</Text>
              <Text style={styles.tileTitle}>{t.title}</Text>
              <Text style={styles.tileSub}>{t.sub}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ label, value }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue}>${(value ?? 0).toFixed(2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.white, fontSize: 30, fontWeight: '700' },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },

  todayCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  todayLabel: { fontSize: 14, color: colors.textMuted, fontWeight: '700' },
  todayTotal: { fontSize: 36, fontWeight: '900', color: colors.text },
  todayRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  chip: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  chipLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '700' },
  chipValue: { fontSize: 16, color: colors.text, fontWeight: '800' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { flexGrow: 1, flexBasis: '46%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, minHeight: 130, justifyContent: 'center', ...shadow.card },
  tileEmoji: { fontSize: 34 },
  tileTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  tileSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
