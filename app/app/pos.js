import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
  Modal, Alert, RefreshControl, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow, HEALTH } from '../src/lib/theme';
import { api } from '../src/lib/api';
import { useCart } from '../src/lib/cart';

export default function POS() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cart = useCart();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const wideEnough = width >= 700; // tablet landscape: show side cart panel
  const numColumns = wideEnough ? 3 : 2;

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await api.listProducts();
      setProducts(data);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function checkout(paymentType) {
    if (cart.list.length === 0) return;
    setSubmitting(true);
    try {
      const items = cart.list.map((i) => ({ product_id: i.product.id, qty: i.qty }));
      const res = await api.createSale({ payment_type: paymentType, items });
      cart.clear();
      setCheckoutVisible(false);
      load(); // refresh stock + demand colors
      Alert.alert('Sale complete', `$${res.total.toFixed(2)} — ${labelForType(paymentType)}`);
    } catch (e) {
      Alert.alert('Checkout failed', String(e.message || e));
    } finally {
      setSubmitting(false);
    }
  }

  function renderCard({ item }) {
    const health = HEALTH[item.health] || HEALTH.healthy;
    const inCart = cart.items[item.id]?.qty || 0;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { borderLeftColor: health.color },
          pressed && styles.cardPressed,
          inCart > 0 && styles.cardActive,
        ]}
        onPress={() => cart.addItem(item)}
        onLongPress={() => cart.removeItem(item.id)}
        delayLongPress={350}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardEmoji}>{item.emoji || '🍃'}</Text>
          <View style={[styles.healthDot, { backgroundColor: health.color }]} />
        </View>
        <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
        <View style={styles.cardBottom}>
          <Text style={styles.cardPrice}>${item.price.toFixed(2)}</Text>
          {inCart > 0 && (
            <View style={styles.qtyBadge}>
              <Text style={styles.qtyBadgeTxt}>{inCart}</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>Loading products…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Home</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Shop Sales</Text>
        <Pressable onPress={load} hitSlop={12}>
          <Text style={styles.refresh}>↻</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorTxt}>⚠ {error}</Text>
        </View>
      )}

      <View style={styles.body}>
        {/* Product grid */}
        <View style={styles.gridWrap}>
          <FlatList
            data={products}
            keyExtractor={(p) => String(p.id)}
            renderItem={renderCard}
            numColumns={numColumns}
            key={numColumns}
            columnWrapperStyle={{ gap: spacing.md }}
            contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
            }
            ListHeaderComponent={
              <Text style={styles.hint}>Tap to add · long-press to remove · sorted by best sellers</Text>
            }
          />
        </View>

        {/* Side cart panel on wide screens */}
        {wideEnough && (
          <CartPanel cart={cart} onCheckout={() => setCheckoutVisible(true)} />
        )}
      </View>

      {/* Bottom cart bar on narrow screens */}
      {!wideEnough && cart.count > 0 && (
        <View style={styles.cartBar}>
          <View>
            <Text style={styles.cartBarCount}>{cart.count} items</Text>
            <Text style={styles.cartBarTotal}>${cart.total.toFixed(2)}</Text>
          </View>
          <Pressable style={styles.cartBarBtn} onPress={() => setCheckoutVisible(true)}>
            <Text style={styles.cartBarBtnTxt}>Checkout →</Text>
          </Pressable>
        </View>
      )}

      <CheckoutModal
        visible={checkoutVisible}
        cart={cart}
        submitting={submitting}
        onClose={() => setCheckoutVisible(false)}
        onPay={checkout}
      />
    </SafeAreaView>
  );
}

