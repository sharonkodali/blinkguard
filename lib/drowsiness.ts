// ─── MediaPipe Face Mesh landmark indices ───────────────────────────────────
// Left eye
const L_TOP1 = 160, L_TOP2 = 158;
const L_BOT1 = 144, L_BOT2 = 153;
const L_LEFT = 33,  L_RIGHT = 133;

// Right eye
const R_TOP1 = 385, R_TOP2 = 387;
const R_BOT1 = 380, R_BOT2 = 373;
const R_LEFT = 362, R_RIGHT = 263;

// Mouth (yawn)
const M_TOP = 13, M_BOT = 14;
const M_LEFT = 78, M_RIGHT = 308;

// ─── Default Thresholds (fallback) ───────────────────────────────────────────
const DEFAULT_EAR_THRESHOLD = 0.235;
const DEFAULT_MAR_THRESHOLD = 0.65;
export const FRAMES_WARNING = 15;
export const FRAMES_DANGER  = 35;

// ─── Personalized Thresholds (will be set during calibration) ─────────────────
let personalEARThreshold = DEFAULT_EAR_THRESHOLD;
let personalMARThreshold = DEFAULT_MAR_THRESHOLD;

export type DrowsinessState = 'awake' | 'warning' | 'danger';

export type FaceLandmark = { x: number; y: number; z?: number };

export interface CalibrationData {
  eyesOpenEARValues: number[];
  eyesClosedEARValues: number[];
  normalBlinkEARValues: number[];
  yawningMARValues: number[];
  timestamp: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function dist2D(a: FaceLandmark, b: FaceLandmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ─── Eye Aspect Ratio ────────────────────────────────────────────────────────
export function computeEAR(lm: FaceLandmark[]): number {
  const leftEAR =
    (dist2D(lm[L_TOP1], lm[L_BOT1]) + dist2D(lm[L_TOP2], lm[L_BOT2])) /
    (2 * dist2D(lm[L_LEFT], lm[L_RIGHT]));

  const rightEAR =
    (dist2D(lm[R_TOP1], lm[R_BOT1]) + dist2D(lm[R_TOP2], lm[R_BOT2])) /
    (2 * dist2D(lm[R_LEFT], lm[R_RIGHT]));

  return (leftEAR + rightEAR) / 2;
}

// ─── Mouth Aspect Ratio (yawn) ────────────────────────────────────────────────
export function computeMAR(lm: FaceLandmark[]): number {
  const vertical   = dist2D(lm[M_TOP],  lm[M_BOT]);
  const horizontal = dist2D(lm[M_LEFT], lm[M_RIGHT]);
  return vertical / horizontal;
}

// ─── Threshold functions ──────────────────────────────────────────────────────
export const isEyeClosed = (ear: number) => ear < personalEARThreshold;
export const isYawning   = (mar: number) => mar > personalMARThreshold;

export function getPersonalEARThreshold() {
  return personalEARThreshold;
}

export function getPersonalMARThreshold() {
  return personalMARThreshold;
}

// ─── ML-based Threshold Calculation ───────────────────────────────────────────
function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

export function calculatePersonalizedThresholds(calibData: CalibrationData): {
  earThreshold: number;
  marThreshold: number;
} {
  // Calculate EAR threshold: midpoint between open and closed eyes
  // with a slight bias towards closed to be more sensitive
  const openMean = calculateMean(calibData.eyesOpenEARValues);
  const closedMean = calculateMean(calibData.eyesClosedEARValues);
  const openStdDev = calculateStdDev(calibData.eyesOpenEARValues, openMean);
  
  // Threshold: mean of closed + 1 std dev (good margin for safety)
  const earThreshold = Math.max(
    0.1, // minimum threshold
    (closedMean + openMean) / 2 - openStdDev * 0.3
  );

  // Calculate MAR threshold: use yawning data
  const yawnMean = calculateMean(calibData.yawningMARValues);
  const yawnStdDev = calculateStdDev(calibData.yawningMARValues, yawnMean);
  
  // Threshold: mean - 1 std dev (detect yawns reliably)
  const marThreshold = Math.max(
    0.3, // minimum threshold
    yawnMean - yawnStdDev * 0.5
  );

  return { earThreshold, marThreshold };
}

export function setPersonalizedThresholds(earThreshold: number, marThreshold: number) {
  personalEARThreshold = earThreshold;
  personalMARThreshold = marThreshold;
}

// ─── Calibration Storage ──────────────────────────────────────────────────────
export function saveCalibrationData(calibData: CalibrationData) {
  if (typeof window !== 'undefined') {
    const thresholds = calculatePersonalizedThresholds(calibData);
    setPersonalizedThresholds(thresholds.earThreshold, thresholds.marThreshold);
    
    // Store to localStorage
    localStorage.setItem('blinkguard_calibration', JSON.stringify({
      calibData,
      thresholds,
      timestamp: Date.now(),
    }));
  }
}

export function loadCalibrationData() {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('blinkguard_calibration');
    if (stored) {
      try {
        const { thresholds } = JSON.parse(stored);
        setPersonalizedThresholds(thresholds.earThreshold, thresholds.marThreshold);
        return true;
      } catch (e) {
        console.error('Failed to load calibration:', e);
      }
    }
  }
  return false;
}

export function hasCalibration() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('blinkguard_calibration') !== null;
  }
  return false;
}

export function getCalibrationData() {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('blinkguard_calibration');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse calibration:', e);
      }
    }
  }
  return null;
}

// ─── State machine ───────────────────────────────────────────────────────────
export function getDrowsinessState(
  closedFrames: number,
  yawning: boolean
): DrowsinessState {
  if (closedFrames >= FRAMES_DANGER)                       return 'danger';
  if (closedFrames >= FRAMES_WARNING || yawning)           return 'warning';
  return 'awake';
}