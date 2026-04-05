import { anthropic } from '@ai-sdk/anthropic';
import { generateObject, generateText } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const model = anthropic('claude-haiku-4-5-20251001');

const agentResponseSchema = z.object({
  traffic: z.string(),
  hotel: z.string(),
  voiceCoach: z.string(),
  pullOver: z.boolean(),
});

const summarySchema = z.object({
  headline: z.string(),
  tips: z.array(z.string()).min(2).max(5),
  closingLine: z.string(),
});

function drowsyFallback(alertCount: number) {
  return {
    traffic: 'Unable to check traffic right now.',
    hotel: `Rest stop recommended — ${alertCount ?? 0} alert(s) logged.`,
    voiceCoach: 'Wake up! Please pull over safely.',
    pullOver: (alertCount ?? 0) >= 3,
  };
}

export async function POST(request: Request) {
  const body = await request.json();
  const { type, alertCount, sessionSeconds, avgEar, safetyScore } = body as {
    type?: string;
    alertCount?: number;
    sessionSeconds?: number;
    avgEar?: number;
    safetyScore?: number;
  };

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    if (type === 'traffic') {
      return NextResponse.json({
        traffic: 'Set ANTHROPIC_API_KEY in .env.local (see .env.example), then restart the dev server.',
      });
    }
    if (type === 'summary') {
      return NextResponse.json({
        headline: 'Session summary',
        tips: [
          'Take a short break every two hours on long drives.',
          'If you had alerts, rest before driving again.',
          'Keep the camera framed on your face for reliable readings.',
        ],
        closingLine: 'Thanks for using BlinkGuard — drive rested, drive safe.',
      });
    }
    return NextResponse.json(drowsyFallback(alertCount ?? 0));
  }

  try {
    if (type === 'traffic') {
      const { text } = await generateText({
        model,
        maxOutputTokens: 96,
        prompt:
          'Give a one-sentence realistic traffic advisory for a drowsy driver. Be concise and direct. No intro text.',
      });
      return NextResponse.json({ traffic: text.trim() });
    }

    if (type === 'summary') {
      const { object } = await generateObject({
        model,
        schema: summarySchema,
        prompt: `You are BlinkGuard, a drowsy-driving safety assistant. Write a short end-of-session summary.

Session stats:
- Duration (seconds): ${sessionSeconds ?? 0}
- Drowsiness alerts: ${alertCount ?? 0}
- Average eye openness (EAR, typical open ~0.25–0.45): ${typeof avgEar === 'number' ? avgEar.toFixed(3) : 'unknown'}
- Safety score (0–100, higher is better): ${typeof safetyScore === 'number' ? safetyScore : 'unknown'}

Return:
- headline: one punchy line, max 12 words
- tips: 3–4 short actionable bullet strings (no "1." prefix inside strings)
- closingLine: one encouraging sentence`,
      });
      return NextResponse.json(object);
    }

    const urgency =
      (alertCount ?? 0) >= 5
        ? 'EMERGENCY — driver has nearly fallen asleep multiple times, life-threatening'
        : (alertCount ?? 0) >= 3
          ? 'CRITICAL — driver is dangerously drowsy, must stop immediately'
          : (alertCount ?? 0) >= 2
            ? 'HIGH — driver is showing repeated drowsiness, pull over soon'
            : 'MODERATE — first drowsiness alert, early warning';

    const { object } = await generateObject({
      model,
      schema: agentResponseSchema,
      prompt: `A driver has triggered ${alertCount ?? 0} drowsiness alert(s). Urgency level: ${urgency}.

Respond with JSON matching the schema:
- traffic: one sentence about road conditions and whether to pull over now
- hotel: one sentence recommending a rest stop or safe place to stop (gas station, parking lot, hotel area — be generic if location unknown)
- voiceCoach: spoken alert matching urgency; under 15 words; escalate with alert count
- pullOver: must be ${(alertCount ?? 0) >= 3} (boolean)`,
    });

    return NextResponse.json({
      ...object,
      pullOver: (alertCount ?? 0) >= 3,
    });
  } catch (err) {
    console.error('Agent route error:', err);
    if (type === 'traffic') {
      return NextResponse.json({ traffic: 'Traffic data unavailable right now.' });
    }
    if (type === 'summary') {
      return NextResponse.json({
        headline: 'Drive summary',
        tips: [
          'Take breaks every two hours on long trips.',
          'After repeated alerts, stop and rest before continuing.',
        ],
        closingLine: 'Stay alert and stay safe.',
      });
    }
    return NextResponse.json(drowsyFallback(alertCount ?? 0));
  }
}
