// Ambient NFC clock-in, available on every screen.
//
// Parth: "make sure NFC can help login/logout in any screen by simply scanning
// it ... And give a disappearing popup saying you are logged in/out."
//
// The listener lives here, at the root, so a tap works wherever the till
// happens to be — mid-sale, on the home screen, anywhere. Screens do not need
// to know NFC exists.
import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { View, Text, StyleSheet, Animated, AppState, Pressable } from 'react-native';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { api } from '../lib/api';
import { startListening, stopListening, nfcStatus, openNfcSettings } from '../lib/nfc';
import NfcTapButton from './NfcTapButton';

const NfcCtx = createContext({
  supported: false, enabled: false, hint: () => {},
  captureTag: () => Promise.reject(new Error('no nfc')), cancelCapture: () => {}, notify: () => {},
});
export const useNfc = () => useContext(NfcCtx);

// Android re-fires DiscoverTag while a tag sits on the antenna. Without this a
// single tap would punch IN then straight back OUT.
const REPEAT_LOCKOUT_MS = 6000;

export function NfcProvider({ children }) {
  const [status, setStatus] = useState({ supported: false, enabled: false });
  const [toast, setToast] = useState(null);   // {kind, title, sub}
  const lastTag = useRef({ uid: '', at: 0 });
  const busy = useRef(false);
  // While a manager is registering a tag, the next read must go to enrolment
  // rather than clocking somebody in.
  const capture = useRef(null);

  const show = useCallback((kind, title, sub) => {
    setToast({ kind, title, sub, key: `${Date.now()}` });
  }, []);

  const onUid = useCallback(async (uid, tag) => {
    const now = Date.now();
    // A tag arrived but carried no readable ID. Say so out loud — the old code
    // dropped it silently, which looked identical to "nothing happened".
    if (!uid) {
      show('error', 'Tag read failed',
        `Detected a tag but could not read its ID${tag?.techTypes ? ` (${String(tag.techTypes).slice(0, 40)})` : ''}.`);
      return;
    }
    if (capture.current) {
      const { resolve } = capture.current;
      capture.current = null;
      resolve(uid);
      return;
    }
    if (busy.current) return;
    if (uid === lastTag.current.uid && now - lastTag.current.at < REPEAT_LOCKOUT_MS) return;
    lastTag.current = { uid, at: now };
    busy.current = true;
    try {
      const res = await api.punchByNfc(uid);
      const isIn = res.action === 'in';
      show(
        isIn ? 'in' : 'out',
        `${res.employee} — ${isIn ? 'CLOCKED IN' : 'CLOCKED OUT'}`,
        res.warning || (isIn ? 'અંદર · Have a good shift' : 'બહાર · See you tomorrow'),
      );
    } catch (e) {
      const msg = String(e?.message || e);
      show(
        'error',
        /404/.test(msg) ? 'Tag not registered' : 'Could not clock in',
        /404/.test(msg) ? 'Ask the manager to register this tag.' : msg,
      );
    } finally {
      busy.current = false;
    }
  }, [show]);

  // Arm on mount and whenever the app comes back to the foreground. Android
  // drops foreground dispatch when the app is backgrounded, so re-arming on
  // resume is required or the reader silently stops working after a phone call.
  useEffect(() => {
    let alive = true;
    const arm = async () => {
      const s = await nfcStatus();
      if (!alive) return;
      setStatus(s);
      if (s.supported && s.enabled) await startListening(onUid);
    };
    arm();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') arm();
      else stopListening();
    });
    return () => { alive = false; sub.remove(); stopListening(); };
  }, [onUid]);

  const hint = useCallback(() => {
    if (!status.supported) {
      show('error', 'No NFC on this device', 'Use the PIN on the Time Clock screen.');
    } else if (!status.enabled) {
      show('error', 'NFC is switched off', 'Tap here to open NFC settings.');
    } else {
      show('info', 'Hold your tag to the phone', 'Touch it to the BACK of the phone.');
    }
  }, [status, show]);

  // Grab the next tag instead of punching with it. Used by Settings when a
  // manager assigns a tag to a member of staff.
  const captureTag = useCallback(() => new Promise((resolve, reject) => {
    capture.current = { resolve, reject };
  }), []);
  const cancelCapture = useCallback(() => {
    if (capture.current) {
      capture.current.reject(new Error('cancelled'));
      capture.current = null;
    }
  }, []);

  return (
    <NfcCtx.Provider value={{ ...status, hint, captureTag, cancelCapture, notify: show }}>
      {children}
      <NfcTapButton />
      <PunchToast toast={toast} onDone={() => setToast(null)} onPress={
        status.supported && !status.enabled ? openNfcSettings : undefined
      } />
    </NfcCtx.Provider>
  );
}

// The disappearing popup. Deliberately large and high-contrast: the person
// reading it is often several feet away and not wearing glasses.
function PunchToast({ toast, onDone, onPress }) {
  const slide = useRef(new Animated.Value(-260)).current;

  useEffect(() => {
    if (!toast) return undefined;
    let cancelled = false;
    slide.setValue(-260);
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    const t = setTimeout(() => {
      Animated.timing(slide, {
        toValue: -260, duration: 260, useNativeDriver: true,
      }).start(() => { if (!cancelled) onDone(); });
    }, 2800);
    return () => { cancelled = true; clearTimeout(t); };
  }, [toast?.key]);

  if (!toast) return null;
  const bg = toast.kind === 'in' ? colors.healthy
    : toast.kind === 'out' ? colors.accent
    : toast.kind === 'error' ? colors.order
    : colors.primaryDark;
  const emoji = toast.kind === 'in' ? '👋'
    : toast.kind === 'out' ? '🏁'
    : toast.kind === 'error' ? '⚠️' : '📶';

  return (
    <Animated.View
      style={[styles.toast, { backgroundColor: bg, transform: [{ translateY: slide }] }]}
      pointerEvents={onPress ? 'auto' : 'none'}
    >
      <Pressable onPress={onPress} disabled={!onPress} style={styles.toastInner}>
        <Text style={styles.toastEmoji}>{emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.toastTitle} numberOfLines={2}>{toast.title}</Text>
          {!!toast.sub && <Text style={styles.toastSub} numberOfLines={2}>{toast.sub}</Text>}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: spacing.xl + spacing.lg, paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg,
    ...shadow.card,
  },
  toastInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  toastEmoji: { fontSize: 44 },
  toastTitle: { color: colors.white, fontSize: 24, fontWeight: '900' },
  toastSub: { color: '#ffffffdd', fontSize: 19, fontWeight: '700', marginTop: 2 },
});
