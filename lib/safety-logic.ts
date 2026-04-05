/**
 * Pure TypeScript port of the SafetyOrchestratorAgent decision logic.
 *
 * Two jobs:
 *   1. Powers the `/api/safety` mock fallback — when the Python uAgents service
 *      isn't running, the Next.js route invokes this so the demo still works
 *      end-to-end with just `npm run dev`.
 *   2. Acts as the reference implementation — `agents/logic.py` mirrors this
 *      function-for-function. Tests (or a hackathon judge) can sanity-check
 *      that both sides agree.
 *
 * Kept intentionally heuristic & cheap so it can run on every telemetry tick.
 */

import type {
  AlertLevel,
  Incident,
  SafetyDecision,
  TelemetryEvent,
} from './safety-types';

/** Mutable rolling state per session. The bridge owns one of these per sessionId. */
export interface SessionMemory {
  sessionId: string;
  events: TelemetryEvent[];
  incidents: Incident[];
  /** Monotonic counter so incident IDs are stable */
  incidentCounter: number;
  /** Epoch ms of last time we raised an alert — used to debounce escalation */
  lastAlertAt: number;
  /** Count of recent "warning" state events in the rolling window */
  recentWarnings: number;
}

export function createSessionMemory(sessionId: string): SessionMemory {
  return {
    sessionId,
    events: [],
    incidents: [],
    incidentCounter: 0,
    lastAlertAt: 0,
    recentWarnings: 0,
  };
}

// ─── Tunables ───────────────────────────────────────────────────────────────
const HISTORY_WINDOW_MS = 90_000;          // keep last 90s of telemetry
const WARNING_REPEAT_THRESHOLD = 3;        // >=3 warnings in window → escalate
const DEBOUNCE_MS = 4_000;                 // don't log two incidents within 4s
const PREDICTION_LOOKBACK_MS = 20_000;     // predict using last 20s of closed_frames
const BLINK_RATE_DANGER = 8;               // blinks/min below this is suspicious
const BLINK_RATE_WARN = 12;

// ─── Helpers ────────────────────────────────────────────────────────────────
function signalOf(ev: TelemetryEvent, kind: string): number | null {
  const s = ev.signals.find((x) => x.kind === kind);
  return s ? s.value : null;
}

function prune(memory: SessionMemory, now: number) {
  const cutoff = now - HISTORY_WINDOW_MS;
  memory.events = memory.events.filter((e) => e.timestamp >= cutoff);
  memory.recentWarnings = memory.events.filter(
    (e) => e.state === 'warning' || e.state === 'danger',
  ).length;
}

// ─── 1. Adaptive alert escalation (req #1) ─────────────────────────────────
function escalate(memory: SessionMemory, ev: TelemetryEvent): AlertLevel {
  if (ev.state === 'danger') return 'critical';

  if (ev.state === 'warning') {
    // Repeated warnings → stronger alert even without hitting danger frames
    if (memory.recentWarnings >= WARNING_REPEAT_THRESHOLD) return 'warning';
    return 'gentle';
  }

  // Awake state but low blink rate sustained → gentle nudge
  const blink = signalOf(ev, 'blink_rate');
  if (blink !== null && blink > 0 && blink < BLINK_RATE_WARN && memory.events.length >= 5) {
    return 'gentle';
  }

  return 'none';
}

// ─── 2. Recommendation copy (req #2) ───────────────────────────────────────
function recommend(level: AlertLevel, trend: SafetyDecision['predictedTrend']): {
  recommendation: string;
  coachingTip: string;
} {
  if (level === 'critical') {
    return {
      recommendation: 'Pull over safely now — you are showing dangerous fatigue.',
      coachingTip: 'Find the nearest rest area. A 20-minute nap resets alertness much more than coffee.',
    };
  }
  if (level === 'warning') {
    return {
      recommendation: 'Fatigue is building. Plan a break within the next 10 minutes.',
      coachingTip: trend === 'rising'
        ? 'Your drowsiness is climbing. Open a window, switch playlists, and aim for the next exit with services.'
        : 'Take a short break at the next safe opportunity — even 5 minutes helps.',
    };
  }
  if (level === 'gentle') {
    return {
      recommendation: 'Stay sharp — mild signs of fatigue detected.',
      coachingTip: 'Adjust posture, stretch your shoulders at the next stop, and hydrate.',
    };
  }
  return {
    recommendation: trend === 'improving' ? 'Nice — alertness improving.' : 'You are alert. Keep it up.',
    coachingTip: 'BlinkGuard is watching in the background.',
  };
}

