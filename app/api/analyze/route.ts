/**
 * POST /api/analyze — AI-powered analysis of BlinkGuard drive sessions.
 *
 * Takes the full list of sessions recorded on the device and returns:
 *   - weekly rollup stats (derived deterministically from the sessions)
 *   - an AI-written week summary + key insights + per-drive insight per session
 *
 * If there aren't enough sessions, or ANTHROPIC_API_KEY isn't set, the route
 * falls back to deterministic stats with a plain-English summary so the
 * metrics tab never looks broken.
 */

import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const model = anthropic('claude-haiku-4-5-20251001');

// ── Shared shapes ─────────────────────────────────────────────────────────
interface SessionPayload {
  id: string;
  startTime: number;
  duration: number;
  alerts: number;
  avgEAR?: number;
  avgMAR?: number;
  maxClosedFrames?: number;
  safetyScore?: number;
}

// Matches the schema Claude is asked to fill. Per-drive insights are keyed by
// session id so the UI can render them alongside each drive card.
const analysisSchema = z.object({
  overallRisk: z.enum(['low', 'moderate', 'high', 'critical']),
  trend: z.enum(['improving', 'stable', 'declining']),
  weekSummary: z.string().describe('2-3 sentence plain-English summary of the week'),
  keyInsights: z.array(z.string()).min(2).max(5),
  recommendations: z.array(z.string()).min(2).max(5),
  perDrive: z
    .array(
      z.object({
        sessionId: z.string(),
        title: z.string().describe('Short 2-4 word label for the drive'),
        insight: z.string().describe('1-2 sentence takeaway for this drive'),
      }),
    )
    .describe('One entry per session analyzed'),
});

// ── Deterministic stats (run regardless of AI) ───────────────────────────
function computeWeeklyStats(sessions: SessionPayload[]) {
  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      totalDriveSec: 0,
      totalAlerts: 0,
      avgDurationSec: 0,
      avgAlertsPerSession: 0,
      avgSafetyScore: 0,
      avgEAR: 0,
      fatiguePct: 0,
      safestSessionId: null as string | null,
      riskiestSessionId: null as string | null,
      weeklyScoreSeries: [] as { day: string; score: number; count: number }[],
      trend: 'stable' as 'improving' | 'stable' | 'declining',
    };
  }

  const totalSessions = sessions.length;
  const totalDriveSec = sessions.reduce((s, x) => s + (x.duration || 0), 0);
  const totalAlerts = sessions.reduce((s, x) => s + (x.alerts || 0), 0);
  const avgEAR =
    sessions.reduce((s, x) => s + (x.avgEAR ?? 0), 0) / totalSessions || 0;
  const scored = sessions.filter((s) => typeof s.safetyScore === 'number');
  const avgSafetyScore =
    scored.length > 0
      ? Math.round(
          scored.reduce((a, x) => a + (x.safetyScore as number), 0) / scored.length,
        )
      : 0;
  const fatiguePct = Math.round((1 - Math.min(1, avgEAR / 0.3)) * 100);

  // Safest / riskiest: use safetyScore if present, otherwise invert alert count.
  const withMetric = sessions.map((s) => ({
    id: s.id,
    score:
      typeof s.safetyScore === 'number'
        ? s.safetyScore
        : 100 - Math.min(100, (s.alerts || 0) * 10),
  }));
  const safestSessionId = withMetric.reduce((a, b) => (b.score > a.score ? b : a)).id;
  const riskiestSessionId = withMetric.reduce((a, b) => (b.score < a.score ? b : a)).id;

  // Last-7-days bucket, Mon..Sun relative to today.
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const buckets: Record<number, { total: number; count: number }> = {};
  for (let i = 0; i < 7; i++) buckets[i] = { total: 0, count: 0 };
  const now = Date.now();
  const weekAgo = now - 7 * 86400_000;
  for (const s of sessions) {
    if (s.startTime < weekAgo) continue;
    const d = new Date(s.startTime).getDay(); // 0..6
    const score =
      typeof s.safetyScore === 'number'
        ? s.safetyScore
        : 100 - Math.min(100, (s.alerts || 0) * 10);
    buckets[d].total += score;
    buckets[d].count += 1;
  }
  // Re-order to Mon..Sun for display.
  const orderedDays = [1, 2, 3, 4, 5, 6, 0];
  const weeklyScoreSeries = orderedDays.map((idx) => ({
    day: dayLabels[idx],
    score: buckets[idx].count > 0 ? Math.round(buckets[idx].total / buckets[idx].count) : 0,
    count: buckets[idx].count,
  }));

  // Trend: compare last 3 vs earlier sessions by alert rate.
  const sorted = [...sessions].sort((a, b) => a.startTime - b.startTime);
  const recent = sorted.slice(-3);
  const earlier = sorted.slice(0, -3);
  const recentRate =
    recent.reduce((s, x) => s + (x.alerts || 0), 0) / Math.max(1, recent.length);
  const earlierRate =
    earlier.length > 0
      ? earlier.reduce((s, x) => s + (x.alerts || 0), 0) / earlier.length
      : recentRate;
  const trend: 'improving' | 'stable' | 'declining' =
    recentRate < earlierRate * 0.8
      ? 'improving'
      : recentRate > earlierRate * 1.2
        ? 'declining'
        : 'stable';

  return {
    totalSessions,
    totalDriveSec,
    totalAlerts,
    avgDurationSec: Math.round(totalDriveSec / totalSessions),
    avgAlertsPerSession: Number((totalAlerts / totalSessions).toFixed(2)),
    avgSafetyScore,
    avgEAR: Number(avgEAR.toFixed(3)),
    fatiguePct,
    safestSessionId,
    riskiestSessionId,
    weeklyScoreSeries,
    trend,
  };
}

