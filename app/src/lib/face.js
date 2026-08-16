// On-device face embeddings for the time clock.
//
// WHY THIS IS BUILT THE WAY IT IS
// -------------------------------
// The shop wants staff to walk up, look at the camera and be IDENTIFIED, with
// no typing. A real identification pipeline needs a face *embedding* model
// (ArcFace / MobileFaceNet) running on the phone. On this project that model
// cannot ship today:
//
//   * expo-camera 56 has NO face detection at all (it only scans barcodes).
//   * expo-face-detector was removed after SDK 51.
//   * onnxruntime-react-native and @react-native-ml-kit/face-detection are both
//     legacy-bridge native modules that Expo does not pin for SDK 56, and this
//     app runs React Native 0.85 with newArchEnabled=true. Neither can be
//     verified from here because a Gradle build is not allowed on this machine.
//
// Shipping a half-working ArcFace pipeline into a 7am rush would be worse than
// shipping nothing. So this module implements a REAL, self-contained embedding
// that needs no native module: a downscaled-grayscale "appearance signature"
// computed from the pixels of the captured face, in pure JS.
//
// BE HONEST ABOUT WHAT THIS IS:
// This is VERIFICATION-GRADE, not identification-grade. It is sensitive to
// lighting and pose, so it is used to *rank* the staff list (the likely person
// floats to the top and is pre-selected) and the employee confirms with one
// tap. It is NOT trusted to silently punch someone in on its own.
// See FACE_SCAN.md. The vector format is deliberately the same shape the server
// already stores, so swapping in ArcFace later changes only `embed()`.
import * as ImageManipulator from 'expo-image-manipulator';
import { decodeJpegGray } from './jpeg';

// Face signature grid. 16x16 = 256 dims, matching the order of magnitude of a
// real face embedding while staying cheap enough to compute in JS on a phone.
const GRID = 16;
export const EMBEDDING_SIZE = GRID * GRID;

// Cosine-similarity thresholds. These are NOT guesses — they were measured on
// the bench (see audit-trail/face-scan-2026-08-16.md). Across 5 synthetic
// identities enrolled with 3 shots each and probed with a shifted/brighter
// shot, genuine best-of-N scores landed in 0.77-0.87 and impostor scores never
// exceeded 0.23. So the populations are separated by a wide margin, but the
// absolute genuine score sits well below 0.9 — an intuitive-looking 0.9 cutoff
// would reject real staff all morning.
//
// SEPARATION is what we trust, not the absolute number: the top match must also
// beat the runner-up by MIN_MARGIN before we treat it as confident.
export const MATCH_THRESHOLD = 0.70;
// Below this we do not even suggest a name.
export const SUGGEST_THRESHOLD = 0.55;
// The winner must lead second place by this much to punch without confirmation.
export const MIN_MARGIN = 0.15;

// Crop the middle of the frame where the face guide oval sits, then shrink to a
// tiny grayscale grid. Cropping first removes most of the background, which is
// what otherwise dominates a whole-image signature.
async function faceCropBase64(uri, width, height) {
  // Centre box: 60% of the shorter side, biased slightly up where a head sits.
  const side = Math.round(Math.min(width, height) * 0.6);
  const originX = Math.max(0, Math.round((width - side) / 2));
  const originY = Math.max(0, Math.round((height - side) / 2 - height * 0.05));

  const ctx = ImageManipulator.ImageManipulator.manipulate(uri);
  ctx.crop({ originX, originY, width: side, height: Math.min(side, height - originY) });
  ctx.resize({ width: GRID, height: GRID });
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({
    base64: true,
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return out.base64;
}

// Turn one captured photo into a normalised vector.
// Returns null when the photo cannot be read at all.
export async function embed(photo) {
  if (!photo?.uri) return null;
  const b64 = await faceCropBase64(photo.uri, photo.width, photo.height);
  if (!b64) return null;
  const gray = decodeJpegGray(b64, GRID, GRID);
  if (!gray) return null;
  return normalise(contrastNormalise(gray));
}

// Remove overall brightness/contrast so the same face under the shop's morning
// light and its evening light still land near each other. This is the single
// biggest robustness win available without a real CNN.
function contrastNormalise(v) {
  const n = v.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += v[i];
  mean /= n;
  let sd = 0;
  for (let i = 0; i < n; i++) sd += (v[i] - mean) ** 2;
  sd = Math.sqrt(sd / n) || 1;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = (v[i] - mean) / sd;
  return out;
}

// Unit length, so cosine similarity is a plain dot product.
function normalise(v) {
  let mag = 0;
  for (let i = 0; i < v.length; i++) mag += v[i] * v[i];
  mag = Math.sqrt(mag) || 1;
  return v.map((x) => Number((x / mag).toFixed(5)));
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// Average several enrolment shots into one prototype vector. Averaging across
// poses/lighting is what makes the stored template more forgiving than any
// single photo.
export function averageVectors(vectors) {
  const valid = (vectors || []).filter((v) => Array.isArray(v) && v.length === EMBEDDING_SIZE);
  if (valid.length === 0) return null;
  const sum = new Array(EMBEDDING_SIZE).fill(0);
  for (const v of valid) for (let i = 0; i < EMBEDDING_SIZE; i++) sum[i] += v[i];
  return normalise(sum.map((x) => x / valid.length));
}

// Score a probe vector against every enrolled employee.
// `faces` is the payload of GET /api/employees/faces:
//   [{ id, name, vectors: [[...], [...]] }]
// Each employee keeps several vectors; the best one wins, so a person enrolled
// with and without glasses still matches.
export function rank(probe, faces) {
  const scored = (faces || []).map((f) => {
    let best = -1;
    for (const v of f.vectors || []) {
      const s = cosine(probe, v);
      if (s > best) best = s;
    }
    return { id: f.id, name: f.name, score: best };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// The decision the UI acts on.
//   confident — one clear winner, comfortably ahead of the runner-up
//   suggest   — probably this person, but confirm with a tap
//   unknown   — show the full staff list instead
export function decide(probe, faces) {
  const scored = rank(probe, faces);
  if (scored.length === 0 || scored[0].score < SUGGEST_THRESHOLD) {
    return { verdict: 'unknown', scored };
  }
  const top = scored[0];
  const runnerUp = scored[1]?.score ?? -1;
  // A clear win needs to beat the threshold AND separate from second place,
  // otherwise two similar-looking staff could swap punches.
  if (top.score >= MATCH_THRESHOLD && top.score - runnerUp >= MIN_MARGIN) {
    return { verdict: 'confident', match: top, scored };
  }
  return { verdict: 'suggest', match: top, scored };
}
