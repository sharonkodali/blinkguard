export interface AgentResponse {
  traffic: string;
  hotel: string;
  voiceCoach: string;
  pullOver: boolean;
}

/** AI-generated end-of-session copy (from `/api/agent` type `summary`) */
export interface SessionSummaryAI {
  headline: string;
  tips: string[];
  closingLine: string;
}
