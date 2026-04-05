// BlinkGuard AI agents — all model calls go through `/api/agent` (server: Vercel AI SDK).

import type { AgentResponse, SessionSummaryAI } from '@/lib/agent-types';
import { fetchAgentJson } from '@/lib/fetch-ai';

export type { AgentResponse, SessionSummaryAI } from '@/lib/agent-types';
export { AgentFetchError, fetchAgentJson } from '@/lib/fetch-ai';

export async function runDrowsyAgents(alertCount: number): Promise<AgentResponse> {
  try {
    return await fetchAgentJson<AgentResponse>({ alertCount, type: 'drowsy' });
  } catch {
    return {
      traffic: 'Unable to check traffic right now.',
      hotel: `Rest stop recommended — ${alertCount} alert(s) logged.`,
      voiceCoach: 'Wake up! Please pull over safely.',
      pullOver: alertCount >= 3,
    };
  }
}

export async function checkTraffic(): Promise<string> {
  try {
    const data = await fetchAgentJson<{ traffic: string }>({ type: 'traffic' });
    return data.traffic ?? 'Traffic looks clear ahead.';
  } catch {
    return 'Traffic data unavailable.';
  }
}

/** AI-written session wrap-up for the Summary tab (uses `fetchAgentJson`). */
export async function fetchSessionSummaryAI(params: {
  sessionSeconds: number;
  alertCount: number;
  avgEar: number;
  safetyScore: number;
}): Promise<SessionSummaryAI> {
  try {
    return await fetchAgentJson<SessionSummaryAI>({
      type: 'summary',
      sessionSeconds: params.sessionSeconds,
      alertCount: params.alertCount,
      avgEar: params.avgEar,
      safetyScore: params.safetyScore,
    });
  } catch {
    return {
      headline: 'Session complete',
      tips: [
        'Take a short break every two hours on long drives.',
        'If alerts repeated, rest before your next trip.',
        'Keep the camera on your face for the best readings.',
      ],
      closingLine: 'Thanks for using BlinkGuard.',
    };
  }
}

export function speakAlert(message: string) {
  if (typeof window === 'undefined') return;
  const utter = new SpeechSynthesisUtterance(message);
  utter.rate = 1.1;
  utter.pitch = 1.0;
  utter.volume = 1.0;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

export function vibrateAlert() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate([200, 100, 200, 100, 400]);
  }
}
