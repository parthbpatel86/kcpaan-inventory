// Shop Sales (POS) — the screen staff live in all day.
//
// Design rules (Parth): big photos so items are picked by sight rather than by
// reading; a search box because scrolling 50 products at a queue is slow; and
// checkout moved to a full confirm screen (app/confirm.js) so the order is
// reviewed against the counter before money changes hands.
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
  RefreshControl, ScrollView, TextInput, useWindowDimensions, Keyboard, AppState,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadow, HEALTH } from '../src/lib/theme';
import { api } from '../src/lib/api';
import NfcHeaderButton from '../src/components/NfcHeaderButton';
import { useCart } from '../src/lib/cart';
import ProductImage from '../src/components/ProductImage';
import { syncPending, pendingCount, pendingQtyByProduct } from '../src/lib/offline';
import { L } from '../src/lib/labels';

export default function POS() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cart = useCart();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [pending, setPending] = useState(0);
  const [offline, setOffline] = useState(false);

  const wideEnough = width >= 700;
  const numColumns = wideEnough ? 3 : 2;

  const load = useCallback(async () => {
    try {
      const data = await api.listProducts();
      const synced = await syncPending();
      const fresh = synced > 0 ? await api.listProducts() : data;

      // Subtract un-synced offline sales so the grid can't show stock that has
      // already been sold during an outage.
      const pendingQty = await pendingQtyByProduct();
      const adjusted = fresh.map((p) =>
        pendingQty[p.id] ? { ...p, shop_qty: Math.max(0, p.shop_qty - pendingQty[p.id]) } : p
      );

      setProducts(adjusted);
      cart.syncCatalog(adjusted);
      setOffline(false);
      setPending(await pendingCount());
    } catch (e) {
      setOffline(true);
      setPending(await pendingCount());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cart]);

  useEffect(() => { load(); }, []);

  // Parth: "when I edit quantity in my app, it wasnt updating in shop app."
  // The till sits on this screen all day, so nothing ever re-fetched: a stock
  // correction made on the manager's phone stayed invisible here until someone
  // pulled to refresh. Poll while this screen is focused and the app is in the
  // foreground. A ref keeps the interval from being torn down and recreated
  // every time the cart changes.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useFocusEffect(
    useCallback(() => {
      loadRef.current();
      const id = setInterval(() => {
        if (AppState.currentState === 'active') loadRef.current();
      }, 30000);
      return () => clearInterval(id);
    }, [])
  );

  // Parth: "when we try to search for an item in the shop sales, the currently
  // selected total and 'review order' bar is hidden behind the keyboard."
  // The bar is absolutely positioned at bottom:0, and this app runs
  // edge-to-edge, where Android's windowSoftInputMode=adjustResize no longer
  // lifts content. So track the keyboard and lift the bar ourselves.
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow',
      (e) => setKb(e.endCoordinates?.height || 0));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // True best sellers (units sold), not just the first six alphabetically.
  const favorites = useMemo(
    () => products.filter((p) => p.popularity > 0).slice(0, 6),
    [products]
  );

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [products]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== 'All' && p.category !== category) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || String(p.price).includes(q);
    });
  }, [products, category, query]);

  function renderCard({ item }) {
    const health = HEALTH[item.health] || HEALTH.healthy;
    const inCart = cart.items[item.id]?.qty || 0;
    const out = item.shop_qty <= 0;
    return (
      <View style={[styles.card, { borderLeftColor: health.color }, inCart > 0 && styles.cardActive, out && styles.cardOut]}>
        <Pressable
          style={styles.cardTapZone}
          onPress={() => !out && cart.addItem(item)}
          onLongPress={() => cart.removeItem(item.id)}
          delayLongPress={350}
          disabled={out}
        >
          <View style={styles.cardTop}>
            <ProductImage product={item} size={96} />
            <View style={[styles.healthDot, { backgroundColor: health.color }]} />
          </View>
          <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.cardPrice}>${item.price.toFixed(2)}</Text>
          <Text style={[styles.cardStock, out && styles.cardStockOut]}>
            {out ? `${L.outOfStock.en} / ${L.outOfStock.gu}` : `${item.shop_qty} left`}
          </Text>
        </Pressable>
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
          // The strip that says "+ Tap" has to BE a button. It sits outside the
          // card's tap zone, so as a plain View it was the one part of the card
          // that looked tappable and wasn't — the worst possible target for
          // staff who read the "+" rather than the English.
          <Pressable
            style={styles.cardAddHint}
            onPress={() => !out && cart.addItem(item)}
            disabled={out}
          >
            <Text style={styles.cardAddHintTxt}>{out ? '—' : '+ Tap'}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Shop Sales</Text>
        <NfcHeaderButton />
        <Pressable onPress={() => router.push('/history')} hitSlop={12}><Text style={styles.headerIcon}>🧾</Text></Pressable>
      </View>

      {(offline || pending > 0) && (
        <View style={styles.offlineBar}>
          <Text style={styles.offlineTxt}>
            {offline ? '📴 Offline — sales saved on this device' : `🔄 ${pending} waiting to sync`}
          </Text>
        </View>
      )}

      {/* Search — the single biggest speed win on a 50-item catalog */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={`${L.search.en} / ${L.search.gu}`}
          placeholderTextColor={colors.textLight}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={10}><Text style={styles.searchClear}>✕</Text></Pressable>
        )}
      </View>

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
            contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 150 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTxt}>No match for “{query}”</Text>
              </View>
            }
            ListHeaderComponent={
              <View>
                {favorites.length > 0 && category === 'All' && !query && (
                  <View style={styles.quickSection}>
                    <Text style={styles.quickTitle}>⭐ Best Sellers</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                      {favorites.map((item) => {
                        const inCart = cart.items[item.id]?.qty || 0;
                        const out = item.shop_qty <= 0;
                        return (
                          <Pressable
                            key={item.id}
                            style={[styles.fav, inCart > 0 && styles.favActive, out && { opacity: 0.4 }]}
                            onPress={() => !out && cart.addItem(item)}
                            onLongPress={() => cart.removeItem(item.id)}
                            delayLongPress={350}
                            disabled={out}
                          >
                            <ProductImage product={item} size={64} />
                            <Text style={styles.favName} numberOfLines={1}>{item.name}</Text>
                            <Text style={styles.favPrice}>${item.price.toFixed(2)}</Text>
                            {inCart > 0 && <View style={styles.favBadge}><Text style={styles.favBadgeTxt}>{inCart}</Text></View>}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {categories.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                    {categories.map((c) => (
                      <Pressable key={c} style={[styles.catChip, category === c && styles.catChipActive]} onPress={() => setCategory(c)}>
                        <Text style={[styles.catTxt, category === c && styles.catTxtActive]}>{c}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
            }
          />
        </View>
      </View>

      {/* Cart bar → full confirm screen */}
      {cart.count > 0 && (
        <View style={[styles.cartBar, kb > 0 && { bottom: kb }]}>
          <View>
            <Text style={styles.cartCount}>{cart.count} {L.items.en}</Text>
            <Text style={styles.cartTotal}>${cart.total.toFixed(2)}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable style={styles.clearBtn} onPress={() => cart.clear()}>
              <Text style={styles.clearTxt}>✕</Text>
            </Pressable>
            <Pressable style={styles.reviewBtn} onPress={() => router.push('/confirm')}>
              <Text style={styles.reviewTxt}>{L.review.en} ›</Text>
              <Text style={styles.reviewGu}>{L.review.gu}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.white, fontSize: 30, fontWeight: '700' },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },
  headerIcon: { fontSize: 22 },

  offlineBar: { backgroundColor: colors.gold, paddingVertical: 6, alignItems: 'center' },
  offlineTxt: { color: colors.text, fontWeight: '700', fontSize: 18 },

  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, margin: spacing.md, marginBottom: 0, borderRadius: radius.md, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border },
  searchIcon: { fontSize: 20 },
  searchInput: { flex: 1, fontSize: 20, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, color: colors.text },
  searchClear: { fontSize: 20, color: colors.textMuted, paddingHorizontal: spacing.sm },

  body: { flex: 1, flexDirection: 'row' },
  gridWrap: { flex: 1 },

  quickSection: { marginBottom: spacing.md },
  quickTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  fav: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center', width: 108, borderWidth: 2, borderColor: colors.gold },
  favActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  favName: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 4 },
  favPrice: { fontSize: 19, fontWeight: '800', color: colors.primary },
  favBadge: { position: 'absolute', top: -6, right: -6, backgroundColor: colors.accent, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  favBadgeTxt: { color: colors.white, fontWeight: '800', fontSize: 18 },

  catRow: { gap: spacing.sm, paddingBottom: spacing.md },
  catChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.xl, backgroundColor: colors.surfaceAlt },
  catChipActive: { backgroundColor: colors.primary },
  catTxt: { fontWeight: '700', color: colors.textMuted },
  catTxtActive: { color: colors.white },

  // No overflow:'hidden' here — it left a stale clipping layer and the card
  // painted blank after checkout (see audit-trail/blank-pos-card-2026-08-14.md).
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderLeftWidth: 6, minHeight: 200, ...shadow.card },
  cardActive: { borderColor: colors.primary, borderWidth: 1, borderLeftWidth: 6 },
  cardOut: { opacity: 0.55 },
  cardTapZone: { padding: spacing.md, flex: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  healthDot: { width: 16, height: 16, borderRadius: 8 },
  cardName: { fontSize: 19, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  cardPrice: { fontSize: 20, fontWeight: '900', color: colors.primary, marginTop: 2 },
  cardStock: { fontSize: 18, fontWeight: '700', color: colors.textMuted, marginTop: 2 },
  cardStockOut: { color: colors.order },
  cardQtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primaryLight, paddingHorizontal: spacing.sm, paddingVertical: 8 },
  qtyBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  qtyBtnTxt: { color: colors.white, fontSize: 22, fontWeight: '900' },
  qtyNum: { fontSize: 20, fontWeight: '900', color: colors.text },
  cardAddHint: { backgroundColor: colors.surfaceAlt, paddingVertical: 8, alignItems: 'center' },
  cardAddHintTxt: { fontSize: 18, color: colors.textMuted, fontWeight: '800' },

  emptyWrap: { padding: spacing.xl, alignItems: 'center' },
  emptyTxt: { color: colors.textMuted, fontSize: 20 },

  cartBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.primaryDark, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.lg },
  cartCount: { color: colors.white, fontSize: 18, fontWeight: '700', opacity: 0.9 },
  cartTotal: { color: colors.white, fontSize: 28, fontWeight: '900' },
  clearBtn: { paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.15)' },
  clearTxt: { color: colors.white, fontSize: 20, fontWeight: '800' },
  reviewBtn: { backgroundColor: colors.gold, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  reviewTxt: { color: colors.text, fontSize: 20, fontWeight: '900' },
  reviewGu: { color: colors.text, fontSize: 18, fontWeight: '700' },
});
