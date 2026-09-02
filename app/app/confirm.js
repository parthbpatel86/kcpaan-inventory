// Final review before money changes hands.
//
// Design rules (Parth): every line shows a PHOTO + name + qty so a member of
// staff who does not read English can still check the order against what is on
// the counter. Payment is four BIG buttons; the discount is a small one so it
// can't be hit by accident during a rush.
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useCart } from '../src/lib/cart';
import ProductImage from '../src/components/ProductImage';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { L } from '../src/lib/labels';
import { api } from '../src/lib/api';
import NfcHeaderButton from '../src/components/NfcHeaderButton';
import { createSaleResilient, newClientRef } from '../src/lib/offline';

export default function Confirm() {
  const router = useRouter();
  const cart = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [employee, setEmployee] = useState(false);   // EMPLOYEE toggle (8%)
  const [discount, setDiscount] = useState(0);       // manual $ discount
  const [discVisible, setDiscVisible] = useState(false);
  const [cfg, setCfg] = useState({ employee_discount_pct: 8, max_discount_pct: 8 });
  // One key per checkout attempt: retrying after a timeout must not double-charge.
  const [clientRef, setClientRef] = useState(newClientRef);

  useEffect(() => {
    api.settings()
      .then((s) => setCfg({
        employee_discount_pct: Number(s.employee_discount_pct ?? 8),
        max_discount_pct: Number(s.max_discount_pct ?? 8),
      }))
      .catch(() => {});
  }, []);

  const subtotal = cart.total;
  const empAmt = employee ? round2(subtotal * cfg.employee_discount_pct / 100) : 0;
  // Employee rate and the manual discount never stack (Parth's rule).
  const discAmt = employee ? 0 : Math.min(discount, maxDiscount());
  const total = Math.max(0, round2(subtotal - empAmt - discAmt));

  function maxDiscount() {
    return round2(subtotal * cfg.max_discount_pct / 100);
  }

  async function pay(paymentType) {
    if (cart.list.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const items = cart.list.map((i) => ({ product_id: i.product.id, qty: i.qty }));
      const body = {
        payment_type: paymentType,
        items,
        client_ref: clientRef,
        ...(employee ? { employee_discount: true } : discAmt > 0 ? { discount: discAmt } : {}),
      };
      const res = await createSaleResilient(body);

      if (res.rejected) {
        // Server refused (e.g. stock ran out on another till). Keep the cart so
        // staff can fix the order instead of silently losing it.
        Alert.alert('Not completed', friendlyError(res.error));
        setSubmitting(false);
        return;
      }

      cart.clear();
      if (res.queued) {
        Alert.alert('Saved offline', `$${total.toFixed(2)} — will sync when back online.`);
      } else {
        Alert.alert('Sale complete', `$${(res.result?.total ?? total).toFixed(2)} — ${paymentType.toUpperCase()}`);
      }
      router.replace('/pos');
    } catch (e) {
      Alert.alert('Not completed', String(e.message || e));
    } finally {
      setSubmitting(false);
    }
  }

  function renderLine({ item }) {
    const line = item.qty * item.product.price;
    return (
      <View style={styles.line}>
        <ProductImage product={item.product} size={72} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.lineName} numberOfLines={2}>{item.product.name}</Text>
          <Text style={styles.lineUnit}>${item.product.price.toFixed(2)} each</Text>
        </View>
        <View style={styles.qtyBox}>
          <Pressable style={styles.qBtn} onPress={() => cart.decItem(item.product.id)} hitSlop={8}>
            <Text style={styles.qBtnTxt}>−</Text>
          </Pressable>
          <Text style={styles.qNum}>{item.qty}</Text>
          <Pressable style={styles.qBtn} onPress={() => cart.addItem(item.product)} hitSlop={8}>
            <Text style={styles.qBtnTxt}>+</Text>
          </Pressable>
        </View>
        <Text style={styles.lineTotal}>${line.toFixed(2)}</Text>
      </View>
    );
  }

  if (cart.list.length === 0) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <Text style={styles.emptyEmoji}>🧾</Text>
        <Text style={styles.muted}>Cart is empty</Text>
        <Pressable style={styles.backBtn} onPress={() => router.replace('/pos')}>
          <Text style={styles.backBtnTxt}>← Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ {L.cancel.en}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{L.review.en}</Text>
        <NfcHeaderButton />
        <Text style={styles.headerCount}>{cart.count}</Text>
      </View>

      <FlatList
        data={cart.list}
        keyExtractor={(i) => String(i.product.id)}
        renderItem={renderLine}
        extraData={cart.items}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.md }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />

      <View style={styles.footer}>
        {/* Totals */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{L.total.en} / {L.total.gu}</Text>
          <View style={{ alignItems: 'flex-end' }}>
            {(empAmt > 0 || discAmt > 0) && (
              <Text style={styles.strike}>${subtotal.toFixed(2)}</Text>
            )}
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>
        </View>
        {empAmt > 0 && (
          <Text style={styles.discNote}>{L.employee.en} −{cfg.employee_discount_pct}% (−${empAmt.toFixed(2)})</Text>
        )}
        {discAmt > 0 && (
          <Text style={styles.discNote}>{L.discount.en} −${discAmt.toFixed(2)}</Text>
        )}

        {/* Small discount button — deliberately not a big target */}
        <Pressable
          style={[styles.discBtn, employee && styles.discBtnDisabled]}
          onPress={() => (discAmt > 0 ? setDiscount(0) : setDiscVisible(true))}
          disabled={employee || submitting}
        >
          <Text style={styles.discBtnTxt}>
            {employee
              ? `${L.discount.en} n/a — ${L.employee.en}`
              : discAmt > 0
              ? `${L.discount.en}: −$${discAmt.toFixed(2)} ✕`
              : `＋ ${L.discount.en} / ${L.discount.gu} (max ${cfg.max_discount_pct}%)`}
          </Text>
        </Pressable>

        {/* Four big payment buttons */}
        <View style={styles.payGrid}>
          <PayBig color={colors.cash} emoji="💵" label={L.cash} onPress={() => pay('cash')} disabled={submitting} />
          <PayBig color={colors.card} emoji="💳" label={L.card} onPress={() => pay('card')} disabled={submitting} />
          <PayBig color={colors.instore} emoji="🏠" label={L.shop} onPress={() => pay('shop')} disabled={submitting} />
          <PayBig
            color={colors.gold}
            emoji="👤"
            label={L.employee}
            sub={`−${cfg.employee_discount_pct}%`}
            active={employee}
            onPress={() => setEmployee((v) => !v)}
            disabled={submitting}
          />
        </View>
        {employee && (
          <Text style={styles.empHint}>
            {L.employee.en} −{cfg.employee_discount_pct}% armed — now tap {L.cash.en}, {L.card.en} or {L.shop.en}
          </Text>
        )}
        {submitting && <ActivityIndicator style={{ marginTop: spacing.sm }} color={colors.primary} />}
      </View>

      <DiscountModal
        visible={discVisible}
        subtotal={subtotal}
        maxPct={cfg.max_discount_pct}
        onCancel={() => setDiscVisible(false)}
        onApply={(amt) => { setDiscount(amt); setDiscVisible(false); }}
      />
    </SafeAreaView>
  );
}

