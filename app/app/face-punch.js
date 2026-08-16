// Employee-facing: punch in/out by face.
//
// The whole match runs on the device. A photo is taken, turned into numbers,
// compared against the vectors downloaded from the server, and thrown away.
//
// SAFETY RULE: this screen never silently punches anyone. It picks the most
// likely person and shows a big IN / OUT button to confirm. That is deliberate
// — the on-device signature is verification-grade, not identification-grade
// (see FACE_SCAN.md), and punching the wrong person in is worse than one tap.
// "Use PIN" is always one tap away.
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { api } from '../src/lib/api';
import { L } from '../src/lib/labels';
import { embed, decide } from '../src/lib/face';

export default function FacePunch() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [faces, setFaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null); // { verdict, match, scored }
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    api.employeeFaces()
      .then((f) => { if (mounted.current) setFaces(Array.isArray(f) ? f : []); })
      .catch(() => {})
      .finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, []);

  async function scan() {
    if (scanning || !cameraRef.current) return;
    setScanning(true);
    setResult(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: true });
      const v = await embed(photo);
      if (!v) {
        Alert.alert('Could not read the face', 'Use the PIN instead.');
        return;
      }
      const d = decide(v, faces);
      if (mounted.current) setResult(d);
    } catch (e) {
      Alert.alert('Camera problem', String(e.message || e));
    } finally {
      if (mounted.current) setScanning(false);
    }
  }

  async function punch(employeeId, intent, who) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.punchByFace(employeeId, intent);
      const verb = res.action === 'in' ? 'Punched IN' : 'Punched OUT';
      Alert.alert(`${verb} — ${res.employee || who}`, res.warning ? `⚠️ ${res.warning}` : timeNow(), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Could not punch', `${String(e.message || e)}\n\nUse your PIN instead.`);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const noneEnrolled = !loading && faces.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>{L.scanFace.en} / {L.scanFace.gu}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : !permission ? (
          <ActivityIndicator color={colors.primary} />
        ) : !permission.granted ? (
          <View style={styles.centre}>
            <Text style={styles.big}>📷</Text>
            <Pressable style={styles.primaryBtn} onPress={requestPermission}>
              <Text style={styles.primaryBtnText}>Allow camera</Text>
            </Pressable>
            <Pressable style={styles.pinLink} onPress={() => router.back()}>
              <Text style={styles.pinLinkText}>{L.usePin.en} / {L.usePin.gu}</Text>
            </Pressable>
          </View>
        ) : noneEnrolled ? (
          <View style={styles.centre}>
            <Text style={styles.big}>😀</Text>
            <Text style={styles.help}>
              No faces saved yet. A manager adds them in Settings → Staff → Face.
            </Text>
            <Pressable style={styles.pinLink} onPress={() => router.back()}>
              <Text style={styles.pinLinkText}>{L.usePin.en} / {L.usePin.gu}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.cameraWrap}>
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
              <View style={styles.oval} pointerEvents="none" />
            </View>

            {!result ? (
              <>
                <Text style={styles.prompt}>{L.lookAtCamera.en}</Text>
                <Text style={styles.promptGu}>{L.lookAtCamera.gu}</Text>
                <Pressable
                  style={[styles.scanBtn, scanning && { opacity: 0.5 }]}
                  onPress={scan}
                  disabled={scanning}
                >
                  <Text style={styles.scanEmoji}>{scanning ? '…' : '😀'}</Text>
                  <Text style={styles.scanText}>{L.scanFace.en}</Text>
                  <Text style={styles.scanTextGu}>{L.scanFace.gu}</Text>
                </Pressable>
              </>
            ) : result.verdict === 'unknown' ? (
              <>
                <Text style={styles.prompt}>Not recognised</Text>
                <Text style={styles.help}>Try again in better light, or use your PIN.</Text>
                <Pressable style={styles.retryBtn} onPress={() => setResult(null)}>
                  <Text style={styles.retryText}>{L.tryAgain.en} / {L.tryAgain.gu}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.matchName}>{result.match.name}</Text>
                <Text style={styles.help}>
                  {result.verdict === 'confident' ? 'Tap IN or OUT' : 'Is this you? Tap IN or OUT'}
                </Text>
                <View style={styles.btnRow}>
                  <Pressable
                    style={[styles.bigBtn, { backgroundColor: colors.healthy }, busy && { opacity: 0.5 }]}
                    onPress={() => punch(result.match.id, 'in', result.match.name)}
                    disabled={busy}
                  >
                    <Text style={styles.bigEmoji}>🟢</Text>
                    <Text style={styles.bigEn}>{L.punchIn.en}</Text>
                    <Text style={styles.bigGu}>{L.punchIn.gu}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.bigBtn, { backgroundColor: colors.accent }, busy && { opacity: 0.5 }]}
                    onPress={() => punch(result.match.id, 'out', result.match.name)}
                    disabled={busy}
                  >
                    <Text style={styles.bigEmoji}>🔴</Text>
                    <Text style={styles.bigEn}>{L.punchOut.en}</Text>
                    <Text style={styles.bigGu}>{L.punchOut.gu}</Text>
                  </Pressable>
                </View>
                <Pressable style={styles.retryBtn} onPress={() => setResult(null)}>
                  <Text style={styles.retryText}>{L.notYou.en} / {L.notYou.gu}</Text>
                </Pressable>
              </>
            )}

            {busy && <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />}

            <Pressable style={styles.pinLink} onPress={() => router.back()}>
              <Text style={styles.pinLinkText}>{L.usePin.en} / {L.usePin.gu}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function timeNow() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.white, fontSize: 30, fontWeight: '700' },
  headerTitle: { color: colors.white, fontSize: 18, fontWeight: '800' },

  centre: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },
  big: { fontSize: 56, marginBottom: spacing.md },
  help: { fontSize: 14, fontWeight: '600', color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },

  cameraWrap: { height: 300, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', ...shadow.card },
  oval: { position: 'absolute', alignSelf: 'center', top: 20, width: 190, height: 250, borderRadius: 125, borderWidth: 4, borderColor: colors.white, opacity: 0.7 },

  prompt: { fontSize: 20, fontWeight: '900', color: colors.text, textAlign: 'center', marginTop: spacing.lg },
  promptGu: { fontSize: 16, fontWeight: '700', color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },

  scanBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.sm, ...shadow.card },
  scanEmoji: { fontSize: 36 },
  scanText: { color: colors.white, fontSize: 20, fontWeight: '900' },
  scanTextGu: { color: colors.white, fontSize: 15, fontWeight: '700' },

  matchName: { fontSize: 30, fontWeight: '900', color: colors.text, textAlign: 'center', marginTop: spacing.lg },

  btnRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  bigBtn: { flex: 1, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, ...shadow.card },
  bigEmoji: { fontSize: 40 },
  bigEn: { color: colors.white, fontSize: 24, fontWeight: '900', marginTop: 4 },
  bigGu: { color: colors.white, fontSize: 16, fontWeight: '700' },

  retryBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  retryText: { color: colors.primary, fontSize: 16, fontWeight: '800' },

  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  primaryBtnText: { color: colors.white, fontSize: 17, fontWeight: '900' },

  pinLink: { alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.sm },
  pinLinkText: { color: colors.textMuted, fontSize: 17, fontWeight: '800', textDecorationLine: 'underline' },
});
