import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
  Modal, TextInput, Alert, RefreshControl, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow, HEALTH } from '../src/lib/theme';
import { api } from '../src/lib/api';
import ProductImage from '../src/components/ProductImage';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'reorder', label: '🔴 Reorder' },
  { key: 'low', label: '🟡 Low' },
];

export default function Stock() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [editProduct, setEditProduct] = useState(null); // product or 'new'
  const [search, setSearch] = useState('');
  // Deep-link: /stock?filter=reorder opens straight into the reorder list.
  const [filter, setFilter] = useState(params.filter === 'reorder' ? 'reorder' : 'all');
  const [quickEdit, setQuickEdit] = useState(null);   // product whose numbers are being typed

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

  const filtered = products.filter((p) => {
    if (filter === 'reorder' && p.health !== 'order') return false;
    if (filter === 'low' && p.health !== 'low') return false;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q);
  });

  const totalShop = products.reduce((s, p) => s + p.shop_qty, 0);
  const totalWh = products.reduce((s, p) => s + p.warehouse_qty, 0);
  const orderCount = products.filter((p) => p.health === 'order').length;

  // One-tap restock: move from warehouse to shop (or add if no warehouse stock).
  async function quickRestock(product, amount) {
    try {
      if (product.warehouse_qty >= amount) {
        await api.adjustStock(product.id, { kind: 'move', delta: amount, note: 'quick restock' });
      } else {
        await api.adjustStock(product.id, { kind: 'add', location: 'shop', delta: amount, note: 'quick add' });
      }
      load();
    } catch (e) {
      Alert.alert('Restock failed', String(e.message || e));
    }
  }

  /** Adjust one location by +1/-1 straight from the list.
   *
   *  The number on screen updates immediately so counting stock feels like
   *  counting, not like waiting for a server. If the write fails we put the old
   *  value back and say why — never leave a wrong number sitting there.
   */
  async function bump(product, location, delta) {
    const key = location === 'shop' ? 'shop_qty' : 'warehouse_qty';
    if (product[key] + delta < 0) return;          // never go negative
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, [key]: p[key] + delta } : p)),
    );
    try {
      await api.adjustStock(product.id, {
        kind: delta > 0 ? 'add' : 'remove',
        location,
        delta,
        note: 'stock list',
      });
    } catch (e) {
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, [key]: p[key] - delta } : p)),
      );
      Alert.alert('Could not update stock', String(e.message || e));
    }
  }

  function renderRow({ item }) {
    const health = HEALTH[item.health] || HEALTH.healthy;
    return (
      <View style={styles.rowWrap}>
        <Pressable style={styles.row} onPress={() => setEditProduct(item)}>
          <View style={[styles.rowAccent, { backgroundColor: health.color }]} />
          <View style={{ marginLeft: 4 }}><ProductImage product={item} size={40} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowName}>{item.name}</Text>
            <Text style={styles.rowCat}>
              {item.category ? `${item.category} · ` : ''}${item.price.toFixed(2)}
            </Text>
          </View>
        </Pressable>

        {/* Shop and WH are editable right here — Parth: "I can edit stock +-
            in shop and wh from the main screen of stocks". No drilling in. */}
        <View style={styles.counterRow}>
          <StockCounter
            label="Shop"
            value={item.shop_qty}
            onChange={(d) => bump(item, 'shop', d)}
            onTapNumber={() => setQuickEdit(item)}
          />
          <StockCounter
            label="WH"
            value={item.warehouse_qty}
            onChange={(d) => bump(item, 'warehouse', d)}
            onTapNumber={() => setQuickEdit(item)}
            muted
          />
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>Loading inventory…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Home</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Stock</Text>
        <Pressable onPress={() => setEditProduct('new')} hitSlop={12}>
          <Text style={styles.addNew}>＋ New</Text>
        </Pressable>
      </View>

      <View style={styles.stats}>
        <Stat label="Shop stock" value={totalShop} />
        <Stat label="Warehouse" value={totalWh} />
        <Stat label="Order ASAP" value={orderCount} accent={orderCount > 0 ? colors.order : colors.healthy} />
      </View>

      {/* Filter chips */}
      <View style={styles.chipRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipTxt, filter === f.key && styles.chipTxtActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search products…"
          placeholderTextColor={colors.textLight}
        />
      </View>

      {error && <View style={styles.errorBar}><Text style={styles.errorTxt}>⚠ {error}</Text></View>}

      <FlatList
        data={filtered}
        keyExtractor={(p) => String(p.id)}
        renderItem={renderRow}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>{filter === 'reorder' ? '✅' : '🔍'}</Text>
            <Text style={styles.muted}>{filter === 'reorder' ? 'Nothing needs reordering!' : 'No matching products'}</Text>
          </View>
        }
      />

      {quickEdit && (
        <QuickStockSheet
          product={quickEdit}
          onClose={() => setQuickEdit(null)}
          onSaved={() => { setQuickEdit(null); load(); }}
        />
      )}

      {editProduct && (
        <EditModal
          product={editProduct === 'new' ? null : editProduct}
          onClose={() => setEditProduct(null)}
          onSaved={() => { setEditProduct(null); load(); }}
        />
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, accent }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EditModal({ product, onClose, onSaved }) {
  const isNew = !product;
  const [name, setName] = useState(product?.name || '');
  const [category, setCategory] = useState(product?.category || '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [emoji, setEmoji] = useState(product?.emoji || '🍃');
  const [imageUrl, setImageUrl] = useState(product?.image_url || '');
  const [reorder, setReorder] = useState(product ? String(product.reorder_level) : '5');
  const [shopQty, setShopQty] = useState(isNew ? '0' : null);
  const [whQty, setWhQty] = useState(isNew ? '0' : null);
  const [busy, setBusy] = useState(false);

  const [adjShop, setAdjShop] = useState('');
  const [adjWh, setAdjWh] = useState('');
  const [moveQty, setMoveQty] = useState('');

  async function saveDetails() {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setBusy(true);
    try {
      if (isNew) {
        await api.createProduct({
          name: name.trim(), category, price: parseFloat(price) || 0, emoji,
          image_url: imageUrl.trim() || null,
          reorder_level: parseInt(reorder) || 5,
          shop_qty: parseInt(shopQty) || 0, warehouse_qty: parseInt(whQty) || 0,
        });
      } else {
        await api.updateProduct(product.id, {
          name: name.trim(), category, price: parseFloat(price) || 0, emoji,
          image_url: imageUrl.trim() || null,
          reorder_level: parseInt(reorder) || 5,
        });
      }
      onSaved();
    } catch (e) {
      Alert.alert('Save failed', String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function applyAdjust(location, value) {
    const delta = parseInt(value);
    if (!delta) return;
    setBusy(true);
    try {
      await api.adjustStock(product.id, { kind: delta > 0 ? 'add' : 'remove', location, delta, note: 'manual adjust' });
      onSaved();
    } catch (e) {
      Alert.alert('Adjust failed', String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function applyMove() {
    const n = parseInt(moveQty);
    if (!n) return;
    setBusy(true);
    try {
      await api.adjustStock(product.id, { kind: 'move', delta: n, note: 'warehouse->shop' });
      onSaved();
    } catch (e) {
      Alert.alert('Move failed', String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    Alert.alert('Remove product?', `${product.name} will be hidden from POS and stock.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try { await api.archiveProduct(product.id); onSaved(); }
          catch (e) { Alert.alert('Failed', String(e.message || e)); }
          finally { setBusy(false); }
        },
      },
    ]);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBg}>
        <View style={styles.editSheet}>
          <View style={styles.sheetHandle} />
          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetTitle}>{isNew ? 'New Product' : product.name}</Text>

            <Text style={styles.section}>Details</Text>
            <Field label="Name" value={name} onChangeText={setName} placeholder="Product name" />
            <View style={styles.fieldRow}>
              <View style={{ flex: 2 }}><Field label="Category" value={category} onChangeText={setCategory} placeholder="Paan" /></View>
              <View style={{ width: 80 }}><Field label="Emoji" value={emoji} onChangeText={setEmoji} placeholder="🍃" /></View>
            </View>
            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}><Field label="Price ($)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="3.00" /></View>
              <View style={{ flex: 1 }}><Field label="Reorder level" value={reorder} onChangeText={setReorder} keyboardType="number-pad" placeholder="5" /></View>
            </View>
            <Field label="Image URL (optional)" value={imageUrl} onChangeText={setImageUrl} placeholder="https://…" autoCapitalize="none" />

            {isNew && (
              <View style={styles.fieldRow}>
                <View style={{ flex: 1 }}><Field label="Shop qty" value={shopQty} onChangeText={setShopQty} keyboardType="number-pad" /></View>
                <View style={{ flex: 1 }}><Field label="Warehouse qty" value={whQty} onChangeText={setWhQty} keyboardType="number-pad" /></View>
              </View>
            )}

            <Pressable style={[styles.primaryBtn, busy && styles.disabled]} onPress={saveDetails} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryBtnTxt}>{isNew ? 'Create Product' : 'Save Details'}</Text>}
            </Pressable>

            {!isNew && (
              <>
                <Text style={styles.section}>Adjust Stock</Text>
                <View style={styles.currentStock}>
                  <Text style={styles.currentStockTxt}>Shop: <Text style={styles.bold}>{product.shop_qty}</Text></Text>
                  <Text style={styles.currentStockTxt}>Warehouse: <Text style={styles.bold}>{product.warehouse_qty}</Text></Text>
                </View>

                <AdjustRow label="Shop floor" value={adjShop} onChange={setAdjShop} onApply={() => { applyAdjust('shop', adjShop); setAdjShop(''); }} />
                <AdjustRow label="Warehouse" value={adjWh} onChange={setAdjWh} onApply={() => { applyAdjust('warehouse', adjWh); setAdjWh(''); }} />

                <Text style={styles.section}>Move Warehouse → Shop</Text>
                <View style={styles.moveRow}>
                  <TextInput style={styles.moveInput} value={moveQty} onChangeText={setMoveQty} keyboardType="number-pad" placeholder="Qty" placeholderTextColor={colors.textLight} />
                  <Pressable style={styles.moveBtn} onPress={() => { applyMove(); setMoveQty(''); }} disabled={busy}>
                    <Text style={styles.moveBtnTxt}>Move →</Text>
                  </Pressable>
                </View>

                <Pressable style={styles.archiveBtn} onPress={archive} disabled={busy}>
                  <Text style={styles.archiveTxt}>Remove product</Text>
                </Pressable>
              </>
            )}

            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeTxt}>Close</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.textLight} {...props} />
    </View>
  );
}

function AdjustRow({ label, value, onChange, onApply }) {
  return (
    <View style={styles.adjustRow}>
      <Text style={styles.adjustLabel}>{label}</Text>
      <TextInput style={styles.adjustInput} value={value} onChangeText={onChange} keyboardType="numbers-and-punctuation" placeholder="+/- qty" placeholderTextColor={colors.textLight} />
      <Pressable style={styles.adjustBtn} onPress={onApply}>
        <Text style={styles.adjustBtnTxt}>Apply</Text>
      </Pressable>
    </View>
  );
}

/** Label + [−] value [+] — the whole point is no extra screens or taps. */
function StockCounter({ label, value, onChange, onTapNumber, muted }) {
  return (
    <View style={[styles.counter, muted && styles.counterMuted]}>
      <Text style={styles.counterLabel}>{label}</Text>
      <Pressable
        style={[styles.counterBtn, value <= 0 && styles.counterBtnOff]}
        onPress={() => onChange(-1)}
        disabled={value <= 0}
        hitSlop={8}
      >
        <Text style={styles.counterBtnTxt}>−</Text>
      </Pressable>
      {/* Tap the number to type it. Getting to 100 by tapping + is not a
          thing anyone will do at a real counter. */}
      <Pressable onPress={onTapNumber} hitSlop={8}>
        <Text style={styles.counterVal}>{value}</Text>
      </Pressable>
      <Pressable style={styles.counterBtn} onPress={() => onChange(1)} hitSlop={8}>
        <Text style={styles.counterBtnTxt}>+</Text>
      </Pressable>
    </View>
  );
}

/** Type an exact count, or move stock warehouse -> shop, in one sheet. */
function QuickStockSheet({ product, onClose, onSaved }) {
  const [shop, setShop] = useState(String(product.shop_qty));
  const [wh, setWh] = useState(String(product.warehouse_qty));
  const [move, setMove] = useState('');
  const [busy, setBusy] = useState(false);

  const shopN = parseInt(shop, 10);
  const whN = parseInt(wh, 10);
  const moveN = parseInt(move, 10) || 0;
  const valid = Number.isFinite(shopN) && shopN >= 0 && Number.isFinite(whN) && whN >= 0;

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      // Set exact counts by sending the difference, so stock_moves still
      // records what changed rather than silently overwriting history.
      const dShop = shopN - product.shop_qty;
      const dWh = whN - product.warehouse_qty;
      if (dShop) {
        await api.adjustStock(product.id, {
          kind: dShop > 0 ? 'add' : 'remove', location: 'shop',
          delta: dShop, note: 'set count',
        });
      }
      if (dWh) {
        await api.adjustStock(product.id, {
          kind: dWh > 0 ? 'add' : 'remove', location: 'warehouse',
          delta: dWh, note: 'set count',
        });
      }
      if (moveN > 0) {
        await api.adjustStock(product.id, {
          kind: 'move', delta: moveN, note: 'warehouse->shop',
        });
      }
      onSaved();
    } catch (e) {
      Alert.alert('Could not save', String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.qsBg}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.qsSheet}>
          <Text style={styles.qsTitle}>{product.name}</Text>

          <View style={styles.qsRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.qsLabel}>Shop</Text>
              <TextInput
                style={styles.qsInput} value={shop} onChangeText={setShop}
                keyboardType="number-pad" selectTextOnFocus textAlign="center"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.qsLabel}>Warehouse</Text>
              <TextInput
                style={styles.qsInput} value={wh} onChangeText={setWh}
                keyboardType="number-pad" selectTextOnFocus textAlign="center"
              />
            </View>
          </View>

          <Text style={styles.qsLabel}>Move warehouse → shop</Text>
          <TextInput
            style={styles.qsInput} value={move} onChangeText={setMove}
            keyboardType="number-pad" placeholder="0"
            placeholderTextColor={colors.textLight} textAlign="center"
          />
          {moveN > 0 && (
            <Text style={styles.qsPreview}>
              Shop {shopN + moveN} · Warehouse {Math.max(0, whN - moveN)}
            </Text>
          )}

          <View style={styles.qsBtnRow}>
            <Pressable style={styles.qsCancel} onPress={onClose} disabled={busy}>
              <Text style={styles.qsCancelTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.qsSave, (!valid || busy) && { opacity: 0.5 }]}
              onPress={save}
              disabled={!valid || busy}
            >
              <Text style={styles.qsSaveTxt}>{busy ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  qsBg: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'center', padding: spacing.lg },
  qsSheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  qsTitle: { fontSize: 19, fontWeight: '900', color: colors.text, marginBottom: 4 },
  qsRow: { flexDirection: 'row', gap: spacing.md },
  qsLabel: { fontSize: 13, fontWeight: '800', color: colors.textMuted, marginTop: spacing.sm },
  qsInput: {
    borderWidth: 2, borderColor: colors.border, borderRadius: radius.md,
    paddingVertical: spacing.md, fontSize: 26, fontWeight: '900', color: colors.text,
  },
  qsPreview: { fontSize: 14, fontWeight: '700', color: colors.primary, textAlign: 'center', marginTop: 4 },
  qsBtnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  qsCancel: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center' },
  qsCancelTxt: { fontWeight: '700', color: colors.textMuted },
  qsSave: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  qsSaveTxt: { fontWeight: '800', color: colors.white },
  counterRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  counter: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primaryLight, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
  },
  counterMuted: { backgroundColor: colors.surfaceAlt },
  counterLabel: { fontSize: 12, fontWeight: '800', color: colors.textMuted, width: 34 },
  counterBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  counterBtnOff: { backgroundColor: colors.border },
  counterBtnTxt: { color: colors.white, fontSize: 22, fontWeight: '900', lineHeight: 24 },
  counterVal: { fontSize: 20, fontWeight: '900', color: colors.text, minWidth: 40, textAlign: 'center' },
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.bg },
  muted: { color: colors.textMuted, fontSize: 14 },
  bold: { fontWeight: '800', color: colors.text },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.gold, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.text, fontSize: 17, fontWeight: '600' },
  headerTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  addNew: { color: colors.text, fontSize: 16, fontWeight: '800' },

  stats: { flexDirection: 'row', backgroundColor: colors.surface, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  chipRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  chipTxtActive: { color: colors.white },

  searchWrap: { padding: spacing.md, paddingBottom: spacing.sm },
  search: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15, borderWidth: 1, borderColor: colors.border, color: colors.text },

  errorBar: { backgroundColor: '#FDECEA', padding: spacing.sm, paddingHorizontal: spacing.lg },
  errorTxt: { color: colors.order, fontSize: 13 },

  // No overflow:'hidden' — these rows expand/collapse, and the stale clipping
  // layer it creates paints blank (see audit-trail/blank-pos-card-2026-08-14.md).
  rowWrap: { backgroundColor: colors.surface, borderRadius: radius.md, ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  rowAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  rowEmoji: { fontSize: 28, marginLeft: 4 },
  rowName: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowCat: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowStocks: { flexDirection: 'row', gap: spacing.xs },
  stockChip: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, alignItems: 'center', minWidth: 48 },
  stockChipWh: { backgroundColor: colors.surfaceAlt },
  stockChipLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '700' },
  stockChipVal: { fontSize: 17, fontWeight: '800', color: colors.text },

  quickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md, paddingLeft: spacing.lg },
  quickHint: { fontSize: 12, color: colors.textMuted, flex: 1 },
  quickBtn: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: colors.primary },
  quickBtnTxt: { color: colors.primary, fontWeight: '800', fontSize: 14 },

  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: spacing.md },
  emptyEmoji: { fontSize: 48 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  editSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '92%' },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: spacing.md },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  section: { fontSize: 13, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  fieldRow: { flexDirection: 'row', gap: spacing.md },
  fieldLabel: { fontSize: 13, color: colors.textMuted, marginBottom: 4, fontWeight: '600' },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },

  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  primaryBtnTxt: { color: colors.white, fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.5 },

  currentStock: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  currentStockTxt: { fontSize: 15, color: colors.text },

  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  adjustLabel: { width: 90, fontSize: 14, color: colors.text, fontWeight: '600' },
  adjustInput: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  adjustBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  adjustBtnTxt: { color: colors.white, fontWeight: '700' },

  moveRow: { flexDirection: 'row', gap: spacing.sm },
  moveInput: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  moveBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  moveBtnTxt: { color: colors.white, fontWeight: '800' },

  archiveBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.lg },
  archiveTxt: { color: colors.order, fontWeight: '700', fontSize: 15 },
  closeBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  closeTxt: { color: colors.textMuted, fontSize: 16, fontWeight: '600' },
});
