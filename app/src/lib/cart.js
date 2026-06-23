// Simple cart context for the POS screen.
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  // items: { [productId]: { product, qty } }
  const [items, setItems] = useState({});

  const addItem = useCallback((product) => {
    setItems((prev) => {
      const existing = prev[product.id];
      return {
        ...prev,
        [product.id]: { product, qty: (existing?.qty || 0) + 1 },
      };
    });
  }, []);

  const decItem = useCallback((productId) => {
    setItems((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;
      if (existing.qty <= 1) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: { ...existing, qty: existing.qty - 1 } };
    });
  }, []);

  const removeItem = useCallback((productId) => {
    setItems((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, []);

  const clear = useCallback(() => setItems({}), []);

  const list = useMemo(() => Object.values(items), [items]);
  const count = useMemo(() => list.reduce((s, i) => s + i.qty, 0), [list]);
  const total = useMemo(
    () => list.reduce((s, i) => s + i.qty * i.product.price, 0),
    [list]
  );

  const value = { items, list, count, total, addItem, decItem, removeItem, clear };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