function CartPanel({ cart, onCheckout }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Current Order</Text>
      {cart.list.length === 0 ? (
        <View style={styles.panelEmpty}>
          <Text style={styles.panelEmptyEmoji}>🧾</Text>
          <Text style={styles.muted}>Tap items to add</Text>
        </View>
      ) : (
        <FlatList
          data={cart.list}
          keyExtractor={(i) => String(i.product.id)}
          contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}
          renderItem={({ item }) => (
            <View style={styles.lineItem}>
              <Text style={styles.lineEmoji}>{item.product.emoji || '🍃'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName} numberOfLines={1}>{item.product.name}</Text>
                <Text style={styles.lineSub}>${item.product.price.toFixed(2)} × {item.qty}</Text>
              </View>
              <View style={styles.lineQtyRow}>
                <Pressable style={styles.lineBtn} onPress={() => cart.decItem(item.product.id)}>
                  <Text style={styles.lineBtnTxt}>–</Text>
                </Pressable>
                <Text style={styles.lineQty}>{item.qty}</Text>
                <Pressable style={styles.lineBtn} onPress={() => cart.addItem(item.product)}>
                  <Text style={styles.lineBtnTxt}>+</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
      <View style={styles.panelFooter}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>${cart.total.toFixed(2)}</Text>
        </View>
        <Pressable
          style={[styles.checkoutBtn, cart.list.length === 0 && styles.disabled]}
          onPress={onCheckout}
          disabled={cart.list.length === 0}
        >
          <Text style={styles.checkoutBtnTxt}>Checkout</Text>
        </Pressable>
        {cart.list.length > 0 && (
          <Pressable onPress={cart.clear} style={styles.clearBtn}>
            <Text style={styles.clearTxt}>Clear order</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function labelForType(t) {
  return t === 'card' ? 'Credit Card' : t === 'cash' ? 'Cash' : 'In-store use';
}

function CheckoutModal({ visible, cart, submitting, onClose, onPay }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.checkoutSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Checkout</Text>

          <View style={styles.sheetSummary}>
            <Text style={styles.muted}>{cart.count} items</Text>
            <Text style={styles.sheetTotal}>${cart.total.toFixed(2)}</Text>
          </View>

          <Text style={styles.payLabel}>Choose payment</Text>
          <View style={styles.payRow}>
            <PayBtn color={colors.card} emoji="💳" label="Credit Card" onPress={() => onPay('card')} disabled={submitting} />
            <PayBtn color={colors.cash} emoji="💵" label="Cash" onPress={() => onPay('cash')} disabled={submitting} />
            <PayBtn color={colors.instore} emoji="🏠" label="In-store" onPress={() => onPay('instore')} disabled={submitting} />
          </View>

          {submitting && <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} />}

          <Pressable style={styles.sheetCancel} onPress={onClose} disabled={submitting}>
            <Text style={styles.sheetCancelTxt}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function PayBtn({ color, emoji, label, onPress, disabled }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.payBtn, { backgroundColor: color }, pressed && { opacity: 0.85 }, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.payEmoji}>{emoji}</Text>
      <Text style={styles.payTxt}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.bg },
  muted: { color: colors.textMuted, fontSize: 14 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  back: { color: colors.white, fontSize: 17, fontWeight: '600' },
  headerTitle: { color: colors.white, fontSize: 19, fontWeight: '800' },
  refresh: { color: colors.white, fontSize: 24 },
  errorBar: { backgroundColor: '#FDECEA', padding: spacing.sm, paddingHorizontal: spacing.lg },
  errorTxt: { color: colors.order, fontSize: 13 },
  body: { flex: 1, flexDirection: 'row' },
  gridWrap: { flex: 1 },
  hint: { color: colors.textLight, fontSize: 12, marginBottom: spacing.sm, paddingHorizontal: 2 },

  card: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md,
    borderLeftWidth: 5, minHeight: 110, justifyContent: 'space-between', ...shadow.card,
  },
  cardPressed: { transform: [{ scale: 0.96 }], opacity: 0.9 },
  cardActive: { borderColor: colors.primary, borderWidth: 1, borderLeftWidth: 5 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardEmoji: { fontSize: 30 },
  healthDot: { width: 12, height: 12, borderRadius: 6 },
  cardName: { fontSize: 14, fontWeight: '700', color: colors.text, marginVertical: spacing.xs },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPrice: { fontSize: 16, fontWeight: '800', color: colors.primary },
  qtyBadge: {
    backgroundColor: colors.accent, minWidth: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  qtyBadgeTxt: { color: colors.white, fontWeight: '800', fontSize: 14 },

  // Side panel
  panel: { width: 300, backgroundColor: colors.surface, borderLeftWidth: 1, borderLeftColor: colors.border, padding: spacing.md },
  panelTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  panelEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  panelEmptyEmoji: { fontSize: 44 },
  lineItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: spacing.sm },
  lineEmoji: { fontSize: 24 },
  lineName: { fontSize: 14, fontWeight: '700', color: colors.text },
  lineSub: { fontSize: 12, color: colors.textMuted },
  lineQtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  lineBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  lineBtnTxt: { color: colors.white, fontSize: 18, fontWeight: '800' },
  lineQty: { minWidth: 22, textAlign: 'center', fontWeight: '800', color: colors.text, fontSize: 15 },
  panelFooter: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  totalLabel: { fontSize: 16, color: colors.textMuted, fontWeight: '600' },
  totalValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  checkoutBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  checkoutBtnTxt: { color: colors.white, fontWeight: '800', fontSize: 17 },
  disabled: { opacity: 0.4 },
  clearBtn: { alignItems: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
  clearTxt: { color: colors.textMuted, fontSize: 13 },

  // Bottom cart bar (narrow)
  cartBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.lg,
  },
  cartBarCount: { color: colors.primaryLight, fontSize: 13 },
  cartBarTotal: { color: colors.white, fontSize: 22, fontWeight: '800' },
  cartBarBtn: { backgroundColor: colors.accent, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md },
  cartBarBtnTxt: { color: colors.white, fontWeight: '800', fontSize: 16 },

  // Checkout modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  checkoutSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, paddingBottom: spacing.xl + 12 },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: spacing.lg },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  sheetSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing.lg, paddingHorizontal: spacing.sm },
  sheetTotal: { fontSize: 28, fontWeight: '800', color: colors.primary },
  payLabel: { fontSize: 14, color: colors.textMuted, fontWeight: '600', marginBottom: spacing.sm },
  payRow: { flexDirection: 'row', gap: spacing.md },
  payBtn: { flex: 1, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center', gap: 6 },
  payEmoji: { fontSize: 30 },
  payTxt: { color: colors.white, fontWeight: '800', fontSize: 13, textAlign: 'center' },
  sheetCancel: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.lg },
  sheetCancelTxt: { color: colors.textMuted, fontSize: 16, fontWeight: '600' },
});