// ─── 3. Incident logging (req #3) ──────────────────────────────────────────
function maybeLogIncident(
  memory: SessionMemory,
  ev: TelemetryEvent,
  level: AlertLevel,
) {
  if (level === 'none' || level === 'gentle') return;
  if (ev.timestamp - memory.lastAlertAt < DEBOUNCE_MS) return;

  memory.incidentCounter += 1;
  memory.lastAlertAt = ev.timestamp;

  const closed = signalOf(ev, 'closed_frames') ?? 0;
  const reason =
    ev.state === 'danger'     ? 'sustained_closed_eyes' :
    closed > 20               ? 'prolonged_blink' :
    memory.recentWarnings > 3 ? 'repeated_fatigue' :
                                'elevated_drowsiness';
  const message =
    reason === 'sustained_closed_eyes' ? 'Eyes closed for too long' :
    reason === 'prolonged_blink'       ? 'Extended blink detected' :
    reason === 'repeated_fatigue'      ? 'Repeated fatigue warnings' :
                                         'Drowsiness detected';

  memory.incidents.unshift({
    id: `${memory.sessionId}:${memory.incidentCounter}`,
    timestamp: ev.timestamp,
    severity: level,
    score: closed,
    reason,
    message,
  });
  // Cap stored incidents so the response stays small
  if (memory.incidents.length > 50) memory.incidents.length = 50;
}

// ─── Trip safety score (req #3) ────────────────────────────────────────────
function computeTripScore(memory: SessionMemory): number {
  let score = 100;
  for (const inc of memory.incidents) {
    if (inc.severity === 'critical') score -= 18;
    else if (inc.severity === 'warning') score -= 8;
    else if (inc.severity === 'gentle') score -= 3;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── 5. Predictive fatigue warning (req #5) ────────────────────────────────
function predict(memory: SessionMemory, now: number): {
  predictedRisk: number;
  predictedTrend: SafetyDecision['predictedTrend'];
} {
  const recent = memory.events.filter((e) => e.timestamp >= now - PREDICTION_LOOKBACK_MS);
  if (recent.length < 4) {
    return { predictedRisk: 0, predictedTrend: 'stable' };
  }

  // Simple linear trend on closed_frames
  const xs = recent.map((e) => (e.timestamp - recent[0].timestamp) / 1000);
  const ys = recent.map((e) => signalOf(e, 'closed_frames') ?? 0);
  const n = xs.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den; // closed_frames per second

  // Project 10 seconds ahead
  const projected = ys[ys.length - 1] + slope * 10;
  const DANGER_AT = 35; // matches FRAMES_DANGER in lib/drowsiness
  const risk = Math.max(0, Math.min(1, projected / DANGER_AT));

  let trend: SafetyDecision['predictedTrend'];
  if (risk > 0.9)      trend = 'critical';
  else if (slope > 0.3) trend = 'rising';
  else if (slope < -0.3) trend = 'improving';
  else                  trend = 'stable';

  // Also factor in blink rate collapse as a secondary predictor
  const lastBlink = signalOf(recent[recent.length - 1], 'blink_rate');
  let adjustedRisk = risk;
  if (lastBlink !== null && lastBlink > 0 && lastBlink < BLINK_RATE_DANGER) {
    adjustedRisk = Math.max(adjustedRisk, 0.75);
    if (trend === 'stable' || trend === 'improving') trend = 'rising';
  }

  return { predictedRisk: Number(adjustedRisk.toFixed(2)), predictedTrend: trend };
}

// ─── Public entrypoint ─────────────────────────────────────────────────────
export function runSafetyDecision(
  memory: SessionMemory,
  ev: TelemetryEvent,
): SafetyDecision {
  memory.events.push(ev);
  prune(memory, ev.timestamp);

  const level = escalate(memory, ev);
  const prediction = predict(memory, ev.timestamp);
  maybeLogIncident(memory, ev, level);
  const tripScore = computeTripScore(memory);
  const { recommendation, coachingTip } = recommend(level, prediction.predictedTrend);

  return {
    alertLevel: level,
    recommendation,
    coachingTip,
    tripScore,
    predictedRisk: prediction.predictedRisk,
    predictedTrend: prediction.predictedTrend,
    incidents: [...memory.incidents],
    calibrated: ev.calibrated,
    source: 'mock',
  };
}
