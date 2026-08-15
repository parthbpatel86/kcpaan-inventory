import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
  Modal, Alert, RefreshControl, ScrollView, TextInput, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow, HEALTH } from '../src/lib/theme';
import { api } from '../src/lib/api';
import { useCart } from '../src/lib/cart';
import ProductImage from '../src/components/ProductImage';
import { createSaleResilient, syncPending, pendingCount } from '../src/lib/offline';
import { verifyPin } from '../src/lib/pin';

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
  const [category, setCategory] = useState('All');
  const [discount, setDiscount] = useState(0);       // applied discount amount ($)
  const [discountVisible, setDiscountVisible] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pending, setPending] = useState(0);          // queued offline sales
  const [offline, setOffline] = useState(false);

  const wideEnough = width >= 700;
  const numColumns = wideEnough ? 3 : 2;

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await api.listProducts();
      setProducts(data);
      setOffline(false);
      // back online → flush any queued sales
      const synced = await syncPending();
      if (synced > 0) {
        const data2 = await api.listProducts();
        setProducts(data2);
      }
      setPending(await pendingCount());
    } catch (e) {
      setError(String(e.message || e));
      setOffline(true);
      setPending(await pendingCount());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Top 6 best sellers — pinned quick row so 80% of sales are one tap, no scroll.
  const favorites = useMemo(() => products.slice(0, 6), [products]);

  // Category chips, derived from the catalog.
  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [products]);

  const visible = useMemo(
    () => (category === 'All' ? products : products.filter((p) => p.category === category)),
    [products, category]
  );

  // discounted total for display
  const cartTotal = Math.max(0, cart.total - discount);

  async function checkout(paymentType) {
    if (cart.list.length === 0) return;
    setSubmitting(true);
    try {
      const items = cart.list.map((i) => ({ product_id: i.product.id, qty: i.qty }));
      const res = await createSaleResilient({ payment_type: paymentType, items, discount });
      cart.clear();
      setDiscount(0);
      setCheckoutVisible(false);
      load();
      if (res.queued) {
        Alert.alert('Saved offline', `$${cartTotal.toFixed(2)} — ${labelForType(paymentType)}\nWill sync when back online.`);
      } else {
        Alert.alert('Sale complete', `$${res.result.total.toFixed(2)} — ${labelForType(paymentType)}`);
      }
    } catch (e) {
      Alert.alert('Checkout failed', String(e.message || e));
    } finally {
      setSubmitting(false);
    }
  }

  // Quick cash: the most common paan sale — one tap from the cart bar, no modal.
  function quickCash() {
    if (cart.list.length === 0) return;
    checkout('cash');
  }


  function renderCard({ item }) {
    const health = HEALTH[item.health] || HEALTH.healthy;
    const inCart = cart.items[item.id]?.qty || 0;
    return (
      <View style={[styles.card, { borderLeftColor: health.color }, inCart > 0 && styles.cardActive]}>
        <Pressable style={styles.cardTapZone} onPress={() => cart.addItem(item)} onLongPress={() => cart.removeItem(item.id)} delayLongPress={350}>
          <View style={styles.cardTop}>
            <ProductImage product={item} size={44} />
            <View style={[styles.healthDot, { backgroundColor: health.color }]} />
          </View>
          <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.cardPrice}>${item.price.toFixed(2)}</Text>
        </Pressable>
        {/* Inline qty controls — works on phone too, no need to open the cart */}
        {inCart > 0 ? (
          <View style={styles.cardQtyRow}>
            <Pressable style={styles.qtyBtn} onPress={() => cart.decItem(item.id)} hitSlop={6}>
              <Text style={styles.qtyBtnTxt}>–</Text>
            </Pressable>
            <Text style={styles.qtyNum}>{inCart}</Text>
            <Pressable style={styles.qtyBtn} onPress={() => cart.addItem(item)} hitSlop={6}>
              <Text style={styles.qtyBtnTxt}>+</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cardAddHint}><Text style={styles.cardAddHintTxt}>Tap to add</Text></View>
        )}
      </View>
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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹ Home</Text></Pressable>
        <Text style={styles.headerTitle}>Shop Sales</Text>
        <Pressable onPress={() => router.push('/history')} hitSlop={12}><Text style={styles.refresh}>🧾</Text></Pressable>
      </View>

      {(offline || pending > 0) && (
        <View style={styles.offlineBar}>
          <Text style={styles.offlineTxt}>
            {offline ? '📴 Offline — sales are saved on this device' : `🔄 ${pending} sale${pending === 1 ? '' : 's'} waiting to sync`}
          </Text>
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.gridWrap}>
          <FlatList
            data={visible}
            keyExtractor={(p) => String(p.id)}
            renderItem={renderCard}
            extraData={cart.items}
            numColumns={numColumns}
            key={numColumns}
            columnWrapperStyle={{ gap: spacing.md }}
            contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 140 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
            ListHeaderComponent={
              <View>
                {/* ⭐ Quick row: pinned best sellers */}
                {category === 'All' && (
                  <View style={styles.quickSection}>
                    <Text style={styles.quickTitle}>⭐ Quick Add — Best Sellers</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                      {favorites.map((item) => {
                        const inCart = cart.items[item.id]?.qty || 0;
                        return (
                          <Pressable key={item.id} style={[styles.fav, inCart > 0 && styles.favActive]} onPress={() => cart.addItem(item)} onLongPress={() => cart.removeItem(item.id)} delayLongPress={350}>
                            <ProductImage product={item} size={40} />
                            <Text style={styles.favName} numberOfLines={1}>{item.name}</Text>
                            <Text style={styles.favPrice}>${item.price.toFixed(2)}</Text>
                            {inCart > 0 && <View style={styles.favBadge}><Text style={styles.favBadgeTxt}>{inCart}</Text></View>}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Category chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                  {categories.map((c) => (
                    <Pressable key={c} style={[styles.catChip, category === c && styles.catChipActive]} onPress={() => setCategory(c)}>
                      <Text style={[styles.catTxt, category === c && styles.catTxtActive]}>{c}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={styles.hint}>Tap to add · long-press to remove</Text>
              </View>
            }
          />
        </View>

        {wideEnough && <CartPanel cart={cart} cartTotal={cartTotal} discount={discount} onCheckout={() => setCheckoutVisible(true)} onQuickCash={quickCash} submitting={submitting} />}
      </View>

      {/* Bottom cart bar with quick-cash + full checkout */}
      {!wideEnough && cart.count > 0 && (
        <View style={styles.cartBar}>
          <View style={styles.cartBarInfo}>
            <Text style={styles.cartBarCount}>{cart.count} item{cart.count === 1 ? '' : 's'}{discount > 0 ? ` · -$${discount.toFixed(2)}` : ''}</Text>
            <Text style={styles.cartBarTotal}>${cartTotal.toFixed(2)}</Text>
          </View>
          <Pressable style={styles.cashBtn} onPress={quickCash} disabled={submitting}>
            <Text style={styles.cashEmoji}>💵</Text>
            <Text style={styles.cashTxt}>Cash</Text>
          </Pressable>
          <Pressable style={styles.moreBtn} onPress={() => setCheckoutVisible(true)} disabled={submitting}>
            <Text style={styles.moreTxt}>More ▾</Text>
          </Pressable>
        </View>
      )}

      <CheckoutModal
        visible={checkoutVisible} cart={cart} cartTotal={cartTotal} discount={discount}
        submitting={submitting} onClose={() => setCheckoutVisible(false)} onPay={checkout}
        onDiscount={() => setPinModalVisible(true)} onClearDiscount={() => setDiscount(0)}
      />

      <DiscountPinModal
        pinVisible={pinModalVisible} discountVisible={discountVisible}
        maxAmount={cart.total}
        onPinOk={() => { setPinModalVisible(false); setDiscountVisible(true); }}
        onPinCancel={() => setPinModalVisible(false)}
        onApply={(amt) => { setDiscount(amt); setDiscountVisible(false); }}
        onDiscountCancel={() => setDiscountVisible(false)}
      />
    </SafeAreaView>
  );
}

function CartPanel({ cart, onCheckout, onQuickCash, submitting }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Current Order</Text>
      {cart.list.length === 0 ? (
        <View style={styles.panelEmpty}><Text style={styles.panelEmptyEmoji}>🧾</Text><Text style={styles.muted}>Tap items to add</Text></View>
      ) : (
        <FlatList
          data={cart.list}
          keyExtractor={(i) => String(i.product.id)}
          contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}
          renderItem={({ item }) => (
            <View style={styles.lineItem}>
              <ProductImage product={item.product} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName} numberOfLines={1}>{item.product.name}</Text>
                <Text style={styles.lineSub}>${item.product.price.toFixed(2)} × {item.qty}</Text>
              </View>
              <View style={styles.lineQtyRow}>
                <Pressable style={styles.lineBtn} onPress={() => cart.decItem(item.product.id)}><Text style={styles.lineBtnTxt}>–</Text></Pressable>
                <Text style={styles.lineQty}>{item.qty}</Text>
                <Pressable style={styles.lineBtn} onPress={() => cart.addItem(item.product)}><Text style={styles.lineBtnTxt}>+</Text></Pressable>
              </View>
            </View>
          )}
        />
      )}
      <View style={styles.panelFooter}>
        {discount > 0 && (
          <View style={styles.totalRow}><Text style={styles.discLabel}>Discount</Text><Text style={styles.discValue}>-${discount.toFixed(2)}</Text></View>
        )}
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>${cartTotal.toFixed(2)}</Text></View>
        <Pressable style={[styles.panelCash, cart.list.length === 0 && styles.disabled]} onPress={onQuickCash} disabled={cart.list.length === 0 || submitting}>
          <Text style={styles.panelCashTxt}>💵 Cash — ${cartTotal.toFixed(2)}</Text>
        </Pressable>
        <Pressable style={[styles.panelMore, cart.list.length === 0 && styles.disabled]} onPress={onCheckout} disabled={cart.list.length === 0}>
          <Text style={styles.panelMoreTxt}>Card / In-store / Discount</Text>
        </Pressable>
        {cart.list.length > 0 && <Pressable onPress={cart.clear} style={styles.clearBtn}><Text style={styles.clearTxt}>Clear order</Text></Pressable>}
      </View>
    </View>
  );
}

function labelForType(t) {
  return t === 'card' ? 'Credit Card' : t === 'cash' ? 'Cash' : 'In-store use';
}

function CheckoutModal({ visible, cart, cartTotal, discount, submitting, onClose, onPay, onDiscount, onClearDiscount }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.checkoutSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Checkout</Text>
          <View style={styles.sheetSummary}>
            <Text style={styles.muted}>{cart.count} items</Text>
            <View style={{ alignItems: 'flex-end' }}>
              {discount > 0 && <Text style={styles.sheetStrike}>${cart.total.toFixed(2)}</Text>}
              <Text style={styles.sheetTotal}>${cartTotal.toFixed(2)}</Text>
            </View>
          </View>

          {/* Discount control (manager PIN gated) */}
          <Pressable style={styles.discRow} onPress={discount > 0 ? onClearDiscount : onDiscount} disabled={submitting}>
            <Text style={styles.discRowTxt}>
              {discount > 0 ? `🏷️ Discount applied: -$${discount.toFixed(2)} — tap to remove` : '🏷️ Add discount (manager)'}
            </Text>
          </Pressable>

          <Text style={styles.payLabel}>Choose payment</Text>
          <View style={styles.payRow}>
            <PayBtn color={colors.cash} emoji="💵" label="Cash" onPress={() => onPay('cash')} disabled={submitting} />
            <PayBtn color={colors.card} emoji="💳" label="Credit Card" onPress={() => onPay('card')} disabled={submitting} />
            <PayBtn color={colors.instore} emoji="🏠" label="In-store" onPress={() => onPay('instore')} disabled={submitting} />
          </View>
          {submitting && <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} />}
          <Pressable style={styles.sheetCancel} onPress={onClose} disabled={submitting}><Text style={styles.sheetCancelTxt}>Cancel</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

function DiscountPinModal({ pinVisible, discountVisible, maxAmount, onPinOk, onPinCancel, onApply, onDiscountCancel }) {
  const [pin, setPin] = useState('');
  const [amt, setAmt] = useState('');
  const [checking, setChecking] = useState(false);

  async function submitPin() {
    if (checking) return;
    setChecking(true);
    try {
      const res = await verifyPin(pin);
      if (res.ok) { setPin(''); onPinOk(); }
      else if (res.noCache) { Alert.alert('Offline', 'No connection and no saved PIN yet. Connect once first.'); setPin(''); }
      else { Alert.alert('Wrong PIN'); setPin(''); }
    } finally {
      setChecking(false);
    }
  }
  function apply() {
    const v = Math.min(parseFloat(amt) || 0, maxAmount);
    setAmt('');
    onApply(v);
  }

  return (
    <>
      <Modal visible={pinVisible} transparent animationType="fade" onRequestClose={onPinCancel}>
        <View style={styles.modalBg2}>
          <View style={styles.pinBox}>
            <Text style={styles.pinTitle}>Manager PIN</Text>
            <Text style={styles.pinSub}>Required to apply a discount</Text>
            <TextInput style={styles.pinInput} value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={8} autoFocus placeholder="••••" placeholderTextColor={colors.textLight} />
            <View style={styles.pinRow}>
              <Pressable style={[styles.pinBtn, styles.pinCancel]} onPress={() => { setPin(''); onPinCancel(); }}><Text style={styles.pinCancelTxt}>Cancel</Text></Pressable>
              <Pressable style={[styles.pinBtn, styles.pinGo]} onPress={submitPin}><Text style={styles.pinGoTxt}>OK</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={discountVisible} transparent animationType="fade" onRequestClose={onDiscountCancel}>
        <View style={styles.modalBg2}>
          <View style={styles.pinBox}>
            <Text style={styles.pinTitle}>Discount Amount</Text>
            <Text style={styles.pinSub}>Order total: ${maxAmount.toFixed(2)}</Text>
            <TextInput style={styles.pinInput} value={amt} onChangeText={setAmt} keyboardType="decimal-pad" autoFocus placeholder="$0.00" placeholderTextColor={colors.textLight} />
            <View style={styles.pinRow}>
              <Pressable style={[styles.pinBtn, styles.pinCancel]} onPress={() => { setAmt(''); onDiscountCancel(); }}><Text style={styles.pinCancelTxt}>Cancel</Text></Pressable>
              <Pressable style={[styles.pinBtn, styles.pinGo]} onPress={apply}><Text style={styles.pinGoTxt}>Apply</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function PayBtn({ color, emoji, label, onPress, disabled }) {
  return (
    <Pressable style={({ pressed }) => [styles.payBtn, { backgroundColor: color }, pressed && { opacity: 0.85 }, disabled && { opacity: 0.5 }]} onPress={onPress} disabled={disabled}>
      <Text style={styles.payEmoji}>{emoji}</Text>
      <Text style={styles.payTxt}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.bg },
  muted: { color: colors.textMuted, fontSize: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.white, fontSize: 17, fontWeight: '600' },
  headerTitle: { color: colors.white, fontSize: 19, fontWeight: '800' },
  refresh: { color: colors.white, fontSize: 24 },
  errorBar: { backgroundColor: '#FDECEA', padding: spacing.sm, paddingHorizontal: spacing.lg },
  offlineBar: { backgroundColor: colors.gold, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  offlineTxt: { color: colors.text, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  errorTxt: { color: colors.order, fontSize: 13 },
  body: { flex: 1, flexDirection: 'row' },
  gridWrap: { flex: 1 },
  hint: { color: colors.textLight, fontSize: 12, marginBottom: spacing.sm, paddingHorizontal: 2 },

  // Quick row
  quickSection: { marginBottom: spacing.md },
  quickTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  fav: { width: 110, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', borderWidth: 2, borderColor: colors.gold, ...shadow.card },
  favActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  favEmoji: { fontSize: 32 },
  favName: { fontSize: 12, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: 4 },
  favPrice: { fontSize: 14, fontWeight: '800', color: colors.primary, marginTop: 2 },
  favBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: colors.accent, minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  favBadgeTxt: { color: colors.white, fontWeight: '800', fontSize: 13 },

  // Category chips
  catRow: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.md },
  catChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  catChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catTxt: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  catTxtActive: { color: colors.white },

  // Product card
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderLeftWidth: 5, minHeight: 130, ...shadow.card },
  cardActive: { borderColor: colors.primary, borderWidth: 1, borderLeftWidth: 5 },
  cardTapZone: { padding: spacing.md, flex: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardEmoji: { fontSize: 30 },
  healthDot: { width: 12, height: 12, borderRadius: 6 },
  cardName: { fontSize: 14, fontWeight: '700', color: colors.text, marginVertical: spacing.xs },
  cardPrice: { fontSize: 16, fontWeight: '800', color: colors.primary },
  cardAddHint: { backgroundColor: colors.surfaceAlt, paddingVertical: 6, alignItems: 'center' },
  cardAddHintTxt: { fontSize: 11, color: colors.textLight, fontWeight: '600' },
  cardQtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primaryLight, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  qtyBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  qtyBtnTxt: { color: colors.white, fontSize: 20, fontWeight: '800' },
  qtyNum: { fontSize: 18, fontWeight: '800', color: colors.text },

  // Side panel (tablet)
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
  panelCash: { backgroundColor: colors.cash, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  panelCashTxt: { color: colors.white, fontWeight: '800', fontSize: 16 },
  panelMore: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  panelMoreTxt: { color: colors.text, fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.4 },
  clearBtn: { alignItems: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
  clearTxt: { color: colors.textMuted, fontSize: 13 },

  // Bottom cart bar (phone)
  cartBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.primaryDark, paddingHorizontal: spacing.md, paddingVertical: spacing.md, paddingBottom: spacing.lg },
  cartBarInfo: { flex: 1 },
  cartBarCount: { color: colors.primaryLight, fontSize: 13 },
  cartBarTotal: { color: colors.white, fontSize: 22, fontWeight: '800' },
  cashBtn: { backgroundColor: colors.cash, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md },
  cashEmoji: { fontSize: 18 },
  cashTxt: { color: colors.white, fontWeight: '800', fontSize: 16 },
  moreBtn: { backgroundColor: colors.accent, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md },
  moreTxt: { color: colors.white, fontWeight: '800', fontSize: 14 },

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

  // discount + pin
  discLabel: { fontSize: 14, color: colors.accent, fontWeight: '600' },
  discValue: { fontSize: 16, color: colors.accent, fontWeight: '800' },
  sheetStrike: { fontSize: 16, color: colors.textLight, textDecorationLine: 'line-through' },
  discRow: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  discRowTxt: { color: colors.text, fontWeight: '700', fontSize: 14 },
  modalBg2: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.xl },
  pinBox: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl },
  pinTitle: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  pinSub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 4, marginBottom: spacing.lg },
  pinInput: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, fontSize: 28, textAlign: 'center', letterSpacing: 4, paddingVertical: spacing.md, color: colors.text, marginBottom: spacing.lg },
  pinRow: { flexDirection: 'row', gap: spacing.md },
  pinBtn: { flex: 1, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  pinCancel: { backgroundColor: colors.surfaceAlt },
  pinCancelTxt: { color: colors.textMuted, fontWeight: '700', fontSize: 16 },
  pinGo: { backgroundColor: colors.primary },
  pinGoTxt: { color: colors.white, fontWeight: '700', fontSize: 16 },
});
