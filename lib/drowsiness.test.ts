import { beforeEach, describe, expect, it } from 'vitest';
import {
  FRAMES_DANGER,
  FRAMES_WARNING,
  calculatePersonalizedThresholds,
  computeAdaptiveEAR,
  computeAdaptiveMAR,
  computeEAR,
  computeLeftEyeEAR,
  computeMAR,
  computeRightEyeEAR,
  estimateFaceYawNorm,
  getDrowsinessState,
  getPersonalEARThreshold,
  getPersonalMARThreshold,
  isEyeClosed,
  isEyeClosedAdaptive,
  isYawning,
  isYawningAdaptive,
  setPersonalizedThresholds,
  type CalibrationData,
  type FaceLandmark,
} from './drowsiness';

const DEFAULT_EAR = 0.235;
const DEFAULT_MAR = 0.65;

interface FaceOpts {
  /** Half-height of each eye opening; EAR = 2 * eyeHalf for a unit-width eye. */
  leftEyeHalf?: number;
  rightEyeHalf?: number;
  /** Horizontal width of each eye (corner to corner). */
  leftEyeWidth?: number;
  rightEyeWidth?: number;
  /** Mouth vertical opening and horizontal width. */
  mouthOpen?: number;
  mouthWidth?: number;
  /** Horizontal nose offset from the eye midline (head yaw proxy). */
  noseOffset?: number;
}

/**
 * Build a synthetic 478-point MediaPipe face mesh where only the landmarks the
 * detector reads are placed, so the expected EAR/MAR can be derived by hand.
 */
function makeFace(opts: FaceOpts = {}): FaceLandmark[] {
  const {
    leftEyeHalf = 0.15,
    rightEyeHalf = 0.15,
    leftEyeWidth = 1,
    rightEyeWidth = 1,
    mouthOpen = 0.2,
    mouthWidth = 1,
    noseOffset = 0,
  } = opts;
  const lm: FaceLandmark[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));

  // Left eye: corners 33 → 133, lids at 1/3 and 2/3 of the width.
  const lx = 0;
  lm[33] = { x: lx, y: 0 };
  lm[133] = { x: lx + leftEyeWidth, y: 0 };
  lm[160] = { x: lx + leftEyeWidth / 3, y: leftEyeHalf };
  lm[144] = { x: lx + leftEyeWidth / 3, y: -leftEyeHalf };
  lm[158] = { x: lx + (2 * leftEyeWidth) / 3, y: leftEyeHalf };
  lm[153] = { x: lx + (2 * leftEyeWidth) / 3, y: -leftEyeHalf };

  // Right eye: corners 362 → 263.
  const rx = 2;
  lm[362] = { x: rx, y: 0 };
  lm[263] = { x: rx + rightEyeWidth, y: 0 };
  lm[385] = { x: rx + rightEyeWidth / 3, y: rightEyeHalf };
  lm[380] = { x: rx + rightEyeWidth / 3, y: -rightEyeHalf };
  lm[387] = { x: rx + (2 * rightEyeWidth) / 3, y: rightEyeHalf };
  lm[373] = { x: rx + (2 * rightEyeWidth) / 3, y: -rightEyeHalf };

  // Nose tip between the outer eye corners (33 and 263).
  const mid = (lm[33].x + lm[263].x) / 2;
  lm[1] = { x: mid + noseOffset, y: -1 };

  // Mouth: 13 (top) / 14 (bottom), 78 (left) / 308 (right).
  lm[13] = { x: 1.5, y: -2 + mouthOpen / 2 };
  lm[14] = { x: 1.5, y: -2 - mouthOpen / 2 };
  lm[78] = { x: 1.5 - mouthWidth / 2, y: -2 };
  lm[308] = { x: 1.5 + mouthWidth / 2, y: -2 };

  return lm;
}

beforeEach(() => {
  setPersonalizedThresholds(DEFAULT_EAR, DEFAULT_MAR);
});

