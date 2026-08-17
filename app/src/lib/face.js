// On-device face recognition for the time clock, built on Google ML Kit.
//
// WHAT CHANGED AND WHY
// --------------------
// The first version compared downscaled pixel brightness. It worked with one
// enrolled person and fell apart with two — exactly what Parth hit. Brightness
// is a property of the room, not of the person.
//
// This version uses ML Kit's FACIAL LANDMARKS: eyes, ears, nose base, cheeks
// and mouth corners, plus the head rotation angles. From those we build a
// signature out of RATIOS between distances — eye separation vs nose length,
// mouth width vs eye separation, and so on.
//
// Ratios are the point. A raw pixel distance changes when you stand closer to
// the camera; the ratio between two distances does not. That is what lets the
// same person match at arm's length and at the counter, while two different
// people stay apart.
//
// PRIVACY: no photograph is ever stored or uploaded. What we keep is a short
// list of numbers describing proportions. A face cannot be reconstructed from
// them.
import FaceDetection from '@react-native-ml-kit/face-detection';

/** Landmarks we require. If ML Kit cannot find all of these, we do not guess. */
const REQUIRED = [
  'leftEye', 'rightEye', 'noseBase', 'mouthLeft', 'mouthRight',
];

/** Extra landmarks that improve accuracy when present. */
const OPTIONAL = ['leftEar', 'rightEar', 'leftCheek', 'rightCheek', 'mouthBottom'];

export const SIGNATURE_VERSION = 3;   // bump when the maths changes

/** Length a v3 signature must have. Anything else is an older enrolment. */
export const SIGNATURE_DIMS = 12 + 12 + 4 + 4 + 4 + 4 + 3;   // = 43

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pt(landmarks, name) {
  const l = landmarks && landmarks[name];
  return l && l.position ? l.position : null;
}

/**
 * Turn one detected face into a scale-invariant signature.
 *
 * Every measurement is divided by the distance between the eyes, so the
 * numbers describe the SHAPE of the face rather than how big it appeared.
 * Returns null when the face is too turned away or landmarks are missing —
 * refusing to produce a bad signature is better than storing one.
 */
export function signatureFromFace(face) {
  if (!face || !face.landmarks) return null;

  // A face turned too far gives distorted geometry. Reject rather than record.
  const yaw = Math.abs(face.rotationY ?? 0);
  const roll = Math.abs(face.rotationZ ?? 0);
  if (yaw > 20 || roll > 20) return null;

  const lm = face.landmarks;
  for (const name of REQUIRED) {
    if (!pt(lm, name)) return null;
  }

  const leftEye = pt(lm, 'leftEye');
  const rightEye = pt(lm, 'rightEye');
  const nose = pt(lm, 'noseBase');
  const mouthL = pt(lm, 'mouthLeft');
  const mouthR = pt(lm, 'mouthRight');

  // The yardstick. Everything else is expressed relative to this.
  const eyeGap = dist(leftEye, rightEye);
  if (!eyeGap || eyeGap < 1) return null;

  const eyeMid = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
  const mouthMid = { x: (mouthL.x + mouthR.x) / 2, y: (mouthL.y + mouthR.y) / 2 };

  const v = [
    dist(eyeMid, nose) / eyeGap,          // how long the nose sits below the eyes
    dist(nose, mouthMid) / eyeGap,        // nose base to mouth
    dist(eyeMid, mouthMid) / eyeGap,      // whole mid-face length
    dist(mouthL, mouthR) / eyeGap,        // mouth width
    dist(leftEye, nose) / eyeGap,         // left eye to nose
    dist(rightEye, nose) / eyeGap,        // right eye to nose  (asymmetry shows here)
    dist(leftEye, mouthL) / eyeGap,
    dist(rightEye, mouthR) / eyeGap,
  ];

  // Optional landmarks add discriminating power when ML Kit finds them. A
  // sentinel of 0 keeps the vector the same length either way, so signatures
  // stay comparable.
  const ears = [
    pt(lm, 'leftEar'), pt(lm, 'rightEar'),
    pt(lm, 'leftCheek'), pt(lm, 'rightCheek'), pt(lm, 'mouthBottom'),
  ];
  v.push(ears[0] && ears[1] ? dist(ears[0], ears[1]) / eyeGap : 0);   // head width
  v.push(ears[2] && ears[3] ? dist(ears[2], ears[3]) / eyeGap : 0);   // cheek width
  v.push(ears[4] ? dist(nose, ears[4]) / eyeGap : 0);                 // nose to chin-ish

  // Face box proportion — a long face vs a round one.
  if (face.frame && face.frame.width > 0) {
    v.push(face.frame.height / face.frame.width);
  } else {
    v.push(0);
  }

  // ---- CONTOURS -------------------------------------------------------
  // Ten landmark points describe where features ARE. Contours describe their
  // SHAPE: the outline of the jaw, the arc of each eyebrow, the curve of the
  // lips — around 130 points instead of 10. Two people with similar landmark
  // spacing usually still have visibly different jaw and brow shapes, so this
  // is where most of the discriminating power lives.
  const co = face.contours || {};
  v.push(...contourShape(co.face, eyeMid, eyeGap, 12));
  v.push(...contourShape(co.leftEyebrowTop, eyeMid, eyeGap, 4));
  v.push(...contourShape(co.rightEyebrowTop, eyeMid, eyeGap, 4));
  v.push(...contourShape(co.upperLipTop, eyeMid, eyeGap, 4));
  v.push(...contourShape(co.lowerLipBottom, eyeMid, eyeGap, 4));
  v.push(...contourShape(co.noseBridge, eyeMid, eyeGap, 3));

  return v;
}

