/**
 * Cross-page live session store.
 *
 * The drowsiness detector runs on one page at a time (camera access is
 * exclusive), but multiple pages want to read the CURRENT session's stats —
 * the Home dashboard shows a live chip, the Metrics tab shows a live card.
 *
 * This module provides a tiny pub/sub store + useSyncExternalStore helpers so
 * any page can reactively render the current live state without owning the
 * camera itself.
 */
import type { DrowsinessState } from './drowsiness';

export interface LiveSessionSnapshot {
  isActive: boolean;
  faceDetected: boolean;
  ear: number;
  mar: number;
  closedFrames: number;
  blinkRate: number;
  alertCount: number;
  warningCount: number;
  dangerCount: number;
  sessionTime: number; // seconds
  yawning: boolean;
  drowsinessState: DrowsinessState;
  eyeOpenPct: number;
  startedAt: number | null;
  destination: string | null;
}

const initialSnapshot: LiveSessionSnapshot = {
  isActive: false,
  faceDetected: false,
  ear: 0,
  mar: 0,
  closedFrames: 0,
  blinkRate: 0,
  alertCount: 0,
  warningCount: 0,
  dangerCount: 0,
  sessionTime: 0,
  yawning: false,
  drowsinessState: 'awake',
  eyeOpenPct: 0,
  startedAt: null,
  destination: null,
};

let snapshot: LiveSessionSnapshot = initialSnapshot;
const listeners = new Set<() => void>();

export function getLiveSessionSnapshot(): LiveSessionSnapshot {
  return snapshot;
}

export function getLiveSessionServerSnapshot(): LiveSessionSnapshot {
  return initialSnapshot;
}

export function subscribeLiveSession(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function updateLiveSession(patch: Partial<LiveSessionSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}

export function resetLiveSession() {
  snapshot = initialSnapshot;
  listeners.forEach((l) => l());
}
