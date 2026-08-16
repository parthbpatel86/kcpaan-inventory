// Manager-only: enrol one employee's face.
//
// Takes several photos, turns each into a numeric vector on the device, and
// PUTs only those vectors to the server. THE PHOTOS ARE DISCARDED — nothing but
// numbers ever leaves the phone. See FACE_SCAN.md.
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, radius, spacing, shadow } from '../src/lib/theme';
import { api } from '../src/lib/api';
import { L } from '../src/lib/labels';
import { embed, EMBEDDING_SIZE } from '../src/lib/face';

// Several shots beat one: the employee shifts slightly between each, so the
// stored template covers a range of poses instead of a single frozen instant.
const SHOTS = 5;

export default function EnrollFace() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams();
  const [permission, requestPermission] = useCameraPermissions();
  const [vectors, setVectors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef(null);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  async function capture() {
    if (busy || saving || !cameraRef.current) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: true });
      const v = await embed(photo);
      if (!v || v.length !== EMBEDDING_SIZE) {
        Alert.alert('Could not read that one', 'Try again with more light on the face.');
      } else if (mounted.current) {
        setVectors((prev) => [...prev, v]);
      }
    } catch (e) {
      Alert.alert('Camera problem', String(e.message || e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function save() {
    if (vectors.length === 0 || saving) return;
    setSaving(true);
    try {
      // Keep every shot rather than averaging them into one: at match time we
      // take the best of the set, so a person enrolled with and without glasses
      // still matches. The server stores this as a JSON string.
      await api.updateEmployee(id, { face_data: JSON.stringify(vectors) });
      Alert.alert('Face saved', `${name} can now punch in by face.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Could not save', String(e.message || e));
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  function clearFace() {
    Alert.alert(`Remove ${name}'s face?`, 'They will go back to using their PIN only.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.updateEmployee(id, { face_data: null });
            setVectors([]);
            Alert.alert('Removed', `${name}'s face data is deleted.`);
          } catch (e) {
            Alert.alert('Could not remove', String(e.message || e));
          }
        },
      },
    ]);
  }

  const done = vectors.length >= SHOTS;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>{name || 'Enrol face'}</Text>
        <View style={{ width: 24 }} />
      </View>

      {!permission ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : !permission.granted ? (
        <View style={styles.centre}>
          <Text style={styles.big}>📷</Text>
          <Text style={styles.help}>The camera is needed to enrol a face.</Text>
          <Pressable style={styles.primaryBtn} onPress={requestPermission}>
            <Text style={styles.primaryBtnText}>Allow camera</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.cameraWrap}>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
            <View style={styles.oval} pointerEvents="none" />
          </View>

          <View style={styles.body}>
            <Text style={styles.help}>
              Take {SHOTS} photos. Ask them to look straight at the camera, then turn their head a
              little each time. Good light on the face matters more than anything else.
            </Text>

            <View style={styles.dots}>
              {Array.from({ length: SHOTS }).map((_, i) => (
                <View key={i} style={[styles.dot, i < vectors.length && styles.dotOn]} />
              ))}
            </View>

            <Pressable
              style={[styles.shootBtn, (busy || done) && { opacity: 0.5 }]}
              onPress={capture}
              disabled={busy || done}
            >
              <Text style={styles.shootEmoji}>{busy ? '…' : '📸'}</Text>
              <Text style={styles.shootText}>
                {done ? 'Enough photos' : `Take photo ${vectors.length + 1} of ${SHOTS}`}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.saveBtn, (vectors.length === 0 || saving) && { opacity: 0.5 }]}
              onPress={save}
              disabled={vectors.length === 0 || saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save face'}</Text>
            </Pressable>

            <Pressable onPress={clearFace} hitSlop={8}>
              <Text style={styles.removeText}>Remove saved face</Text>
            </Pressable>

            <Text style={styles.privacy}>
              Only numbers are saved — never the photo. {L.usePin.en} / {L.usePin.gu} always works.
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.white, fontSize: 30, fontWeight: '700' },
  headerTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  big: { fontSize: 56, marginBottom: spacing.md },
  help: { fontSize: 14, fontWeight: '600', color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },

  cameraWrap: { height: 320, margin: spacing.lg, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', ...shadow.card },
  oval: { position: 'absolute', alignSelf: 'center', top: 30, width: 200, height: 260, borderRadius: 130, borderWidth: 4, borderColor: colors.white, opacity: 0.7 },

  body: { paddingHorizontal: spacing.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  dot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.healthy },

  shootBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: spacing.lg, ...shadow.card },
  shootEmoji: { fontSize: 26 },
  shootText: { color: colors.white, fontSize: 18, fontWeight: '900' },

  saveBtn: { backgroundColor: colors.healthy, borderRadius: radius.lg, alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.md, ...shadow.card },
  saveBtnText: { color: colors.white, fontSize: 18, fontWeight: '900' },

  removeText: { color: colors.danger, fontSize: 14, fontWeight: '800', textAlign: 'center', marginTop: spacing.lg },
  privacy: { fontSize: 12, fontWeight: '600', color: colors.textLight, textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.xl },
});
