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

export const SIGNATURE_VERSION = 2;   // bump when the maths changes

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

  return v;
}

/** Detect the most prominent face in a photo and return its signature. */
export async function embedFromPhoto(uri) {
  const faces = await FaceDetection.detect(uri, {
    performanceMode: 'accurate',
    landmarkMode: 'all',
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

// Matching thresholds.
//
// With ~10 staff the job is to tell ten people apart, not to find one face in
// a million — a far easier problem. Two rules must BOTH hold:
//
//   1. the best match must clear MIN_SCORE, and
//   2. it must beat the runner-up by MIN_MARGIN.
//
// Rule 2 is the important one. If two staff score 0.97 and 0.96 the top score
// looks excellent but the app has not actually distinguished them, and
// guessing would put the wrong person's hours on the payroll. In that case we
// say we are unsure and let them tap a name.
export const MIN_SCORE = 0.90;
export const MIN_MARGIN = 0.03;

/**
 * Compare a probe signature against enrolled staff.
 *
 * enrolled: [{ id, name, vectors: [[...], ...] }]
 * Returns { match, score, margin, runnerUp, confident }.
 */
export function identify(probe, enrolled) {
  const scored = [];
  for (const person of enrolled || []) {
    let best = -1;
    for (const v of person.vectors || []) {
      const s = cosine(probe, v);
      if (s > best) best = s;
    }
    if (best > -1) scored.push({ person, score: best });
  }
  if (scored.length === 0) return { match: null, score: 0, margin: 0, confident: false };

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const second = scored[1];
  const margin = second ? top.score - second.score : 1;
  const confident = top.score >= MIN_SCORE && margin >= MIN_MARGIN;

  return {
    match: top.person,
    score: top.score,
    margin,
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
