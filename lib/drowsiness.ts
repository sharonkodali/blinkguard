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

// ─── Low-Light Enhancement ────────────────────────────────────────────────────

export type EnhancementMode = 'none' | 'brightness' | 'histogram' | 'gamma';

function clamp(v: number): number {
  return Math.min(255, Math.max(0, Math.round(v)));
}

// Brightness & contrast adjustment
function applyBrightnessContrast(imageData: ImageData): ImageData {
  const data = imageData.data;
  const brightness = 40;    // boost brightness
  const contrast = 1.3;     // increase contrast

  for (let i = 0; i < data.length; i += 4) {
    // Apply brightness
    data[i]     = clamp(data[i]     + brightness);
    data[i + 1] = clamp(data[i + 1] + brightness);
    data[i + 2] = clamp(data[i + 2] + brightness);

    // Apply contrast around 128
    const centerOffset = 128;
    data[i]     = clamp((data[i]     - centerOffset) * contrast + centerOffset);
    data[i + 1] = clamp((data[i + 1] - centerOffset) * contrast + centerOffset);
    data[i + 2] = clamp((data[i + 2] - centerOffset) * contrast + centerOffset);
  }

  return imageData;
}

// Histogram equalization (spreads pixel values across full range)
function applyHistogramEqualization(imageData: ImageData): ImageData {
  const data = imageData.data;

  // Build histogram (256 bins)
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    histogram[gray]++;
  }

  // Compute CDF (cumulative distribution function)
  const cdf = new Array(256);
  cdf[0] = histogram[0];
  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + histogram[i];
  }

  // Normalize CDF to 0-255
  const cdfMin = cdf.find(v => v > 0) || 1;
  const pixelCount = data.length / 4;
  const lut = new Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = clamp(((cdf[i] - cdfMin) / (pixelCount - cdfMin)) * 255);
  }

  // Apply LUT to each channel
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }

  return imageData;
}

// Adaptive gamma correction (BEST for night driving)
function applyAdaptiveGamma(imageData: ImageData): ImageData {
  const data = imageData.data;

  // Measure average brightness of this frame
  let totalLum = 0;
  for (let i = 0; i < data.length; i += 4) {
    totalLum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const avgLum = totalLum / (data.length / 4); // 0–255

  // Compute gamma — darker frame = lower gamma (brightens more)
  // gamma < 1 brightens, gamma > 1 darkens
  // Target average brightness ~140 (brighter to compensate for dark conditions)
  const targetLum = 140;
  const gamma = Math.log(targetLum / 255) / Math.log(Math.max(avgLum, 1) / 255);
  const clampedGamma = Math.min(Math.max(gamma, 0.3), 3.0); // safety clamp

  // Build lookup table (fast — only 256 calculations)
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = clamp(255 * Math.pow(i / 255, 1 / clampedGamma));
  }

  // Apply to every pixel
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }

  return imageData;
}

// Master enhance function
export function enhanceFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode: EnhancementMode
): void {
  if (mode === 'none') return;

  const imageData = ctx.getImageData(0, 0, width, height);

  let enhanced: ImageData;
  switch (mode) {
    case 'brightness': enhanced = applyBrightnessContrast(imageData); break;
    case 'histogram':  enhanced = applyHistogramEqualization(imageData); break;
    case 'gamma':      enhanced = applyAdaptiveGamma(imageData); break;
    default:           return;
  }

  ctx.putImageData(enhanced, 0, 0);
}