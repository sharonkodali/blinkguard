/**
 * POST /api/safety — bridge between the BlinkGuard frontend and the
 * Fetch.ai uAgents service (`agents/safety_service.py`).
 *
 * Flow:
 *   1. Receive a TelemetryEvent from the browser.
 *   2. Try to forward it to the uAgents SafetyOrchestratorAgent via HTTP.
 *      If that succeeds, the returned SafetyDecision is surfaced to the UI
 *      with `source: "uagents"`.
 *   3. If the uAgents service is unreachable (or throws), fall back to the
 *      TypeScript mock in `lib/safety-logic.ts`. The response shape is
 *      identical — only `source` changes to `"mock"` so the UI can show a
 *      "mock mode" badge during a demo without the Python service running.
 *
 * Environment:
 *   SAFETY_AGENT_URL  default http://127.0.0.1:8100/telemetry
 */

import { NextResponse } from 'next/server';
import {
  createSessionMemory,
  runSafetyDecision,
  type SessionMemory,
} from '@/lib/safety-logic';
import type { SafetyDecision, TelemetryEvent } from '@/lib/safety-types';

export const runtime = 'nodejs';

const AGENT_URL =
  process.env.SAFETY_AGENT_URL ?? 'http://127.0.0.1:8100/telemetry';

// Per-process session memory for the mock fallback path. In a real deployment
// this would live in a shared store (Redis/Durable Object) but for a single
// local demo session a module-level Map is fine.
const mockSessions = new Map<string, SessionMemory>();

function getMockMemory(id: string): SessionMemory {
  let mem = mockSessions.get(id);
  if (!mem) {
    mem = createSessionMemory(id);
    mockSessions.set(id, mem);
  }
  return mem;
}

async function forwardToUAgents(ev: TelemetryEvent): Promise<SafetyDecision | null> {
  try {
    // Short timeout — we never want the UI to stall on a dead backend.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(AGENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ev),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as SafetyDecision;
    // Ensure the source flag is set even if the agent forgets.
    return { ...data, source: 'uagents' };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let ev: TelemetryEvent;
  try {
    ev = (await request.json()) as TelemetryEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!ev?.sessionId || !ev?.state || !Array.isArray(ev?.signals)) {
    return NextResponse.json({ error: 'Invalid TelemetryEvent' }, { status: 400 });
  }

  // 1. Try the real uAgents service first.
  const live = await forwardToUAgents(ev);
  if (live) return NextResponse.json(live);

  // 2. Fall back to the in-process TS decision engine so the demo still works.
  const mem = getMockMemory(ev.sessionId);
  const decision = runSafetyDecision(mem, ev);
  return NextResponse.json(decision);
}
