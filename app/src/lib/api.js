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

  // Settings (employee %, discount cap, punch hours) — DB-driven so Parth can
  // change them without shipping a new APK.
  settings: () => req('/api/settings'),
  updateSettings: (data) =>
    req('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // Employees + timesheets
  listEmployees: () => req('/api/employees'),
  createEmployee: (data) =>
    req('/api/employees', { method: 'POST', body: JSON.stringify(data) }),
  updateEmployee: (id, data) =>
    req(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  // intent 'out' lets the server record a MISSING_IN row when someone clocks
  // out but never clocked in, instead of silently starting a new shift.
  // employeeId identifies WHO is punching; the PIN then proves it is them.
  // Sending both means a shared PIN can never clock in the wrong person.
  punch: (pin, intent, employeeId) =>
    req('/api/punch', {
      method: 'POST',
      body: JSON.stringify({ pin, intent, employee_id: employeeId }),
    }),
  // Face embeddings for every enrolled employee, for matching ON THE DEVICE.
  // Vectors only — no photograph ever leaves the phone.
  employeeFaces: () => req('/api/employees/faces'),
  // Punch after an on-device face match. The server records method='face' only
  // when employee_id is sent WITHOUT a pin, so pin is deliberately omitted.
  punchByFace: (employeeId, intent) =>
    req('/api/punch', {
      method: 'POST',
      body: JSON.stringify({ employee_id: employeeId, intent }),
    }),
  // Punch by NFC tag. The UID alone identifies the employee, so no name and no
  // PIN are sent; the server toggles IN/OUT from the open shift.
  punchByNfc: (uid) =>
    req('/api/punch', {
      method: 'POST',
      body: JSON.stringify({ nfc_uid: uid }),
    }),
  timesheet: (params = '') => req(`/api/timesheet${params}`),
  updatePunch: (id, data) =>
    req(`/api/punches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  punchAudit: (params = '') => req(`/api/punch-audit${params}`),

  // Closing shift
  shiftSummary: (params = '') => req(`/api/shift/summary${params}`),
  closeShift: (data) =>
    req('/api/shift/close', { method: 'POST', body: JSON.stringify(data) }),
  shiftCloses: (params = '') => req(`/api/shift/closes${params}`),
};
