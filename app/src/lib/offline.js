// Offline sale queue. If a sale POST fails (no internet), we store it locally
// and retry on the next successful product load or manual sync.
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

// Try to create a sale; if the network fails, queue it and report queued=true.
export async function createSaleResilient(saleData) {
  try {
    const res = await api.createSale(saleData);
    return { ok: true, queued: false, result: res };
  } catch (e) {
    // Network/connection error → queue it.
    const q = await getQueue();
    q.push({ ...saleData, _queuedAt: new Date().toISOString() });
    await setQueue(q);
    return { ok: true, queued: true, error: String(e.message || e) };
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
      remaining.push(sale); // keep for next attempt
    }
  }
  await setQueue(remaining);
  return synced;
}
