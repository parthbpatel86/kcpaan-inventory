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
import NfcManager, { NfcEvents, NfcAdapter } from 'react-native-nfc-manager';

let startedOnce = false;

/** Uppercase hex, no separators — must match the server's _norm_uid(). */
export function normUid(raw) {
  return String(raw || '').toUpperCase().replace(/[^0-9A-F]/g, '');
}

/**
 * A tag's UID, whichever shape the platform hands it over in.
 *
 * Android usually gives tag.id as a hex string, but on some devices/versions it
 * arrives as a byte array. Treating an array with String() would produce
 * "4,170,187" and silently yield a wrong UID, so handle it explicitly.
 */
export function uidFromTag(tag) {
  const raw = tag?.id;
  if (Array.isArray(raw)) {
    return raw.map((b) => (b & 0xff).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return normUid(raw);
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
      onUid(uidFromTag(tag), tag);
    });
    // Reader Mode, NOT foreground dispatch.
    //
    // The library defaults to foreground dispatch, which routes the tag through
    // Android's NDEF discovery pipeline. A tag with no NDEF payload — which is
    // exactly what a blank NTAG215 is — makes Android buzz and keep the tag
    // instead of handing it to us: the tap is felt but never arrives.
    // Reader Mode takes over the stack while we are in the foreground and
    // delivers every tag directly.
    await NfcManager.registerTagEvent({
      isReaderModeEnabled: true,
      readerModeFlags:
        NfcAdapter.FLAG_READER_NFC_A |
        NfcAdapter.FLAG_READER_NFC_B |
        NfcAdapter.FLAG_READER_NFC_F |
        NfcAdapter.FLAG_READER_NFC_V |
        // Do not try to parse NDEF: we only want the UID, and the parse step is
        // what loses blank tags.
        NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK |
        NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS,
      readerModeDelay: 250,
    });
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