describe('Eye Aspect Ratio', () => {
  it('computes EAR as vertical opening over horizontal width', () => {
    const face = makeFace({ leftEyeHalf: 0.15, rightEyeHalf: 0.1 });
    // (2 * 0.3) / (2 * 1) = 0.3 for left, 0.2 for right
    expect(computeLeftEyeEAR(face)).toBeCloseTo(0.3);
    expect(computeRightEyeEAR(face)).toBeCloseTo(0.2);
    expect(computeEAR(face)).toBeCloseTo(0.25);
  });

  it('is scale invariant', () => {
    const face = makeFace({ leftEyeHalf: 0.15, rightEyeHalf: 0.15 });
    const scaled = face.map((p) => ({ x: p.x * 3, y: p.y * 3 }));
    expect(computeEAR(scaled)).toBeCloseTo(computeEAR(face));
  });

  it('drops toward zero when the eyes close', () => {
    const closed = makeFace({ leftEyeHalf: 0.01, rightEyeHalf: 0.01 });
    expect(computeEAR(closed)).toBeCloseTo(0.02);
  });

  it('does not divide by zero on degenerate landmarks', () => {
    const lm: FaceLandmark[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
    expect(Number.isFinite(computeEAR(lm))).toBe(true);
    expect(computeAdaptiveEAR(lm)).toBe(0);
  });
});

describe('adaptive EAR (head pose)', () => {
  it('matches the plain mean when both eyes are equally wide', () => {
    const face = makeFace({ leftEyeHalf: 0.15, rightEyeHalf: 0.1 });
    expect(computeAdaptiveEAR(face)).toBeCloseTo(computeEAR(face));
  });

  it('weights the wider (more frontal) eye more', () => {
    const face = makeFace({
      leftEyeHalf: 0.15,
      rightEyeHalf: 0.05,
      leftEyeWidth: 1,
      rightEyeWidth: 0.5,
    });
    const left = computeLeftEyeEAR(face);
    const right = computeRightEyeEAR(face);
    const expected = (1 / 1.5) * left + (0.5 / 1.5) * right;
    expect(computeAdaptiveEAR(face)).toBeCloseTo(expected);
  });

  it('follows only the visible eye in strong profile', () => {
    // Right eye is nearly edge-on (width ratio 0.2 < 0.32)
    const face = makeFace({ leftEyeHalf: 0.15, rightEyeWidth: 0.2, rightEyeHalf: 0.01 });
    expect(computeAdaptiveEAR(face)).toBeCloseTo(computeLeftEyeEAR(face));
  });
});

describe('head yaw estimate', () => {
  it('is ~0 for a frontal face and grows as the nose shifts', () => {
    expect(estimateFaceYawNorm(makeFace())).toBeCloseTo(0);
    expect(estimateFaceYawNorm(makeFace({ noseOffset: 0.9 }))).toBeCloseTo(0.3);
    expect(estimateFaceYawNorm(makeFace({ noseOffset: -0.9 }))).toBeCloseTo(0.3);
  });

  it('returns 0 when landmarks are missing', () => {
    expect(estimateFaceYawNorm([])).toBe(0);
  });
});

describe('Mouth Aspect Ratio', () => {
  it('computes MAR as mouth opening over mouth width', () => {
    expect(computeMAR(makeFace({ mouthOpen: 0.8, mouthWidth: 1 }))).toBeCloseTo(0.8);
    expect(computeMAR(makeFace({ mouthOpen: 0.1, mouthWidth: 0.5 }))).toBeCloseTo(0.2);
  });

  it('adaptive MAR equals MAR when frontal and is dampened when the head turns', () => {
    const frontal = makeFace({ mouthOpen: 0.8 });
    expect(computeAdaptiveMAR(frontal)).toBeCloseTo(computeMAR(frontal));

    const turned = makeFace({ mouthOpen: 0.8, noseOffset: 0.9 }); // yaw 0.3
    expect(computeAdaptiveMAR(turned)).toBeCloseTo(0.8 / (1 + 0.28 * 0.3));
  });
});

describe('thresholds', () => {
  it('uses the default EAR/MAR thresholds before calibration', () => {
    expect(getPersonalEARThreshold()).toBe(DEFAULT_EAR);
    expect(getPersonalMARThreshold()).toBe(DEFAULT_MAR);
    expect(isEyeClosed(0.2)).toBe(true);
    expect(isEyeClosed(0.3)).toBe(false);
    expect(isYawning(0.7)).toBe(true);
    expect(isYawning(0.5)).toBe(false);
  });

  it('treats the threshold itself as open eyes / not yawning', () => {
    expect(isEyeClosed(DEFAULT_EAR)).toBe(false);
    expect(isYawning(DEFAULT_MAR)).toBe(false);
  });

  it('respects personalized thresholds', () => {
    setPersonalizedThresholds(0.18, 0.5);
    expect(isEyeClosed(0.2)).toBe(false);
    expect(isEyeClosed(0.17)).toBe(true);
    expect(isYawning(0.55)).toBe(true);
  });

  it('widens the closed-eye threshold when the head is turned', () => {
    const ear = DEFAULT_EAR * 1.02; // just above the frontal threshold
    expect(isEyeClosedAdaptive(ear, makeFace())).toBe(false);
    expect(isEyeClosedAdaptive(ear, makeFace({ noseOffset: 0.9 }))).toBe(true);
  });

  it('caps the widening so extreme yaw cannot flag open eyes as closed', () => {
    const extreme = makeFace({ noseOffset: 30 });
    expect(isEyeClosedAdaptive(DEFAULT_EAR * 1.2, extreme)).toBe(false);
  });

  it('requires a bigger mouth opening to count a yawn when the head is turned', () => {
    const mar = DEFAULT_MAR * 1.02;
    expect(isYawningAdaptive(mar, makeFace())).toBe(true);
    expect(isYawningAdaptive(mar, makeFace({ noseOffset: 0.9 }))).toBe(false);
  });
});

describe('drowsiness state machine', () => {
  it('is awake below the warning frame count', () => {
    expect(getDrowsinessState(0, false)).toBe('awake');
    expect(getDrowsinessState(FRAMES_WARNING - 1, false)).toBe('awake');
  });

  it('warns at the warning frame count', () => {
    expect(getDrowsinessState(FRAMES_WARNING, false)).toBe('warning');
    expect(getDrowsinessState(FRAMES_DANGER - 1, false)).toBe('warning');
  });

  it('is in danger at the danger frame count', () => {
    expect(getDrowsinessState(FRAMES_DANGER, false)).toBe('danger');
    expect(getDrowsinessState(FRAMES_DANGER + 100, false)).toBe('danger');
  });

  it('warns on a yawn even with open eyes, but danger still wins', () => {
    expect(getDrowsinessState(0, true)).toBe('warning');
    expect(getDrowsinessState(FRAMES_DANGER, true)).toBe('danger');
  });

  it('keeps danger above warning', () => {
    expect(FRAMES_DANGER).toBeGreaterThan(FRAMES_WARNING);
  });
});

describe('calibration', () => {
  const base: CalibrationData = {
    eyesOpenEARValues: [0.3, 0.3, 0.3],
    eyesClosedEARValues: [0.1, 0.1, 0.1],
    normalBlinkEARValues: [],
    yawningMARValues: [0.8, 0.8, 0.8],
    timestamp: 0,
  };

  it('places the EAR threshold at the open/closed midpoint when open EAR is steady', () => {
    const { earThreshold, marThreshold } = calculatePersonalizedThresholds(base);
    expect(earThreshold).toBeCloseTo(0.2);
    expect(marThreshold).toBeCloseTo(0.8);
  });

  it('biases the EAR threshold toward closed when open EAR is noisy', () => {
    const noisy = { ...base, eyesOpenEARValues: [0.25, 0.35] }; // mean 0.3, sd 0.05
    const { earThreshold } = calculatePersonalizedThresholds(noisy);
    expect(earThreshold).toBeCloseTo(0.2 - 0.05 * 0.3);
  });

  it('lowers the MAR threshold by half a std dev of the yawn samples', () => {
    const yawns = { ...base, yawningMARValues: [0.7, 0.9] }; // mean 0.8, sd 0.1
    const { marThreshold } = calculatePersonalizedThresholds(yawns);
    expect(marThreshold).toBeCloseTo(0.8 - 0.1 * 0.5);
  });

  it('never goes below the safety floors', () => {
    const tiny: CalibrationData = {
      ...base,
      eyesOpenEARValues: [0.05],
      eyesClosedEARValues: [0.01],
      yawningMARValues: [0.1],
    };
    const { earThreshold, marThreshold } = calculatePersonalizedThresholds(tiny);
    expect(earThreshold).toBe(0.1);
    expect(marThreshold).toBe(0.3);
  });

  it('falls back to the floors when no samples were captured', () => {
    const empty: CalibrationData = {
      eyesOpenEARValues: [],
      eyesClosedEARValues: [],
      normalBlinkEARValues: [],
      yawningMARValues: [],
      timestamp: 0,
    };
    expect(calculatePersonalizedThresholds(empty)).toEqual({ earThreshold: 0.1, marThreshold: 0.3 });
  });

  it('produces thresholds that separate the calibration samples', () => {
    const { earThreshold, marThreshold } = calculatePersonalizedThresholds(base);
    setPersonalizedThresholds(earThreshold, marThreshold);
    expect(isEyeClosed(0.1)).toBe(true);
    expect(isEyeClosed(0.3)).toBe(false);
    expect(isYawning(0.85)).toBe(true);
    expect(isYawning(0.4)).toBe(false);
  });
});
