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

// ─── Thresholds ──────────────────────────────────────────────────────────────
export const EAR_THRESHOLD      = 0.27;  // below = eye closed
export const MAR_THRESHOLD      = 0.50;  // above = yawning
export const FRAMES_WARNING     = 8;     // ~0.5s of closed eyes
export const FRAMES_DANGER      = 20;    // ~1.2s  → trigger full alert

export type DrowsinessState = 'awake' | 'warning' | 'danger';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function dist2D(a: any, b: any): number {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

// ─── Eye Aspect Ratio ────────────────────────────────────────────────────────
export function computeEAR(lm: any[]): number {
  const leftEAR =
    (dist2D(lm[L_TOP1], lm[L_BOT1]) + dist2D(lm[L_TOP2], lm[L_BOT2])) /
    (2 * dist2D(lm[L_LEFT], lm[L_RIGHT]));

  const rightEAR =
    (dist2D(lm[R_TOP1], lm[R_BOT1]) + dist2D(lm[R_TOP2], lm[R_BOT2])) /
    (2 * dist2D(lm[R_LEFT], lm[R_RIGHT]));

  return (leftEAR + rightEAR) / 2;
}

// ─── Mouth Aspect Ratio (yawn) ────────────────────────────────────────────────
export function computeMAR(lm: any[]): number {
  const vertical   = dist2D(lm[M_TOP],  lm[M_BOT]);
  const horizontal = dist2D(lm[M_LEFT], lm[M_RIGHT]);
  return vertical / horizontal;
}

export const isEyeClosed = (ear: number) => ear < EAR_THRESHOLD;
export const isYawning   = (mar: number) => mar > MAR_THRESHOLD;

// ─── State machine ───────────────────────────────────────────────────────────
export function getDrowsinessState(
  closedFrames: number,
  yawning: boolean
): DrowsinessState {
  if (closedFrames >= FRAMES_DANGER)                       return 'danger';
  if (closedFrames >= FRAMES_WARNING || yawning)           return 'warning';
  return 'awake';
}