// API client for the KC Paan inventory backend.
// Base URL comes from app.json -> expo.extra.apiUrl, and can be overridden
// at runtime via the in-app Settings (stored in AsyncStorage).
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_URL =
  Constants.expoConfig?.extra?.apiUrl ||
  Constants.manifest?.extra?.apiUrl ||
  'http://localhost:5005';

let baseUrlOverride = null;

export async function loadBaseUrl() {
  try {
    const v = await AsyncStorage.getItem('kc_api_url');
    if (v) baseUrlOverride = v;
  } catch (e) {}
  return getBaseUrl();
}

export function getBaseUrl() {
  return baseUrlOverride || DEFAULT_URL;
}

export async function setBaseUrl(url) {
  baseUrlOverride = url.replace(/\/+$/, '');
  try {
    await AsyncStorage.setItem('kc_api_url', baseUrlOverride);
  } catch (e) {}
}

async function req(path, options = {}) {
  const url = getBaseUrl() + path;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} — ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  health: () => req('/api/health'),
  listProducts: () => req('/api/products'),
  createProduct: (data) =>
    req('/api/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id, data) =>
    req(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  archiveProduct: (id) => req(`/api/products/${id}`, { method: 'DELETE' }),
  adjustStock: (id, data) =>
    req(`/api/products/${id}/stock`, { method: 'POST', body: JSON.stringify(data) }),
  createSale: (data) =>
    req('/api/sales', { method: 'POST', body: JSON.stringify(data) }),
  listSales: (params = '') => req(`/api/sales${params}`),
  getSale: (id) => req(`/api/sales/${id}`),
  voidSale: (id) => req(`/api/sales/${id}/void`, { method: 'POST' }),
  reports: (params = '') => req(`/api/reports${params}`),
  salesSummary: () => req('/api/sales/summary'),
  dashboard: () => req('/api/dashboard'),
  verifyPin: (pin) =>
    req('/api/verify-pin', { method: 'POST', body: JSON.stringify({ pin }) }),
};
