import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSessionMemory, runSafetyDecision, type SessionMemory } from './safety-logic';
import type { DrowsinessState, TelemetryEvent } from './safety-types';

const T0 = 1_700_000_000_000;

function event(
  timestamp: number,
  state: DrowsinessState,
  opts: { closed?: number; blink?: number; calibrated?: boolean } = {},
): TelemetryEvent {
  const signals: TelemetryEvent['signals'] = [
    { kind: 'closed_frames', value: opts.closed ?? 0 },
  ];
  if (opts.blink !== undefined) signals.push({ kind: 'blink_rate', value: opts.blink });
  return {
    sessionId: 'trip-1',
    timestamp,
    state,
    signals,
    calibrated: opts.calibrated ?? true,
  };
}

/** Feed a sequence of events and return the decision for the last one. */
function feed(memory: SessionMemory, events: TelemetryEvent[]) {
  let decision = runSafetyDecision(memory, events[0]);
  for (const ev of events.slice(1)) decision = runSafetyDecision(memory, ev);
  return decision;
}

describe('runSafetyDecision: alert escalation', () => {
  it('returns no alert and a perfect score for an alert driver', () => {
    const d = runSafetyDecision(createSessionMemory('trip-1'), event(T0, 'awake'));
    expect(d.alertLevel).toBe('none');
    expect(d.tripScore).toBe(100);
    expect(d.incidents).toHaveLength(0);
    expect(d.recommendation).toBe('You are alert. Keep it up.');
    expect(d.source).toBe('mock');
  });

  it('escalates danger straight to critical', () => {
    const d = runSafetyDecision(createSessionMemory('trip-1'), event(T0, 'danger', { closed: 40 }));
    expect(d.alertLevel).toBe('critical');
    expect(d.recommendation).toMatch(/Pull over/);
  });

  it('starts a lone warning as a gentle nudge', () => {
    const d = runSafetyDecision(createSessionMemory('trip-1'), event(T0, 'warning', { closed: 16 }));
    expect(d.alertLevel).toBe('gentle');
  });

  it('escalates repeated warnings in the window to a warning alert', () => {
    const mem = createSessionMemory('trip-1');
    const levels = [0, 1, 2].map(
      (i) => runSafetyDecision(mem, event(T0 + i * 2000, 'warning', { closed: 16 })).alertLevel,
    );
    expect(levels).toEqual(['gentle', 'gentle', 'warning']);
  });

  it('forgets warnings older than the 90s history window', () => {
    const mem = createSessionMemory('trip-1');
    runSafetyDecision(mem, event(T0, 'warning', { closed: 16 }));
    runSafetyDecision(mem, event(T0 + 2000, 'warning', { closed: 16 }));
    const d = runSafetyDecision(mem, event(T0 + 120_000, 'warning', { closed: 16 }));
    expect(d.alertLevel).toBe('gentle');
    expect(mem.events).toHaveLength(1);
  });

  it('nudges an awake driver whose blink rate stays low', () => {
    const mem = createSessionMemory('trip-1');
    const events = [0, 1, 2, 3, 4].map((i) => event(T0 + i * 2000, 'awake', { blink: 10 }));
    expect(runSafetyDecision(mem, events[0]).alertLevel).toBe('none'); // too little history
    expect(feed(mem, events.slice(1)).alertLevel).toBe('gentle');
  });

  it('ignores a zero blink rate (no measurement yet)', () => {
    const mem = createSessionMemory('trip-1');
    const events = [0, 1, 2, 3, 4].map((i) => event(T0 + i * 2000, 'awake', { blink: 0 }));
    expect(feed(mem, events).alertLevel).toBe('none');
  });
});

describe('runSafetyDecision: incidents and trip score', () => {
  it('logs critical incidents with a reason and lowers the trip score', () => {
    const mem = createSessionMemory('trip-1');
    const d = runSafetyDecision(mem, event(T0, 'danger', { closed: 40 }));
    expect(d.incidents).toHaveLength(1);
    expect(d.incidents[0]).toMatchObject({
      id: 'trip-1:1',
      severity: 'critical',
      reason: 'sustained_closed_eyes',
      score: 40,
    });
    expect(d.tripScore).toBe(82);
  });

  it('does not log gentle alerts as incidents', () => {
    const d = runSafetyDecision(createSessionMemory('trip-1'), event(T0, 'warning', { closed: 16 }));
    expect(d.incidents).toHaveLength(0);
    expect(d.tripScore).toBe(100);
  });

  it('debounces incidents that arrive within 4 seconds', () => {
    const mem = createSessionMemory('trip-1');
    runSafetyDecision(mem, event(T0, 'danger', { closed: 40 }));
    let d = runSafetyDecision(mem, event(T0 + 3000, 'danger', { closed: 40 }));
    expect(d.incidents).toHaveLength(1);
    d = runSafetyDecision(mem, event(T0 + 4000, 'danger', { closed: 40 }));
    expect(d.incidents).toHaveLength(2);
    expect(d.incidents[0].id).toBe('trip-1:2'); // newest first
    expect(d.tripScore).toBe(100 - 2 * 18);
  });

  it('labels a repeated warning with a long blink as a prolonged blink', () => {
    const mem = createSessionMemory('trip-1');
    const d = feed(mem, [0, 1, 2].map((i) => event(T0 + i * 2000, 'warning', { closed: 25 })));
    expect(d.alertLevel).toBe('warning');
    expect(d.incidents[0]).toMatchObject({ severity: 'warning', reason: 'prolonged_blink' });
    expect(d.tripScore).toBe(92);
  });

  it('never drops the trip score below zero', () => {
    const mem = createSessionMemory('trip-1');
    const events = Array.from({ length: 10 }, (_, i) => event(T0 + i * 5000, 'danger', { closed: 40 }));
    expect(feed(mem, events).tripScore).toBe(0);
  });

  it('caps stored incidents at 50', () => {
    const mem = createSessionMemory('trip-1');
    // 5s apart so the 4s debounce never suppresses one.
    for (let i = 0; i < 60; i++) {
      runSafetyDecision(mem, event(T0 + i * 5000, 'danger', { closed: 40 }));
    }
    expect(mem.incidents).toHaveLength(50);
    expect(mem.incidentCounter).toBe(60);
  });

  it('echoes the calibration flag', () => {
    const d = runSafetyDecision(createSessionMemory('trip-1'), event(T0, 'awake', { calibrated: false }));
    expect(d.calibrated).toBe(false);
  });
});

