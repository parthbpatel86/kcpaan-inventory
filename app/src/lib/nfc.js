// NFC tag reading for the time clock.
//
// Parth: "make sure NFC can help login/logout in any screen by simply scanning
// it." So this is an AMBIENT reader, not a modal one — the listener runs for as
// long as the app is in the foreground, and any tap anywhere punches the
// employee that tag belongs to.
//
// We only ever read the tag's UID, which is burned in at the factory and cannot
// be changed. Nothing is written to the tag, so a blank NTAG215 straight out of
// the bag works and no bad write can brick one.
import NfcManager, { NfcEvents } from 'react-native-nfc-manager';

let startedOnce = false;

/** Uppercase hex, no separators — must match the server's _norm_uid(). */
export function normUid(raw) {
  return String(raw || '').toUpperCase().replace(/[^0-9A-F]/g, '');
}

/**
 * Whether this device can read tags at all, and whether NFC is switched on.
 * A tablet with no NFC radio is a normal, expected outcome — never a crash.
 */
export async function nfcStatus() {
  try {
    const supported = await NfcManager.isSupported();
    if (!supported) return { supported: false, enabled: false };
    if (!startedOnce) {
      await NfcManager.start();
      startedOnce = true;
    }
    const enabled = await NfcManager.isEnabled();
    return { supported: true, enabled };
  } catch (e) {
    return { supported: false, enabled: false, error: String(e?.message || e) };
  }
}

/** Start ambient reading. onUid(uid) fires on every tap. */
export async function startListening(onUid) {
  const { supported, enabled } = await nfcStatus();
  if (!supported || !enabled) return false;
  try {
    NfcManager.setEventListener(NfcEvents.DiscoverTag, (tag) => {
      const uid = normUid(tag?.id);
      if (uid) onUid(uid);
    });
    await NfcManager.registerTagEvent();
    return true;
  } catch (e) {
    return false;
  }
}

export async function stopListening() {
  try {
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    await NfcManager.unregisterTagEvent();
  } catch (e) { /* already torn down */ }
}

/** Open Android's NFC settings so the owner can switch the radio on. */
export function openNfcSettings() {
  try { NfcManager.goToNfcSetting(); } catch (e) { /* not available */ }
}
