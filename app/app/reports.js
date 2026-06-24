import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { api } from '../src/lib/api';

const RANGES = [
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
];

function payLabel(t) {
  return t === 'card' ? '💳 Card' : t === 'cash' ? '💵 Cash' : '🏠 In-store';
}

export default function Reports() {
  const router = useRouter();
  const [range, setRange] = useState('7');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      // compute from-date client side: today minus (range-1) days
      const now = new Date();
      const from = new Date(now);
      from.setDate(now.getDate() - (parseInt(range) - 1));
      const fmt = (d) => d.toISOString().slice(0, 10);
      const res = await api.reports(`?from=${fmt(from)}&to=${fmt(now)}`);
      setData(res);
    } catch (e) {
      Alert.alert('Could not load reports', String(e.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const maxDay = data ? Math.max(1, ...data.by_day.map((d) => d.total)) : 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.headerTitle}>Reports</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.rangeRow}>
        {RANGES.map((r) => (
          <Pressable key={r.key} style={[styles.rangeChip, range === r.key && styles.rangeActive]} onPress={() => setRange(r.key)}>
            <Text style={[styles.rangeTxt, range === r.key && styles.rangeTxtActive]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {/* Headline */}
          <View style={styles.headline}>
            <View style={styles.headItem}><Text style={styles.headVal}>${data.total.toFixed(2)}</Text><Text style={styles.headLbl}>Total Sales</Text></View>
            <View style={styles.headDivider} />
            <View style={styles.headItem}><Text style={styles.headVal}>{data.count}</Text><Text style={styles.headLbl}>Transactions</Text></View>
          </View>
          {data.discount > 0 && <Text style={styles.discNote}>Discounts given: ${data.discount.toFixed(2)}</Text>}

          {/* By day bar chart */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Daily Sales</Text>
            {data.by_day.length === 0 ? (
              <Text style={styles.muted}>No sales in this range</Text>
            ) : data.by_day.map((d) => (
              <View key={d.day} style={styles.barRow}>
                <Text style={styles.barDay}>{d.day.slice(5)}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.max(4, (d.total / maxDay) * 100)}%` }]} />
                </View>
                <Text style={styles.barVal}>${d.total.toFixed(0)}</Text>
              </View>
            ))}
          </View>

          {/* Payment split */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>By Payment</Text>
            {Object.keys(data.by_type).length === 0 ? (
              <Text style={styles.muted}>—</Text>
            ) : Object.entries(data.by_type).map(([t, v]) => (
              <View key={t} style={styles.splitRow}>
                <Text style={styles.splitLabel}>{payLabel(t)}</Text>
                <Text style={styles.splitCount}>{v.count} sales</Text>
                <Text style={styles.splitTotal}>${v.total.toFixed(2)}</Text>
              </View>
            ))}
          </View>

          {/* Top items */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Top Sellers</Text>
            {data.top_items.length === 0 ? (
              <Text style={styles.muted}>No sales yet</Text>
            ) : data.top_items.map((it, i) => (
              <View key={it.name} style={styles.topRow}>
                <Text style={styles.topRank}>{i + 1}</Text>
                <Text style={styles.topName} numberOfLines={1}>{it.name}</Text>
                <Text style={styles.topQty}>{it.qty} sold</Text>
                <Text style={styles.topRev}>${it.revenue.toFixed(0)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  muted: { color: colors.textMuted, fontSize: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.white, fontSize: 17, fontWeight: '600' },
  headerTitle: { color: colors.white, fontSize: 19, fontWeight: '800' },

  rangeRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.sm },
  rangeChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  rangeActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  rangeTxt: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  rangeTxtActive: { color: colors.white },

  headline: { flexDirection: 'row', backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg, ...shadow.card },
  headItem: { flex: 1, alignItems: 'center' },
  headDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  headVal: { fontSize: 28, fontWeight: '800', color: colors.white },
  headLbl: { fontSize: 13, color: colors.primaryLight, marginTop: 2 },
  discNote: { fontSize: 13, color: colors.accent, fontWeight: '600', textAlign: 'center' },

  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, ...shadow.card },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: spacing.md },

  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  barDay: { width: 44, fontSize: 12, color: colors.textMuted },
  barTrack: { flex: 1, height: 18, backgroundColor: colors.surfaceAlt, borderRadius: 9, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 9 },
  barVal: { width: 50, textAlign: 'right', fontSize: 13, fontWeight: '700', color: colors.text },

  splitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  splitLabel: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '600' },
  splitCount: { fontSize: 13, color: colors.textMuted, marginRight: spacing.md },
  splitTotal: { fontSize: 16, fontWeight: '800', color: colors.primary, minWidth: 70, textAlign: 'right' },

  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  topRank: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.gold, color: colors.text, textAlign: 'center', lineHeight: 22, fontWeight: '800', fontSize: 13 },
  topName: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '600' },
  topQty: { fontSize: 13, color: colors.textMuted, marginRight: spacing.sm },
  topRev: { fontSize: 15, fontWeight: '700', color: colors.primary, minWidth: 50, textAlign: 'right' },
});
