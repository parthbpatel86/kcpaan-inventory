// Face clock-in. Walk up, look at the phone, done.
//
// Parth: "When clicking on the scan face, it should automatically start
// scanning after hitting the scan face and do 3 retry if it fails." — so this
// screen starts scanning the moment it opens, retries by itself, and never
// asks which button to press. The server decides IN vs OUT from whether the
// person already has an open shift.
//
// If three attempts cannot identify someone confidently, it falls back to the
// PIN screen rather than guessing. Putting the wrong person's hours on the
// payroll is worse than asking for four digits.
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { api } from '../src/lib/api';
import { L } from '../src/lib/labels';
import {
  embedFromPhoto, identify, reasonText, MAX_DISTANCE, MIN_SEPARATION,
} from '../src/lib/face';

const MAX_TRIES = 3;

export default function FacePunch() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [enrolled, setEnrolled] = useState(null);
  const [status, setStatus] = useState('starting');  // starting|scanning|done|failed
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const cameraRef = useRef(null);
  const alive = useRef(true);
  const running = useRef(false);

  useEffect(() => () => { alive.current = false; }, []);

  // Ask for the camera the moment we arrive — one less tap.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  useEffect(() => {
    api.employeeFaces()
      .then((rows) => setEnrolled(Array.isArray(rows) ? rows : []))
      .catch(() => setEnrolled([]));
  }, []);

  const punch = useCallback(async (person) => {
    try {
      // No intent: the server toggles based on whether a shift is open, so
      // staff never choose between IN and OUT.
      const res = await api.punch(null, undefined, person.id);
      setResult({
        action: res.action,
        name: res.employee || person.name,
        warning: res.warning,
      });
      setStatus('done');
    } catch (e) {
      setMessage(String(e.message || e));
      setStatus('failed');
    }
  }, []);

  const scanOnce = useCallback(async () => {
    if (!cameraRef.current) return { ok: false, why: 'Camera not ready' };
    let photo;
    try {
      photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        skipProcessing: true,
      });
    } catch (e) {
      return { ok: false, why: 'Camera error' };
    }
    const { vector, error } = await embedFromPhoto(photo.uri);
    if (error) return { ok: false, why: reasonText(error) };

    const r = identify(vector, enrolled || []);
    if (r.needsReenrol) {
      return {
        ok: false,
        why: 'Saved faces are from an older version — re-register in Manager → Settings.',
      };
    }
    if (!r.match) return { ok: false, why: 'Nobody is enrolled yet' };
    if (!r.confident) {
      // Two different failures, and the difference matters to whoever is
      // standing there: "I do not know you" vs "you look too much like
      // someone else to be sure".
      const tooClose = r.distance <= MAX_DISTANCE && r.separation < MIN_SEPARATION;
      return {
        ok: false,
        why: tooClose
          ? `Too close a match between ${r.match.name} and ${r.runnerUp?.name || 'someone else'}`
          : 'Face not recognised',
      };
    }
    return { ok: true, person: r.match };
  }, [enrolled]);

  // Auto-run: scan up to MAX_TRIES times without the employee pressing anything.
  useEffect(() => {
    if (!permission?.granted || enrolled === null || running.current) return;
    if (status !== 'starting' && status !== 'scanning') return;

    running.current = true;
    (async () => {
      for (let i = 1; i <= MAX_TRIES; i++) {
        if (!alive.current) return;
        setAttempt(i);
        setStatus('scanning');
        setMessage(i === 1 ? '' : `Try ${i} of ${MAX_TRIES}…`);
        // Give the camera a moment to settle and the person to look up.
        await new Promise((r) => setTimeout(r, i === 1 ? 900 : 700));
        if (!alive.current) return;

        const out = await scanOnce();
        if (!alive.current) return;
        if (out.ok) {
          await punch(out.person);
          running.current = false;
          return;
        }
        setMessage(out.why);
      }
      setStatus('failed');
      running.current = false;
    })();
  }, [permission?.granted, enrolled, scanOnce, punch]);

  function retry() {
    running.current = false;
    setAttempt(0);
    setMessage('');
    setStatus('starting');
  }

  // --- permission states -------------------------------------------------
  if (!permission) {
    return <Center><ActivityIndicator color={colors.primary} /></Center>;
  }
  if (!permission.granted) {
    return (
      <Center>
        <Text style={styles.bigEmoji}>📷</Text>
        <Text style={styles.msg}>The camera is needed to scan a face.</Text>
        <Pressable style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnTxt}>Allow camera</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={() => router.replace('/punch')}>
          <Text style={styles.linkTxt}>{L.usePin.en} · {L.usePin.gu}</Text>
        </Pressable>
      </Center>
    );
  }

  // --- success -----------------------------------------------------------
  if (status === 'done' && result) {
    const isIn = result.action === 'in';
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: isIn ? colors.healthy : colors.instore }]}>
        <View style={styles.doneWrap}>
          <Text style={styles.doneEmoji}>{isIn ? '👋' : '🏁'}</Text>
          <Text style={styles.doneName}>{result.name}</Text>
          <Text style={styles.doneAction}>
            {isIn ? `${L.punchIn.en} · ${L.punchIn.gu}` : `${L.punchOut.en} · ${L.punchOut.gu}`}
          </Text>
          <Text style={styles.doneTime}>
            {new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
          {result.warning ? <Text style={styles.doneWarn}>⚠️ {result.warning}</Text> : null}
          <Pressable style={styles.doneBtn} onPress={() => router.replace('/')}>
            <Text style={styles.doneBtnTxt}>{L.done.en} · {L.done.gu}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // --- scanning / failed --------------------------------------------------
  const failed = status === 'failed';
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{L.scanFace.en}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={styles.camera} facing="front" />
        <View style={styles.oval} pointerEvents="none" />
      </View>

      <View style={styles.statusWrap}>
        {!failed ? (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.lookTxt}>{L.lookAtCamera.en}</Text>
            <Text style={styles.lookGu}>{L.lookAtCamera.gu}</Text>
            {attempt > 1 && <Text style={styles.tryTxt}>{message}</Text>}
          </>
        ) : (
          <>
            <Text style={styles.failEmoji}>😕</Text>
            <Text style={styles.failTxt}>{message || 'Could not recognise the face.'}</Text>
            <View style={styles.btnRow}>
              <Pressable style={styles.retryBtn} onPress={retry}>
                <Text style={styles.retryTxt}>{L.tryAgain.en} · {L.tryAgain.gu}</Text>
              </Pressable>
              <Pressable style={styles.pinBtn} onPress={() => router.replace('/punch')}>
                <Text style={styles.pinTxt}>{L.usePin.en} · {L.usePin.gu}</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function Center({ children }) {
  return <SafeAreaView style={styles.center}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  back: { color: colors.white, fontSize: 30, fontWeight: '700' },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },

  cameraWrap: { flex: 1, margin: spacing.lg, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#000' },
  camera: { flex: 1 },
  oval: {
    position: 'absolute', top: '12%', left: '15%', right: '15%', bottom: '12%',
    borderWidth: 4, borderColor: '#ffffff88', borderRadius: 999,
  },

  statusWrap: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: 6 },
  lookTxt: { fontSize: 22, fontWeight: '900', color: colors.text, marginTop: spacing.sm },
  lookGu: { fontSize: 18, fontWeight: '700', color: colors.textMuted },
  tryTxt: { fontSize: 14, color: colors.textMuted, marginTop: 4, textAlign: 'center' },

  failEmoji: { fontSize: 54 },
  failTxt: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  btnRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  retryBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: 'center', ...shadow.card },
  retryTxt: { color: colors.white, fontSize: 16, fontWeight: '900' },
  pinBtn: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: 'center' },
  pinTxt: { color: colors.textMuted, fontSize: 16, fontWeight: '800' },

  bigEmoji: { fontSize: 54 },
  msg: { fontSize: 17, color: colors.text, textAlign: 'center' },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl },
  primaryBtnTxt: { color: colors.white, fontSize: 17, fontWeight: '900' },
  linkBtn: { paddingVertical: spacing.md },
  linkTxt: { color: colors.textMuted, fontSize: 16, fontWeight: '700' },

  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 4 },
  doneEmoji: { fontSize: 78 },
  doneName: { fontSize: 34, fontWeight: '900', color: colors.white },
  doneAction: { fontSize: 22, fontWeight: '800', color: '#ffffffdd' },
  doneTime: { fontSize: 20, color: '#ffffffcc', marginTop: 4 },
  doneWarn: {
    fontSize: 14, color: colors.white, backgroundColor: '#00000033',
    padding: spacing.sm, borderRadius: radius.md, marginTop: spacing.md, textAlign: 'center',
  },
  doneBtn: {
    marginTop: spacing.xl, backgroundColor: '#ffffff', borderRadius: radius.lg,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.xl * 2,
  },
  doneBtnTxt: { fontSize: 18, fontWeight: '900', color: colors.text },
});
