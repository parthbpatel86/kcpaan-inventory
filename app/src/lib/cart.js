// Cart for the POS screen.
//
// The cart stores product IDs and quantities only — never a snapshot of the
// product. Prices are resolved from the live product list at render time, so
// a price edited mid-shift can't ring up at the stale price the card was
// added at. (The server re-prices from the DB regardless; this keeps what the
// customer is shown consistent with what is actually charged.)
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  // qtys: { [productId]: qty }
  const [qtys, setQtys] = useState({});
  // The catalog the POS screen last loaded, so the cart can resolve prices.
  const [catalog, setCatalog] = useState({});

  const syncCatalog = useCallback((products) => {
    const map = {};
    for (const p of products || []) map[p.id] = p;
    setCatalog(map);
  }, []);

  const addItem = useCallback((product) => {
    setQtys((prev) => ({ ...prev, [product.id]: (prev[product.id] || 0) + 1 }));
    setCatalog((prev) => ({ ...prev, [product.id]: product }));
  }, []);

  const decItem = useCallback((productId) => {
    setQtys((prev) => {
      const q = prev[productId] || 0;
      if (q <= 1) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: q - 1 };
    });
  }, []);

  const removeItem = useCallback((productId) => {
    setQtys((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, []);

  const clear = useCallback(() => setQtys({}), []);

  // Resolved lines: always the CURRENT product record for each id.
  const list = useMemo(
    () =>
      Object.entries(qtys)
        .map(([id, qty]) => ({ product: catalog[id] || catalog[Number(id)], qty }))
        .filter((l) => l.product),
    [qtys, catalog]
  );

  const count = useMemo(() => list.reduce((s, i) => s + i.qty, 0), [list]);
  const total = useMemo(
    () => list.reduce((s, i) => s + i.qty * (i.product.price || 0), 0),
    [list]
  );

  // Kept for call sites that check `cart.items[id]?.qty`.
  const items = useMemo(() => {
    const o = {};
    for (const l of list) o[l.product.id] = { product: l.product, qty: l.qty };
    return o;
  }, [list]);

  const value = { items, qtys, list, count, total, addItem, decItem, removeItem, clear, syncCatalog };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
