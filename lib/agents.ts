// lib/agents.ts
// BlinkGuard AI Agents — Person B
// Calls the /api/agent route (server-side Claude calls) for smart driver responses.

export interface AgentResponse {
  traffic: string;
  hotel: string;
  voiceCoach: string;
  pullOver: boolean;
}

// ----- Main drowsy agent (calls Claude via API route) -----
export async function runDrowsyAgents(alertCount: number): Promise<AgentResponse> {
  try {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertCount, type: 'drowsy' }),
    });
    return await res.json();
  } catch {
    return {
      traffic: 'Unable to check traffic right now.',
      hotel: `Rest stop recommended — ${alertCount} alert(s) logged.`,
      voiceCoach: 'Wake up! Please pull over safely.',
      pullOver: alertCount >= 3,
    };
  }
}

// ----- Traffic-only agent (polled every 60s) -----
export async function checkTraffic(): Promise<string> {
  try {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'traffic' }),
    });
    const data = await res.json();
    return data.traffic ?? 'Traffic looks clear ahead.';
  } catch {
    return 'Traffic data unavailable.';
  }
}

// ----- Voice alert helper -----
export function speakAlert(message: string) {
  if (typeof window === 'undefined') return;
  const utter = new SpeechSynthesisUtterance(message);
  utter.rate = 1.1;
  utter.pitch = 1.0;
  utter.volume = 1.0;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

// ----- Vibration helper -----
export function vibrateAlert() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate([200, 100, 200, 100, 400]);
  }
}