describe('runSafetyDecision: predictive fatigue (linear regression)', () => {
  it('stays stable with fewer than 4 samples', () => {
    const mem = createSessionMemory('trip-1');
    const d = feed(mem, [0, 1, 2].map((i) => event(T0 + i * 1000, 'awake', { closed: i * 10 })));
    expect(d.predictedRisk).toBe(0);
    expect(d.predictedTrend).toBe('stable');
  });

  it('is stable with zero risk when eyes stay open', () => {
    const mem = createSessionMemory('trip-1');
    const d = feed(mem, [0, 1, 2, 3].map((i) => event(T0 + i * 1000, 'awake', { closed: 0 })));
    expect(d.predictedRisk).toBe(0);
    expect(d.predictedTrend).toBe('stable');
  });

  it('projects a rising closed-frame slope 10s ahead', () => {
    // closed_frames = 0, 1, 2, 3 over 3s → slope 1/s → projected 3 + 10 = 13
    const mem = createSessionMemory('trip-1');
    const d = feed(mem, [0, 1, 2, 3].map((i) => event(T0 + i * 1000, 'awake', { closed: i })));
    expect(d.predictedTrend).toBe('rising');
    expect(d.predictedRisk).toBeCloseTo(Number((13 / 35).toFixed(2)));
  });

  it('flags critical when the projection reaches the danger frame count', () => {
    // slope 3/s → projected 9 + 30 = 39 ≥ 35 → risk clamps to 1
    const mem = createSessionMemory('trip-1');
    const d = feed(mem, [0, 1, 2, 3].map((i) => event(T0 + i * 1000, 'awake', { closed: i * 3 })));
    expect(d.predictedRisk).toBe(1);
    expect(d.predictedTrend).toBe('critical');
  });

  it('reports improving when closed frames are falling', () => {
    const mem = createSessionMemory('trip-1');
    const d = feed(mem, [0, 1, 2, 3].map((i) => event(T0 + i * 1000, 'awake', { closed: 6 - 2 * i })));
    expect(d.predictedTrend).toBe('improving');
    expect(d.predictedRisk).toBe(0);
    expect(d.recommendation).toBe('Nice — alertness improving.');
  });

  it('only uses the last 20 seconds of samples', () => {
    const mem = createSessionMemory('trip-1');
    // Old, steeply rising samples fall outside the lookback; recent ones are flat.
    const old = [0, 1, 2, 3].map((i) => event(T0 + i * 1000, 'awake', { closed: i * 10 }));
    const recent = [0, 1, 2, 3].map((i) => event(T0 + 30_000 + i * 1000, 'awake', { closed: 2 }));
    const d = feed(mem, [...old, ...recent]);
    expect(d.predictedTrend).toBe('stable');
    expect(d.predictedRisk).toBeCloseTo(Number((2 / 35).toFixed(2)));
  });

  it('raises risk when the blink rate collapses even if eyes look fine', () => {
    const mem = createSessionMemory('trip-1');
    const d = feed(mem, [0, 1, 2, 3].map((i) => event(T0 + i * 1000, 'awake', { closed: 0, blink: 5 })));
    expect(d.predictedRisk).toBe(0.75);
    expect(d.predictedTrend).toBe('rising');
  });

  it('gives trend-specific coaching for a warning', () => {
    const mem = createSessionMemory('trip-1');
    const d = feed(mem, [0, 1, 2, 3].map((i) => event(T0 + i * 1000, 'warning', { closed: 15 + i })));
    expect(d.alertLevel).toBe('warning');
    expect(d.predictedTrend).toBe('rising');
    expect(d.coachingTip).toMatch(/drowsiness is climbing/);
  });
});

// ─── Parity with agents/logic.py ────────────────────────────────────────────
// agents/tests/test_logic.py replays the same file, so both implementations
// must agree on every scenario.
interface Scenario {
  name: string;
  events: { t: number; state: DrowsinessState; closed: number; blink?: number }[];
  expected: {
    alertLevel: string;
    tripScore: number;
    predictedRisk: number;
    predictedTrend: string;
    incidentReasons: string[];
  };
}

describe('shared scenarios (TS ↔ Python parity)', () => {
  const { scenarios } = JSON.parse(
    readFileSync(join(__dirname, '..', 'fixtures', 'safety-scenarios.json'), 'utf8'),
  ) as { scenarios: Scenario[] };

  it.each(scenarios.map((s) => [s.name, s] as const))('%s', (_name, scenario) => {
    const mem = createSessionMemory('trip-1');
    const d = feed(
      mem,
      scenario.events.map((e) => event(T0 + e.t, e.state, { closed: e.closed, blink: e.blink })),
    );
    expect({
      alertLevel: d.alertLevel,
      tripScore: d.tripScore,
      predictedRisk: d.predictedRisk,
      predictedTrend: d.predictedTrend,
      incidentReasons: d.incidents.map((i) => i.reason),
    }).toEqual(scenario.expected);
  });
});
