/**
 * Client-side helpers for talking to the BlinkGuard safety agent layer.
 *
 * The frontend only ever hits `/api/safety` — that Next.js route is the bridge
 * that forwards to the Python uAgents service (or the TS mock fallback).
 * Client code never talks to the Python agent directly, which keeps CORS and
 * env-var plumbing simple.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  SafetyDecision,
  TelemetryEvent,
  DrowsinessState,
  SignalKind,
} from './safety-types';

const API_PATH = '/api/safety';

/** One-shot call — POST a telemetry event and get back a decision. */
export async function postTelemetry(ev: TelemetryEvent): Promise<SafetyDecision | null> {
  try {
    const res = await fetch(API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ev),
    });
    if (!res.ok) return null;
    return (await res.json()) as SafetyDecision;
  } catch {
    return null;
  }
}

/**
 * React hook — polls the agent with the latest telemetry every `intervalMs`.
 *
 * Inputs are passed via refs so the internal timer can read the freshest
 * values without re-subscribing on every render (which would reset the clock).
 */
export interface UseSafetyAgentInput {
  sessionId: string;
  enabled: boolean;
  state: DrowsinessState;
  closedFrames: number;
  ear: number;
  mar: number;
  blinkRate: number;
  yawning: boolean;
  calibrated: boolean;
  intervalMs?: number;
}

export function useSafetyAgent(input: UseSafetyAgentInput) {
  const { intervalMs = 2000, sessionId, enabled } = input;
  const [decision, setDecision] = useState<SafetyDecision | null>(null);

  // Mirror inputs into a ref so the setInterval closure always sees fresh data
  const latest = useRef(input);
  useEffect(() => { latest.current = input; });

  const send = useCallback(async () => {
    const cur = latest.current;
    const ev: TelemetryEvent = {
      sessionId: cur.sessionId,
      timestamp: Date.now(),
      state: cur.state,
      calibrated: cur.calibrated,
      signals: [
        { kind: 'ear' satisfies SignalKind,           value: cur.ear },
        { kind: 'mar' satisfies SignalKind,           value: cur.mar },
        { kind: 'closed_frames' satisfies SignalKind, value: cur.closedFrames },
        { kind: 'blink_rate' satisfies SignalKind,    value: cur.blinkRate },
        { kind: 'yawn' satisfies SignalKind,          value: cur.yawning ? 1 : 0 },
      ],
    };
    const d = await postTelemetry(ev);
    if (d) setDecision(d);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Send one immediately so the HUD populates without waiting a full tick.
    void send();
    const id = setInterval(send, intervalMs);
    return () => clearInterval(id);
  }, [enabled, sessionId, intervalMs, send]);

  return { decision, refresh: send };
}
