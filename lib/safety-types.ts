/**
 * Shared Fetch.ai-facing types for the BlinkGuard safety agent layer.
 *
 * These mirror the uAgents `Model` schemas in `agents/models.py` 1:1. If you
 * change one side, change the other. The shapes are deliberately primitive so
 * they serialize cleanly over JSON in either direction.
 *
 * Design note — multimodal extensibility (req #6): `TelemetryEvent.signals`
 * is an open-ended map keyed by SignalKind. Future inputs (head nod, gaze
 * drift, steering entropy, …) can be added without changing the agent API.
 */

export type AlertLevel = 'none' | 'gentle' | 'warning' | 'critical';
export type DrowsinessState = 'awake' | 'warning' | 'danger';

/** Known multimodal signal kinds. Add new kinds here — agents read them by key. */
export type SignalKind =
  | 'ear'              // Eye Aspect Ratio (0..~0.4)
  | 'mar'              // Mouth Aspect Ratio (yawn)
  | 'closed_frames'    // Rolling count of consecutive closed-eye frames
  | 'blink_rate'       // Blinks per minute
  | 'head_nod'         // Reserved — not yet produced
  | 'gaze_drift'       // Reserved — not yet produced
  | 'yawn';            // 1 if yawning this frame, else 0

export interface Signal {
  kind: SignalKind;
  value: number;
  /** Optional confidence 0..1 — lets agents down-weight noisy inputs */
  confidence?: number;
}

/** One sample produced by the vision pipeline (or the mock generator). */
export interface TelemetryEvent {
  /** Stable id for a single trip — lets the agent bucket history per trip */
  sessionId: string;
  /** Client-side epoch ms so agent can compute time gaps even across restarts */
  timestamp: number;
  /** Current vision state machine output — agent uses this as the "headline" signal */
  state: DrowsinessState;
  /** List of numeric signals keyed by SignalKind */
  signals: Signal[];
  /** True if the user has completed calibration — agent uses baseline-aware thresholds */
  calibrated: boolean;
}

/** One logged incident — the agent returns the full current list for UI rendering. */
export interface Incident {
  id: string;
  timestamp: number;
  severity: AlertLevel;
  /** Closed-frames value or similar numeric that triggered the log */
  score: number;
  /** Short machine-readable reason — e.g. "sustained_closed_eyes" */
  reason: string;
  /** Human-friendly reason for the timeline row */
  message: string;
}

/** Structured decision returned by SafetyOrchestratorAgent. */
export interface SafetyDecision {
  /** Adaptive escalation result — req #1 */
  alertLevel: AlertLevel;
  /** Short, user-friendly copy — req #2 */
  recommendation: string;
  /** Longer coaching tip — optional, for the recommendation card */
  coachingTip?: string;
  /** Trip safety score 0..100 — req #3 */
  tripScore: number;
  /** Lightweight predictive warning — req #5. 0..1 probability of reaching danger soon. */
  predictedRisk: number;
  /** Human label for the prediction, e.g. "rising" / "stable" / "improving" */
  predictedTrend: 'improving' | 'stable' | 'rising' | 'critical';
  /** Full list of incidents the agent has stored for this session */
  incidents: Incident[];
  /** Echo of calibration flag — lets the UI show a calibration nag if false */
  calibrated: boolean;
  /** True if the response came from the real uAgents service, false if the TS mock fallback. */
  source: 'uagents' | 'mock';
}

// ── Pull-over spot recommendation ────────────────────────────────────────────

export interface PulloverSpot {
  name: string;
  address: string;
  /** "gas_station" | "rest_stop" | "parking" | "other" */
  type: string;
  distanceMeters: number;
  lat: number;
  lng: number;
}

export interface PulloverResponse {
  spots: PulloverSpot[];
  source: 'uagents' | 'fallback';
}

/** Calibration ping — fire once when the user completes the calibration wizard. */
export interface CalibrationEvent {
  sessionId: string;
  timestamp: number;
  earThreshold: number;
  marThreshold: number;
}
