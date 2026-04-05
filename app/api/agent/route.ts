import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const body = await request.json();
  const { type, alertCount } = body;

  try {
    if (type === 'traffic') {
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: 'Give a one-sentence realistic traffic advisory for a drowsy driver. Be concise and direct. No intro text.',
        }],
      });
      const traffic = (msg.content[0] as { type: string; text: string }).text;
      return NextResponse.json({ traffic });
    }

    // type === 'drowsy'
    const urgency =
      alertCount >= 5 ? 'EMERGENCY — driver has nearly fallen asleep multiple times, life-threatening' :
      alertCount >= 3 ? 'CRITICAL — driver is dangerously drowsy, must stop immediately' :
      alertCount >= 2 ? 'HIGH — driver is showing repeated drowsiness, pull over soon' :
                        'MODERATE — first drowsiness alert, early warning';

    const prompt = `A driver has triggered ${alertCount} drowsiness alert(s). Urgency level: ${urgency}.

Respond with a JSON object only (no markdown, no extra text):
{
  "traffic": "<one sentence about road conditions and whether to pull over now>",
  "hotel": "<one sentence recommending a rest stop or safe place to stop>",
  "voiceCoach": "<spoken alert matching the urgency — escalate tone, word choice, and forcefulness with alert count; under 15 words; do NOT repeat the same phrasing as previous alerts>",
  "pullOver": ${alertCount >= 3}
}`;

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const json = JSON.parse(text);
    return NextResponse.json(json);
  } catch (err) {
    console.error('Agent route error:', err);
    return NextResponse.json(
      {
        traffic: 'Unable to check traffic right now.',
        hotel: `Rest stop recommended — ${alertCount ?? 0} alert(s) logged.`,
        voiceCoach: 'Wake up! Please pull over safely.',
        pullOver: (alertCount ?? 0) >= 3,
      },
      { status: 200 }
    );
  }
}
