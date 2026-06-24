import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Modal, Alert, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { api } from '../src/lib/api';

function payLabel(t) {
  return t === 'card' ? '💳 Card' : t === 'cash' ? '💵 Cash' : '🏠 In-store';
}
function timeOf(iso) {
  // backend stores "YYYY-MM-DD HH:MM:SS" (UTC-ish); show HH:MM
  const m = (iso || '').match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '';
}

export default function History() {
  const router = useRouter();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scope, setScope] = useState('today'); // today | all
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.listSales(scope === 'all' ? '?all=1&limit=200' : '');
      setSales(data);
    } catch (e) {
      Alert.alert('Could not load history', String(e.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  const total = sales.filter((s) => !s.voided).reduce((sum, s) => sum + s.total, 0);
  const count = sales.filter((s) => !s.voided).length;

  async function openDetail(sale) {
    try {
      const full = await api.getSale(sale.id);
      setDetail(full);
    } catch (e) {
      Alert.alert('Error', String(e.message || e));
    }
  }

  async function voidSale(sale) {
    Alert.alert('Void this sale?', `$${sale.total.toFixed(2)} — stock will be returned.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Void', style: 'destructive',
        onPress: async () => {
          try { await api.voidSale(sale.id); setDetail(null); load(); }
          catch (e) { Alert.alert('Void failed', String(e.message || e)); }
        },
      },
    ]);
  }

  function renderRow({ item }) {
    return (
      <Pressable style={[styles.row, item.voided && styles.rowVoided]} onPress={() => openDetail(item)}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTotal, item.voided && styles.strike]}>${item.total.toFixed(2)}</Text>
          <Text style={styles.rowMeta}>
            {payLabel(item.payment_type)} · {timeOf(item.created_at)}
            {item.discount > 0 ? ` · -$${item.discount.toFixed(2)}` : ''}
          </Text>
        </View>
        {item.voided ? <Text style={styles.voidTag}>VOIDED</Text> : <Text style={styles.chev}>›</Text>}
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.headerTitle}>Sale History</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryItem}><Text style={styles.summaryVal}>{count}</Text><Text style={styles.summaryLbl}>sales</Text></View>
        <View style={styles.summaryItem}><Text style={[styles.summaryVal, { color: colors.primary }]}>${total.toFixed(2)}</Text><Text style={styles.summaryLbl}>total</Text></View>
      </View>

      <View style={styles.scopeRow}>
        {['today', 'all'].map((s) => (
          <Pressable key={s} style={[styles.scopeChip, scope === s && styles.scopeActive]} onPress={() => setScope(s)}>
            <Text style={[styles.scopeTxt, scope === s && styles.scopeTxtActive]}>{s === 'today' ? 'Today' : 'Recent'}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(s) => String(s.id)}
          renderItem={renderRow}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<View style={styles.center}><Text style={styles.muted}>No sales yet</Text></View>}
        />
      )}

      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={styles.modalBg}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            {detail && (
              <>
                <Text style={styles.sheetTitle}>Sale #{detail.id}{detail.voided ? ' (Voided)' : ''}</Text>
                <Text style={styles.sheetMeta}>{payLabel(detail.payment_type)} · {timeOf(detail.created_at)}</Text>
                <View style={styles.itemList}>
                  {(detail.items || []).map((it, i) => (
                    <View key={i} style={styles.itemRow}>
                      <Text style={styles.itemName}>{it.name}</Text>
                      <Text style={styles.itemQty}>{it.qty} × ${it.price.toFixed(2)}</Text>
                      <Text style={styles.itemLine}>${(it.qty * it.price).toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.totalsBox}>
                  <View style={styles.totLine}><Text style={styles.totLbl}>Subtotal</Text><Text style={styles.totVal}>${detail.subtotal.toFixed(2)}</Text></View>
                  {detail.discount > 0 && <View style={styles.totLine}><Text style={[styles.totLbl, { color: colors.accent }]}>Discount</Text><Text style={[styles.totVal, { color: colors.accent }]}>-${detail.discount.toFixed(2)}</Text></View>}
                  <View style={styles.totLine}><Text style={styles.totLblBig}>Total</Text><Text style={styles.totValBig}>${detail.total.toFixed(2)}</Text></View>
                </View>
                {!detail.voided && (
                  <Pressable style={styles.voidBtn} onPress={() => voidSale(detail)}><Text style={styles.voidBtnTxt}>Void Sale (return stock)</Text></Pressable>
                )}
                <Pressable style={styles.closeBtn} onPress={() => setDetail(null)}><Text style={styles.closeTxt}>Close</Text></Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
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

  summary: { flexDirection: 'row', backgroundColor: colors.surface, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { fontSize: 24, fontWeight: '800', color: colors.text },
  summaryLbl: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  scopeRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.sm },
  scopeChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  scopeActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  scopeTxt: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  scopeTxtActive: { color: colors.white },

  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, ...shadow.card },
  rowVoided: { opacity: 0.6 },
  rowTotal: { fontSize: 18, fontWeight: '800', color: colors.text },
  strike: { textDecorationLine: 'line-through', color: colors.textMuted },
  rowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  voidTag: { color: colors.order, fontWeight: '800', fontSize: 12 },
  chev: { fontSize: 28, color: colors.textLight, fontWeight: '300' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, paddingBottom: spacing.xl + 12 },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: spacing.lg },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  sheetMeta: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },
  itemList: { gap: spacing.sm, marginBottom: spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center' },
  itemName: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '600' },
  itemQty: { fontSize: 13, color: colors.textMuted, marginRight: spacing.md },
  itemLine: { fontSize: 15, fontWeight: '700', color: colors.text, minWidth: 60, textAlign: 'right' },
  totalsBox: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  totLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  totLbl: { fontSize: 14, color: colors.textMuted },
  totVal: { fontSize: 14, color: colors.text, fontWeight: '600' },
  totLblBig: { fontSize: 18, color: colors.text, fontWeight: '800' },
  totValBig: { fontSize: 20, color: colors.primary, fontWeight: '800' },
  voidBtn: { backgroundColor: '#FDECEA', borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  voidBtnTxt: { color: colors.order, fontWeight: '800', fontSize: 15 },
  closeBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  closeTxt: { color: colors.textMuted, fontSize: 16, fontWeight: '600' },
});
