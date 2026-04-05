/**
 * Cross-page Fetch.ai SafetyDecision store.
 *
 * `useSafetyAgent` polls /api/safety → uAgents SafetyOrchestratorAgent and
 * receives a SafetyDecision (alertLevel, tripScore, recommendation, incidents,
 * predictedRisk, …). That hook runs on whichever page currently owns the
 * camera. Other pages — most importantly /metrics — want to render the same
 * agent data without owning the camera, so we mirror every fresh decision
 * into this tiny pub/sub store.
 *
 * The store keeps the last decision even after monitoring stops, so Metrics
 * can still display the most recent Fetch.ai snapshot post-drive.
 */
import type { SafetyDecision } from './safety-types';

export interface SafetyDecisionSnapshot {
  /** True while a live camera session is actively feeding the agent. */
  isLive: boolean;
  /** Last decision returned by the orchestrator (or the TS mock fallback). */
  decision: SafetyDecision | null;
  /** Epoch ms when the last decision landed — lets the UI age it out. */
  lastUpdatedAt: number | null;
  /** sessionId the decision belongs to (useful for debugging + display). */
  sessionId: string | null;
}

const initialSnapshot: SafetyDecisionSnapshot = {
  isLive: false,
  decision: null,
  lastUpdatedAt: null,
  sessionId: null,
};

let snapshot: SafetyDecisionSnapshot = initialSnapshot;
const listeners = new Set<() => void>();

export function getSafetyDecisionSnapshot(): SafetyDecisionSnapshot {
  return snapshot;
}

export function getSafetyDecisionServerSnapshot(): SafetyDecisionSnapshot {
  return initialSnapshot;
}

export function subscribeSafetyDecision(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function publishSafetyDecision(
  decision: SafetyDecision,
  sessionId: string,
) {
  snapshot = {
    isLive: true,
    decision,
    lastUpdatedAt: Date.now(),
    sessionId,
  };
  listeners.forEach((l) => l());
}

/** Called when a drive ends — keeps the last decision but flips isLive off. */
export function markSafetyDecisionIdle() {
  if (!snapshot.decision) return;
  snapshot = { ...snapshot, isLive: false };
  listeners.forEach((l) => l());
}

/** Full reset — use only on explicit user action (e.g. "clear history"). */
export function resetSafetyDecision() {
  snapshot = initialSnapshot;
  listeners.forEach((l) => l());
}
