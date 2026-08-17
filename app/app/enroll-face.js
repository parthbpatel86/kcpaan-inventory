// Manager-only: register one employee's face.
//
// Parth: "make sure we also have a way to register a good couple of photos for
// face to match." Five guided poses, one at a time, each checked before it is
// accepted. A bad enrolment is the main cause of bad recognition later, so this
// screen refuses blurry, turned-away or eyes-closed shots instead of storing
// them and failing at 7am.
//
// PRIVACY: the photo is turned into a short list of proportions and then
// discarded. No image is stored or uploaded.
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { api } from '../src/lib/api';
import { embedFromPhoto, reasonText, cosine } from '../src/lib/face';

// Five poses. Slight variety makes the stored template cover how someone
// actually stands at the clock, instead of one frozen instant.
const POSES = [
  { key: 'straight', en: 'Look straight at the camera', gu: 'સીધું જુઓ', emoji: '😐' },
  { key: 'smile',    en: 'Now smile',                   gu: 'સ્મિત કરો',  emoji: '🙂' },
  { key: 'left',     en: 'Turn your head slightly left', gu: 'ડાબે ફેરવો', emoji: '👈' },
  { key: 'right',    en: 'Now slightly right',           gu: 'જમણે ફેરવો', emoji: '👉' },
  { key: 'close',    en: 'Hold the phone a bit closer',  gu: 'નજીક લાવો',  emoji: '🔍' },
];

export default function EnrollFace() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams();
  const [permission, requestPermission] = useCameraPermissions();
  const [vectors, setVectors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState('');
  const cameraRef = useRef(null);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission]);

  const step = vectors.length;              // which pose we are on
  const done = step >= POSES.length;
  const pose = POSES[Math.min(step, POSES.length - 1)];

  async function capture() {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    setHint('');
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7, skipProcessing: true,
      });
      const { vector, error } = await embedFromPhoto(photo.uri);
      if (!alive.current) return;
      if (error) {
        setHint(reasonText(error));
        return;
      }
      // Guard against accidentally enrolling two different people: every shot
      // must resemble the first one. Without this, a second person wandering
      // into frame would be silently added to someone's template.
      if (vectors.length > 0) {
        const s = cosine(vector, vectors[0]);
        if (s < 0.80) {
          setHint('That does not look like the same person — try again.');
          return;
        }
      }
      setVectors((prev) => [...prev, vector]);
    } catch (e) {
      setHint(String(e.message || e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function save() {
    if (vectors.length === 0 || saving) return;
    setSaving(true);
    try {
      await api.updateEmployee(id, { face_data: JSON.stringify(vectors) });
      Alert.alert(
        'Face registered',
        `${name} can now clock in by looking at the camera.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e) {
      Alert.alert('Could not save', String(e.message || e));
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  if (!permission) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.primary} /></SafeAreaView>;
  }
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.bigEmoji}>📷</Text>
        <Text style={styles.msg}>The camera is needed to register a face.</Text>
        <Pressable style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnTxt}>Allow camera</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>{name}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={styles.camera} facing="front" />
        <View style={styles.oval} pointerEvents="none" />
      </View>

      {/* Progress dots — five shots, one per pose */}
      <View style={styles.dots}>
        {POSES.map((p, i) => (
          <View key={p.key} style={[styles.dot, i < vectors.length && styles.dotOn]} />
        ))}
      </View>

      <View style={styles.bottom}>
        {done ? (
          <>
            <Text style={styles.poseEn}>✅ All five photos taken</Text>
            <Text style={styles.poseGu}>બધા ફોટા થઈ ગયા</Text>
          </>
        ) : (
          <>
            <Text style={styles.poseEmoji}>{pose.emoji}</Text>
            <Text style={styles.poseEn}>{step + 1}. {pose.en}</Text>
            <Text style={styles.poseGu}>{pose.gu}</Text>
          </>
        )}
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}

        <View style={styles.btnRow}>
          {!done && (
            <Pressable
              style={[styles.shootBtn, busy && { opacity: 0.5 }]}
              onPress={capture}
              disabled={busy}
            >
              <Text style={styles.shootTxt}>
                {busy ? 'Reading…' : `Take photo ${step + 1} of ${POSES.length}`}
              </Text>
            </Pressable>
          )}
          {vectors.length > 0 && (
            <Pressable style={styles.undoBtn} onPress={() => setVectors((v) => v.slice(0, -1))}>
              <Text style={styles.undoTxt}>Undo</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          style={[styles.saveBtn, (vectors.length < POSES.length || saving) && { opacity: 0.45 }]}
          onPress={save}
          disabled={vectors.length < POSES.length || saving}
        >
          <Text style={styles.saveTxt}>{saving ? 'Saving…' : 'Save face'}</Text>
        </Pressable>
        <Text style={styles.privacy}>
          Only measurements are saved — no photo is stored or sent anywhere.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primaryDark, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  back: { color: colors.white, fontSize: 30, fontWeight: '700' },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },

  cameraWrap: { flex: 1, margin: spacing.lg, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#000' },
  camera: { flex: 1 },
  oval: {
    position: 'absolute', top: '10%', left: '14%', right: '14%', bottom: '10%',
    borderWidth: 4, borderColor: '#ffffff88', borderRadius: 999,
  },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.healthy },

  bottom: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, alignItems: 'center', gap: 4 },
  poseEmoji: { fontSize: 34 },
  poseEn: { fontSize: 20, fontWeight: '900', color: colors.text, textAlign: 'center' },
  poseGu: { fontSize: 20, fontWeight: '700', color: colors.textMuted },
  hint: { fontSize: 18, color: colors.order, fontWeight: '700', textAlign: 'center', marginTop: 4 },

  btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignSelf: 'stretch' },
  shootBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: 'center', ...shadow.card },
  shootTxt: { color: colors.white, fontSize: 20, fontWeight: '900' },
  undoBtn: { paddingHorizontal: spacing.lg, justifyContent: 'center', borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  undoTxt: { color: colors.textMuted, fontWeight: '800' },

  saveBtn: { alignSelf: 'stretch', backgroundColor: colors.healthy, borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: 'center', marginTop: spacing.sm },
  saveTxt: { color: colors.white, fontSize: 20, fontWeight: '900' },
  privacy: { fontSize: 18, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },

  bigEmoji: { fontSize: 54 },
  msg: { fontSize: 20, color: colors.text, textAlign: 'center' },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl },
  primaryBtnTxt: { color: colors.white, fontSize: 20, fontWeight: '900' },
});