function PayBig({ color, emoji, label, sub, onPress, disabled, active }) {
  return (
    <Pressable
      style={[styles.payBig, { backgroundColor: color }, active && styles.payBigActive, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.payEmoji}>{emoji}</Text>
      <Text style={styles.payEn}>{label.en}</Text>
      <Text style={styles.payGu}>{label.gu}</Text>
      {sub ? <Text style={styles.paySub}>{active ? `✓ ${sub}` : sub}</Text> : null}
    </Pressable>
  );
}

// Discount entry. Both % and $ are clamped to max_discount_pct of the cart —
// and the server clamps again, so a tampered client still cannot over-discount.
function DiscountModal({ visible, subtotal, maxPct, onCancel, onApply }) {
  const [mode, setMode] = useState('pct');
  const [val, setVal] = useState('');
  const cap = round2(subtotal * maxPct / 100);

  useEffect(() => { if (visible) { setVal(''); setMode('pct'); } }, [visible]);

  const parsed = Math.max(0, parseFloat(val) || 0);
  const amount = mode === 'pct' ? round2(subtotal * Math.min(parsed, maxPct) / 100) : Math.min(parsed, cap);
  const clamped = mode === 'pct' ? parsed > maxPct : parsed > cap;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{L.discount.en} / {L.discount.gu}</Text>
          <Text style={styles.modalSub}>Max {maxPct}% = ${cap.toFixed(2)}</Text>

          <View style={styles.modeRow}>
            <Pressable style={[styles.modeBtn, mode === 'pct' && styles.modeBtnOn]} onPress={() => setMode('pct')}>
              <Text style={[styles.modeTxt, mode === 'pct' && styles.modeTxtOn]}>%</Text>
            </Pressable>
            <Pressable style={[styles.modeBtn, mode === 'amt' && styles.modeBtnOn]} onPress={() => setMode('amt')}>
              <Text style={[styles.modeTxt, mode === 'amt' && styles.modeTxtOn]}>$</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.modalInput}
            value={val}
            onChangeText={setVal}
            keyboardType="numeric"
            placeholder={mode === 'pct' ? `0 – ${maxPct}` : `0 – ${cap.toFixed(2)}`}
            autoFocus
          />
          <Text style={styles.modalPreview}>
            −${amount.toFixed(2)}{clamped ? `  (capped at ${maxPct}%)` : ''}
          </Text>

          <View style={styles.modalBtns}>
            <Pressable style={styles.modalCancel} onPress={onCancel}>
              <Text style={styles.modalCancelTxt}>{L.cancel.en}</Text>
            </Pressable>
            <Pressable style={styles.modalOk} onPress={() => onApply(amount)}>
              <Text style={styles.modalOkTxt}>{L.done.en}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function friendlyError(msg) {
  if (/insufficient stock/i.test(msg)) return 'Not enough stock for one of these items. Check the quantity.';
  if (/unknown product/i.test(msg)) return 'An item is no longer in the catalog. Remove it and try again.';
  return String(msg);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  muted: { color: colors.textMuted, fontSize: 20 },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.sm },
  backBtn: { marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, backgroundColor: colors.primary, borderRadius: radius.md },
  backBtnTxt: { color: colors.white, fontWeight: '800', fontSize: 20 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.white, fontSize: 20, fontWeight: '700' },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },
  headerCount: { color: colors.white, fontSize: 20, fontWeight: '800' },

  line: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, ...shadow.card },
  sep: { height: spacing.sm },
  lineName: { fontSize: 20, fontWeight: '700', color: colors.text },
  lineUnit: { fontSize: 18, color: colors.textMuted, marginTop: 2 },
  qtyBox: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.sm },
  qBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  qBtnTxt: { fontSize: 22, fontWeight: '800', color: colors.primaryDark },
  qNum: { fontSize: 20, fontWeight: '800', minWidth: 34, textAlign: 'center', color: colors.text },
  lineTotal: { fontSize: 20, fontWeight: '800', color: colors.primary, minWidth: 72, textAlign: 'right' },

  footer: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, paddingBottom: spacing.lg },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { fontSize: 20, fontWeight: '700', color: colors.textMuted },
  totalValue: { fontSize: 34, fontWeight: '900', color: colors.text },
  strike: { fontSize: 19, color: colors.textLight, textDecorationLine: 'line-through' },
  discNote: { fontSize: 18, color: colors.accent, fontWeight: '700', textAlign: 'right' },

  discBtn: { marginTop: spacing.sm, alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  discBtnDisabled: { opacity: 0.4 },
  discBtnTxt: { fontSize: 18, fontWeight: '700', color: colors.textMuted },

  payGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  payBig: { flexGrow: 1, flexBasis: '47%', minHeight: 96, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md },
  payBigActive: { borderWidth: 4, borderColor: colors.text },
  payEmoji: { fontSize: 30 },
  payEn: { color: colors.white, fontSize: 20, fontWeight: '900', marginTop: 2 },
  payGu: { color: colors.white, fontSize: 18, fontWeight: '700', opacity: 0.95 },
  paySub: { color: colors.white, fontSize: 18, fontWeight: '800', marginTop: 2 },
  empHint: { marginTop: spacing.sm, fontSize: 18, fontWeight: '700', color: colors.gold, textAlign: 'center' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  modalCard: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  modalSub: { fontSize: 18, color: colors.textMuted, marginTop: 2 },
  modeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modeBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center' },
  modeBtnOn: { backgroundColor: colors.primary },
  modeTxt: { fontSize: 20, fontWeight: '900', color: colors.textMuted },
  modeTxtOn: { color: colors.white },
  modalInput: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 24, fontWeight: '800', marginTop: spacing.md, color: colors.text },
  modalPreview: { fontSize: 20, fontWeight: '800', color: colors.accent, marginTop: spacing.sm, textAlign: 'right' },
  modalBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modalCancel: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center' },
  modalCancelTxt: { fontSize: 20, fontWeight: '800', color: colors.textMuted },
  modalOk: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  modalOkTxt: { fontSize: 20, fontWeight: '800', color: colors.white },
});