/**
 * Reduce one contour to a fixed number of scale-invariant measurements.
 *
 * We resample the contour to `n` evenly spaced points and record each one's
 * distance from the eye midpoint, divided by the eye gap. Fixed length matters:
 * ML Kit returns a different number of raw points per photo, and signatures can
 * only be compared if they are the same length every time.
 */
function contourShape(contour, origin, scale, n) {
  const out = new Array(n).fill(0);
  const pts = contour && contour.points;
  if (!pts || pts.length < 2 || !scale) return out;
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (pts.length - 1)) / (n - 1));
    const p = pts[idx];
    if (p) out[i] = dist(origin, p) / scale;
  }
  return out;
}

/** Detect the most prominent face in a photo and return its signature. */
export async function embedFromPhoto(uri) {
  const faces = await FaceDetection.detect(uri, {
    performanceMode: 'accurate',
    landmarkMode: 'all',
    // Contours are the big win: ~130 points describing the SHAPE of the jaw,
    // brows and lips, not just where the eyes and nose sit.
    contourMode: 'all',
    classificationMode: 'all',
    minFaceSize: 0.15,
  });
  if (!faces || faces.length === 0) return { error: 'no_face' };
  if (faces.length > 1) return { error: 'many_faces' };

  const face = faces[0];
  // Eyes closed or mid-blink distorts the eye landmarks we measure from.
  const eyesOpen = Math.min(
    face.leftEyeOpenProbability ?? 1,
    face.rightEyeOpenProbability ?? 1,
  );
  if (eyesOpen < 0.3) return { error: 'eyes_closed' };

  const vector = signatureFromFace(face);
  if (!vector) return { error: 'bad_angle' };
  return { vector };
}

/** Cosine similarity, -1..1. Two signatures of the same face sit near 1. */
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Matching.
//
// Cosine similarity was the wrong tool here. Every human face has roughly the
// same proportions, so all the vectors point in nearly the same direction and
// genuine vs impostor scores landed 0.9996 vs 0.9990 — a gap of 0.0005, far too
// small to act on. Measured on real enrolments, not guessed.
//
// Instead we compare each measurement against how much THAT measurement varies
// between people, then take a normalised distance. A dimension where everyone
// is alike contributes little; one where people differ contributes a lot.
export const MAX_DISTANCE = 0.55;   // best match must be at least this close
export const MIN_SEPARATION = 0.20; // and this much closer than the runner-up

/** Per-dimension spread across all enrolled staff — our yardstick. */
function spreads(enrolled) {
  const all = [];
  for (const p of enrolled || []) for (const v of p.vectors || []) all.push(v);
  if (all.length < 2) return null;
  const n = all[0].length;
  const out = new Array(n).fill(1);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (const v of all) sum += v[i] || 0;
    const mean = sum / all.length;
    let varr = 0;
    for (const v of all) varr += ((v[i] || 0) - mean) ** 2;
    // Floor stops a dimension everyone shares from dividing by ~0 and
    // exploding into noise.
    out[i] = Math.max(Math.sqrt(varr / all.length), 1e-3);
  }
  return out;
}

/** Distance in "how unusual is this difference" units. Lower = more alike. */
export function normDistance(a, b, sd) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = ((a[i] || 0) - (b[i] || 0)) / (sd ? sd[i] : 1);
    sum += d * d;
  }
  return Math.sqrt(sum / a.length);
}

/**
 * Compare a probe signature against enrolled staff.
 *
 * enrolled: [{ id, name, vectors: [[...], ...] }]
 * Returns { match, distance, separation, runnerUp, confident }.
 */
export function identify(probe, enrolled) {
  // Only compare against enrolments of the SAME shape. A stale signature from
  // an older app version silently made every comparison fail, which looked
  // like "face recognition is broken" rather than "one person needs re-enrolling".
  const usable = (enrolled || [])
    .map((p) => ({ ...p, vectors: (p.vectors || []).filter((v) => v.length === probe.length) }))
    .filter((p) => p.vectors.length > 0);

  if (usable.length === 0) {
    return { match: null, distance: Infinity, separation: 0, confident: false, needsReenrol: true };
  }

  const sd = spreads(usable);
  const scored = usable.map((person) => ({
    person,
    distance: Math.min(...person.vectors.map((v) => normDistance(probe, v, sd))),
  }));
  scored.sort((a, b) => a.distance - b.distance);

  const top = scored[0];
  const second = scored[1];
  const separation = second ? second.distance - top.distance : Infinity;
  const confident = top.distance <= MAX_DISTANCE && separation >= MIN_SEPARATION;

  return {
    match: top.person,
    distance: top.distance,
    separation,
    runnerUp: second ? second.person : null,
    confident,
  };
}

/** Plain-language reason a scan failed, for the screen to show. */
export function reasonText(error) {
  switch (error) {
    case 'no_face': return 'No face seen — hold the phone up and look at it.';
    case 'many_faces': return 'More than one face — only one person at a time.';
    case 'eyes_closed': return 'Eyes were closed — try again.';
    case 'bad_angle': return 'Head turned too far — look straight at the camera.';
    default: return 'Could not read the face.';
  }
}
