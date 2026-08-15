// Final review + payment screen.
//
// Parth's spec: show a photo, name and quantity for every line before the sale
// completes, then BIG payment buttons (CASH / CARD / SHOP / EMPLOYEE 8%) plus a
// smaller discount toggle capped at 10% of the cart.
//
// Design notes for non-English staff: every button carries an emoji, a colour
// and a Gujarati word, and each line shows the product PHOTO — so the order can
// be checked without reading English.
import { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { L } from '../lib/labels';
import ProductImage from './ProductImage';

export default function ReviewSheet({
  visible, lines, subtotal, discount, employeePct, maxPct,
  submitting, onClose, onPay, onSetDiscount, onInc, onDec,
}) {
  const [discountOpen, setDiscountOpen] = useState(false);
  const [mode, setMode] = useState('pct');   // 'pct' | 'amt'
  const [entry, setEntry] = useState('');

  const cap = Math.round(subtotal * (maxPct / 100) * 100) / 100;
  const total = Math.max(0, subtotal - discount);

  function applyDiscount() {
    const n = parseFloat(entry);
    if (!isFinite(n) || n <= 0) return;
    const amt = mode === 'pct'
      ? Math.round(subtotal * Math.min(n, maxPct) / 100 * 100) / 100
      : Math.min(n, cap);
    onSetDiscount(Math.min(amt, cap));
    setDiscountOpen(false);
    setEntry('');
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={14} style={styles.headerBack}>
            <Text style={styles.headerBackTxt}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{L.review.en}</Text>
          <Text style={styles.headerSub}>{L.review.gu}</Text>
        </View>

        {/* Line items: photo + name + qty */}
        <ScrollView style={styles.list} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
          {lines.map((li) => (
            <View key={li.product.id} style={styles.line}>
              <ProductImage product={li.product} size={72} />
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName} numberOfLines={2}>{li.product.name}</Text>
                <Text style={styles.linePrice}>${li.product.price.toFixed(2)}</Text>
              </View>
              <View style={styles.qtyBox}>
                <Pressable style={styles.qtyBtn} onPress={() => onDec(li.product.id)} hitSlop={8}>
                  <Text style={styles.qtyBtnTxt}>–</Text>
                </Pressable>
                <Text style={styles.qtyNum}>{li.qty}</Text>
                <Pressable style={styles.qtyBtn} onPress={() => onInc(li.product)} hitSlop={8}>
                  <Text style={styles.qtyBtnTxt}>+</Text>
                </Pressable>
              </View>
              <Text style={styles.lineTotal}>${(li.qty * li.product.price).toFixed(2)}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Totals + discount toggle */}
        <View style={styles.totals}>
          {discount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.discTxt}>{L.discount.en} {L.discount.gu}</Text>
              <Text style={styles.discAmt}>−${discount.toFixed(2)}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{L.total.en} {L.total.gu}</Text>
            <Text style={styles.totalAmt}>${total.toFixed(2)}</Text>
          </View>

          <Pressable
            style={[styles.discBtn, discount > 0 && styles.discBtnOn]}
            onPress={() => (discount > 0 ? onSetDiscount(0) : setDiscountOpen(true))}
            disabled={submitting}
          >
            <Text style={styles.discBtnTxt}>
              {discount > 0 ? `✕  ${L.discount.en} ${L.discount.gu}` : `🏷️  + ${L.discount.en} ${L.discount.gu} (max ${maxPct}%)`}
            </Text>
          </Pressable>
        </View>

        {/* BIG payment buttons */}
        <View style={styles.payGrid}>
          <PayButton bg={colors.cash} emoji="💵" l={L.cash} onPress={() => onPay('cash')} disabled={submitting} />
          <PayButton bg={colors.card} emoji="💳" l={L.card} onPress={() => onPay('card')} disabled={submitting} />
          <PayButton bg={colors.instore} emoji="🏪" l={L.shop} onPress={() => onPay('shop')} disabled={submitting} />
          <PayButton
            bg={colors.employee} emoji="👤" l={L.employee}
            badge={`−${employeePct}%`}
            onPress={() => onPay('employee')} disabled={submitting}
          />
        </View>

        {submitting && (
          <View style={styles.submitting}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {/* Discount entry */}
        <Modal visible={discountOpen} transparent animationType="fade" onRequestClose={() => setDiscountOpen(false)}>
          <View style={styles.modalBg}>
            <View style={styles.discSheet}>
              <Text style={styles.discTitle}>{L.discount.en} / {L.discount.gu}</Text>
              <Text style={styles.discHint}>Max {maxPct}% = ${cap.toFixed(2)}</Text>
              <View style={styles.modeRow}>
                <Pressable style={[styles.modeBtn, mode === 'pct' && styles.modeOn]} onPress={() => setMode('pct')}>
                  <Text style={[styles.modeTxt, mode === 'pct' && styles.modeTxtOn]}>%</Text>
                </Pressable>
                <Pressable style={[styles.modeBtn, mode === 'amt' && styles.modeOn]} onPress={() => setMode('amt')}>
                  <Text style={[styles.modeTxt, mode === 'amt' && styles.modeTxtOn]}>$</Text>
                </Pressable>
              </View>
              <TextInput
                style={styles.discInput}
                keyboardType="numeric"
                value={entry}
                onChangeText={setEntry}
                placeholder={mode === 'pct' ? `0 – ${maxPct}` : `0 – ${cap.toFixed(2)}`}
                autoFocus
              />
              <View style={styles.discActions}>
                <Pressable style={styles.discCancel} onPress={() => setDiscountOpen(false)}>
                  <Text style={styles.discCancelTxt}>{L.cancel.en} {L.cancel.gu}</Text>
                </Pressable>
                <Pressable style={styles.discApply} onPress={applyDiscount}>
                  <Text style={styles.discApplyTxt}>{L.done.en} {L.done.gu}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

function PayButton({ bg, emoji, l, badge, onPress, disabled }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.payBtn, { backgroundColor: bg }, pressed && styles.payPressed]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.payEmoji}>{emoji}</Text>
      <Text style={styles.payEn}>{l.en}</Text>
      <Text style={styles.payGu}>{l.gu}</Text>
      {badge ? <View style={styles.payBadge}><Text style={styles.payBadgeTxt}>{badge}</Text></View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.primary, paddingTop: 48, paddingBottom: spacing.md,
    paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  headerBack: { paddingRight: spacing.sm },
  headerBackTxt: { color: '#fff', fontSize: 34, fontWeight: '800', lineHeight: 36 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  headerSub: { color: '#cfe9de', fontSize: 18, fontWeight: '700' },

  list: { flex: 1 },
  line: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.md, padding: spacing.sm, ...shadow.card,
  },
  lineName: { fontSize: 17, fontWeight: '700', color: colors.text },
  linePrice: { fontSize: 14, color: colors.textLight, marginTop: 2 },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qtyBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnTxt: { color: '#fff', fontSize: 26, fontWeight: '800', lineHeight: 28 },
  qtyNum: { fontSize: 22, fontWeight: '800', minWidth: 34, textAlign: 'center', color: colors.text },
  lineTotal: { fontSize: 18, fontWeight: '800', color: colors.primary, minWidth: 74, textAlign: 'right' },

  totals: {
    backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 20, fontWeight: '700', color: colors.text },
  totalAmt: { fontSize: 34, fontWeight: '900', color: colors.primary },
  discTxt: { fontSize: 15, color: colors.danger, fontWeight: '700' },
  discAmt: { fontSize: 17, color: colors.danger, fontWeight: '800' },
  discBtn: {
    borderWidth: 2, borderColor: colors.border, borderRadius: radius.md,
    paddingVertical: 12, alignItems: 'center',
  },
  discBtnOn: { borderColor: colors.danger, backgroundColor: '#fdecec' },
  discBtnTxt: { fontSize: 15, fontWeight: '700', color: colors.text },

  payGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    padding: spacing.md, paddingBottom: spacing.xl,
  },
  payBtn: {
    flexGrow: 1, flexBasis: '46%', minHeight: 104, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center', ...shadow.card,
  },
  payPressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  payEmoji: { fontSize: 34 },
  payEn: { color: '#fff', fontSize: 19, fontWeight: '900', marginTop: 2 },
  payGu: { color: '#ffffffdd', fontSize: 16, fontWeight: '700' },
  payBadge: {
    position: 'absolute', top: 8, right: 10, backgroundColor: '#00000033',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  payBadgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },

  submitting: { ...StyleSheet.absoluteFillObject, backgroundColor: '#ffffffcc', alignItems: 'center', justifyContent: 'center' },

  modalBg: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: spacing.xl },
  discSheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  discTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  discHint: { fontSize: 14, color: colors.textLight },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeBtn: {
    flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 2,
    borderColor: colors.border, alignItems: 'center',
  },
  modeOn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  modeTxt: { fontSize: 22, fontWeight: '800', color: colors.textLight },
  modeTxtOn: { color: colors.primary },
  discInput: {
    borderWidth: 2, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: 26, fontWeight: '800', textAlign: 'center', color: colors.text,
  },
  discActions: { flexDirection: 'row', gap: spacing.sm },
  discCancel: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center' },
  discCancelTxt: { fontSize: 16, fontWeight: '700', color: colors.textLight },
  discApply: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  discApplyTxt: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