function deterministicFallback(sessions: SessionPayload[]) {
  const stats = computeWeeklyStats(sessions);
  const risk =
    stats.totalAlerts > 20
      ? 'critical'
      : stats.totalAlerts > 10
        ? 'high'
        : stats.totalAlerts > 5
          ? 'moderate'
          : 'low';

  const perDrive = sessions.map((s) => {
    const score =
      typeof s.safetyScore === 'number'
        ? s.safetyScore
        : 100 - Math.min(100, s.alerts * 10);
    const title =
      score >= 90
        ? 'Clean drive'
        : score >= 75
          ? 'Mostly steady'
          : score >= 60
            ? 'Fatigue spikes'
            : 'Risky session';
    const mins = Math.round(s.duration / 60);
    return {
      sessionId: s.id,
      title,
      insight:
        `${mins}m drive with ${s.alerts} alert${s.alerts === 1 ? '' : 's'}. ` +
        (score >= 85
          ? 'Attention stayed well within safe limits.'
          : score >= 70
            ? 'Some fatigue signals — consider shorter stints or more breaks.'
            : 'Multiple warnings fired. Rest before your next drive.'),
    };
  });

  return {
    overallRisk: risk as 'low' | 'moderate' | 'high' | 'critical',
    trend: stats.trend,
    weekSummary:
      stats.totalSessions === 0
        ? 'No drives recorded yet. Start a monitoring session to build your safety profile.'
        : `Logged ${stats.totalSessions} drive${stats.totalSessions === 1 ? '' : 's'} this week ` +
          `averaging ${Math.round(stats.avgDurationSec / 60)} minutes and ${stats.avgAlertsPerSession} alert${stats.avgAlertsPerSession === 1 ? '' : 's'} per session. ` +
          `Overall trend is ${stats.trend}.`,
    keyInsights:
      stats.totalSessions === 0
        ? ['Complete a monitoring session to unlock insights.']
        : [
            `Average safety score: ${stats.avgSafetyScore}/100`,
            `Average eye aspect ratio: ${stats.avgEAR.toFixed(2)}`,
            `Fatigue index: ${stats.fatiguePct}%`,
          ],
    recommendations: [
      'Get 7–8 hours of sleep before a long drive.',
      'Take a 10-minute break every 90 minutes on the road.',
      'Avoid driving during your natural low-energy window.',
    ],
    perDrive,
    stats,
    aiPowered: false,
  };
}

// ── Route ─────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  let sessions: SessionPayload[] = [];
  try {
    const body = (await request.json()) as { sessions?: SessionPayload[] };
    sessions = body.sessions ?? [];
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const stats = computeWeeklyStats(sessions);

  // Not enough data or no API key → deterministic fallback.
  if (sessions.length < 1 || !process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(deterministicFallback(sessions));
  }

  try {
    const prompt = `You are a sleep-medicine expert analyzing BlinkGuard driver drowsiness telemetry.

Aggregate stats for this driver (${stats.totalSessions} sessions):
- Total drive time: ${Math.round(stats.totalDriveSec / 60)} minutes
- Total drowsiness alerts: ${stats.totalAlerts}
- Average session length: ${Math.round(stats.avgDurationSec / 60)} minutes
- Average safety score: ${stats.avgSafetyScore}/100
- Average eye aspect ratio (EAR): ${stats.avgEAR} (lower = eyes more closed)
- Trend vs earlier sessions: ${stats.trend}

Per-session details (id, startTime ISO, duration sec, alerts, avgEAR, maxClosedFrames, safetyScore):
${sessions
  .map(
    (s) =>
      `- id=${s.id} at=${new Date(s.startTime).toISOString()} dur=${s.duration}s alerts=${s.alerts} ear=${s.avgEAR?.toFixed(3) ?? 'n/a'} maxClosed=${s.maxClosedFrames ?? 'n/a'} score=${s.safetyScore ?? 'n/a'}`,
  )
  .join('\n')}

Respond with:
- overallRisk: one of low/moderate/high/critical based on alert density and EAR
- trend: improving / stable / declining
- weekSummary: 2–3 sentences, direct and specific to the numbers above (no filler)
- keyInsights: 2–5 concrete observations about THIS driver (time-of-day patterns, session length, fatigue spikes)
- recommendations: 2–5 specific, actionable suggestions
- perDrive: EXACTLY one entry per session above, keyed by the exact session id. Each with a short 2–4 word title and a 1–2 sentence insight grounded in that drive's numbers.

Be concrete. Reference actual numbers. Do not use filler language.`;

    const { object } = await generateObject({
      model,
      schema: analysisSchema,
      prompt,
    });

    // Guarantee a perDrive entry for every session, even if the model skips one.
    const byId = new Map(object.perDrive.map((p) => [p.sessionId, p]));
    const perDrive = sessions.map((s) => {
      const hit = byId.get(s.id);
      if (hit) return hit;
      const score = s.safetyScore ?? 100 - Math.min(100, s.alerts * 10);
      return {
        sessionId: s.id,
        title: score >= 80 ? 'Steady drive' : 'Fatigue spikes',
        insight: `${Math.round(s.duration / 60)}m, ${s.alerts} alert${s.alerts === 1 ? '' : 's'}.`,
      };
    });

    return NextResponse.json({ ...object, perDrive, stats, aiPowered: true });
  } catch (err) {
    console.error('analyze route: AI call failed', err);
    return NextResponse.json(deterministicFallback(sessions));
  }
}
