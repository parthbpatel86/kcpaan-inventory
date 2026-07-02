// PIN verification: server (DB) is the authority. On every successful online
// verify we cache the SHA-256 hash of the PIN, so when the server is
// unreachable we can still verify offline against the cached hash — the plain
// PIN is never stored on the device or in source code.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { api } from './api';

const HASH_KEY = 'kc_pin_hash';

async function sha256(s) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);
}

// Returns { ok, offline, noCache }.
//   ok      — PIN accepted
//   offline — server unreachable, cached-hash fallback was used
//   noCache — server unreachable AND no cached hash yet (must unlock online once)
export async function verifyPin(pin) {
  try {
    const res = await api.verifyPin(pin);
    if (res.ok && res.pin_hash) await AsyncStorage.setItem(HASH_KEY, res.pin_hash);
    return { ok: !!res.ok, offline: false };
  } catch (e) {
    const cached = await AsyncStorage.getItem(HASH_KEY);
    if (!cached) return { ok: false, offline: true, noCache: true };
    const hash = await sha256(String(pin));
    return { ok: hash === cached, offline: true };
  }
}
