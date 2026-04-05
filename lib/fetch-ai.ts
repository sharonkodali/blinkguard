/**
 * Typed fetch wrapper for BlinkGuard `/api/agent` (Vercel AI SDK + Anthropic on the server).
 * Use this for all client-side AI calls so routes and error handling stay consistent.
 */

const AGENT_PATH = '/api/agent';

export class AgentFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AgentFetchError';
  }
}

export async function fetchAgentJson<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(AGENT_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as T & { error?: string };

  if (!res.ok) {
    throw new AgentFetchError(data.error ?? `Request failed (${res.status})`, res.status);
  }

  return data as T;
}
