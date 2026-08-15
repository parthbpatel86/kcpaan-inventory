// Offline sale queue. If a sale POST fails (no internet), we store it locally
// and retry on the next successful product load or manual sync.
//
// Two correctness rules live here:
//  1. Every sale carries a client_ref. The server returns the ORIGINAL sale for
//     a repeated ref, so a retry after a timeout cannot charge twice.
//  2. Queued sales also record their line quantities so the POS can show stock
//     that already accounts for un-synced sales — otherwise staff keep seeing
//     the pre-outage quantity and can oversell an item that is really at zero.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

const KEY = 'kc_pending_sales';

async function getQueue() {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v ? JSON.parse(v) : [];
  } catch (e) {
    return [];
  }
}

async function setQueue(q) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(q));
  } catch (e) {}
}

export async function pendingCount() {
  return (await getQueue()).length;
}

// Units per product sitting in un-synced sales, so the UI can subtract them.
export async function pendingQtyByProduct() {
  const q = await getQueue();
  const out = {};
  for (const sale of q) {
    for (const it of sale.items || []) {
      out[it.product_id] = (out[it.product_id] || 0) + Number(it.qty || 0);
    }
  }
  return out;
}

// A stable per-sale key. Date.now + random is enough to be unique per device,
// and the server enforces uniqueness anyway.
export function newClientRef() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Try to create a sale; if the network fails, queue it and report queued=true.
export async function createSaleResilient(saleData) {
  const withRef = { client_ref: saleData.client_ref || newClientRef(), ...saleData };
  try {
    const res = await api.createSale(withRef);
    return { ok: true, queued: false, result: res };
  } catch (e) {
    const msg = String(e.message || e);
    // 4xx/409 are real rejections from the server (e.g. insufficient stock) —
    // queueing them would just replay a sale the server already refused.
    if (/^4\d\d/.test(msg)) {
      return { ok: false, queued: false, rejected: true, error: msg };
    }
    const q = await getQueue();
    q.push({ ...withRef, _queuedAt: new Date().toISOString() });
    await setQueue(q);
    return { ok: true, queued: true, error: msg };
  }
}

// Flush queued sales to the server. Returns number synced.
export async function syncPending() {
  let q = await getQueue();
  if (q.length === 0) return 0;
  let synced = 0;
  const remaining = [];
  for (const sale of q) {
    try {
      const { _queuedAt, ...data } = sale;
      await api.createSale(data);
      synced += 1;
    } catch (e) {
      const msg = String(e.message || e);
      // Permanently rejected (bad stock, unknown product): drop it rather than
      // retrying forever. It stays visible in the server's sale history if it
      // did land; a 4xx means it did not.
      if (/^4\d\d/.test(msg)) continue;
      remaining.push(sale); // network problem — keep for next attempt
    }
  }
  await setQueue(remaining);
  return synced;
}
