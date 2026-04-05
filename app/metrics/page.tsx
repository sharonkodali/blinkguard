'use client';
/**
 * MetricsPage — real session stats + AI analysis.
 *
 * Everything on this page is derived from actual sessions recorded by the
 * /monitor tab. On mount (and whenever sessions change) we POST them to
 * /api/analyze, which returns deterministic weekly rollups + an AI-written
 * summary, key insights, and per-drive takeaways.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import BottomNav from '@/components/BottomNav';
import {
  getSessionsSnapshot,
  subscribeSessions,
  formatDuration,
  formatSessionDate,
  type SessionData,
} from '@/lib/sessions';
import {
  subscribeLiveSession,
  getLiveSessionSnapshot,
  getLiveSessionServerSnapshot,
} from '@/lib/liveSession';
import {
  subscribeSafetyDecision,
  getSafetyDecisionSnapshot,
  getSafetyDecisionServerSnapshot,
} from '@/lib/safetyDecisionStore';
import type { AlertLevel } from '@/lib/safety-types';

const EMPTY: SessionData[] = [];

// ── Icons ────────────────────────────────────────────────────────────────
const EyeI = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const ClockI = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const AlertI = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4" /><path d="M12 17h.01" />
  </svg>
);
const ActivityI = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);
const Sparkle = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
  </svg>
);

// ── API types (mirror /api/analyze response) ─────────────────────────────
interface WeeklyStats {
  totalSessions: number;
  totalDriveSec: number;
  totalAlerts: number;
  avgDurationSec: number;
  avgAlertsPerSession: number;
  avgSafetyScore: number;
  avgEAR: number;
  fatiguePct: number;
  safestSessionId: string | null;
  riskiestSessionId: string | null;
  weeklyScoreSeries: { day: string; score: number; count: number }[];
  trend: 'improving' | 'stable' | 'declining';
}
interface AnalyzeResponse {
  overallRisk: 'low' | 'moderate' | 'high' | 'critical';
  trend: 'improving' | 'stable' | 'declining';
  weekSummary: string;
  keyInsights: string[];
  recommendations: string[];
  perDrive: { sessionId: string; title: string; insight: string }[];
  stats: WeeklyStats;
  aiPowered: boolean;
}

// ── Fetch.ai helpers ─────────────────────────────────────────────────────
const ALERT_LABEL: Record<AlertLevel, string> = {
  none: 'Monitoring',
  gentle: 'Gentle nudge',
  warning: 'Warning',
  critical: 'Critical',
};
const TREND_LABEL: Record<'improving' | 'stable' | 'rising' | 'critical', string> = {
  improving: 'Alertness improving',
  stable: 'Stable alertness',
  rising: 'Fatigue rising',
  critical: 'Critical fatigue trajectory',
};

function scoreClass(score: number): 'safe' | 'warning' | 'danger' {
  if (score >= 75) return 'safe';
  if (score >= 50) return 'warning';
  return 'danger';
}

function formatClockTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

interface FetchAiPanelProps {
  decision: import('@/lib/safety-types').SafetyDecision | null;
  isLive: boolean;
  lastUpdatedAt: number | null;
}
function FetchAiPanel({ decision, isLive, lastUpdatedAt }: FetchAiPanelProps) {
  if (!decision) {
    return (
      <div className="m-fetch">
        <div className="m-fetch-head">
          <Sparkle />
          <h3>Fetch.ai Safety Orchestrator</h3>
          <span className="m-fetch-badge idle">Idle</span>
        </div>
        <p className="m-fetch-tip m-fetch-tip-idle">
          Start monitoring on Home or Monitor — telemetry will stream to the
          SafetyOrchestratorAgent every 2 seconds and live decisions will
          appear here.
        </p>
      </div>
    );
  }

  const sourceBadgeClass =
    decision.source === 'uagents' ? '' : decision.source === 'mock' ? 'mock' : 'idle';
  const sourceLabel = decision.source === 'uagents' ? 'uAgents' : 'Mock';
  const levelClass =
    decision.alertLevel === 'critical'
      ? 'critical'
      : decision.alertLevel === 'warning'
        ? 'warning'
        : decision.alertLevel === 'gentle'
          ? 'gentle'
          : '';
  const sc = scoreClass(decision.tripScore);
  const topIncidents = decision.incidents.slice(0, 4);

  return (
    <div className="m-fetch">
      <div className="m-fetch-head">
        <Sparkle />
        <h3>Fetch.ai Safety Orchestrator</h3>
        <span className="m-fetch-sub">
          {isLive ? 'Live' : lastUpdatedAt ? `Last seen ${formatClockTime(lastUpdatedAt)}` : ''}
        </span>
        <span className={`m-fetch-badge ${sourceBadgeClass}`}>{sourceLabel}</span>
      </div>

      <div className="m-fetch-hero">
        <div className={`m-fetch-score ${sc}`}>{decision.tripScore}</div>
        <div className="m-fetch-hero-body">
          <span className={`m-fetch-level ${levelClass}`}>
            {ALERT_LABEL[decision.alertLevel]}
          </span>
          <div className="m-fetch-reco">{decision.recommendation}</div>
          {decision.coachingTip && (
            <div className="m-fetch-tip">{decision.coachingTip}</div>
          )}
        </div>
      </div>

      <div className="m-fetch-meta">
        <div className="m-fetch-meta-cell">
          <div className="m-fetch-meta-v">{Math.round(decision.predictedRisk * 100)}%</div>
          <div className="m-fetch-meta-l">Predicted risk</div>
        </div>
        <div className="m-fetch-meta-cell">
          <div className="m-fetch-meta-v m-fetch-meta-v-small">
            {TREND_LABEL[decision.predictedTrend]}
          </div>
          <div className="m-fetch-meta-l">Trend</div>
        </div>
        <div className="m-fetch-meta-cell">
          <div className="m-fetch-meta-v">{decision.calibrated ? 'Yes' : 'No'}</div>
          <div className="m-fetch-meta-l">Calibrated</div>
        </div>
      </div>

      <div className="m-fetch-incidents-head">Incident timeline · {decision.incidents.length}</div>
      {topIncidents.length === 0 ? (
        <div className="m-fetch-inc-empty">No incidents logged this drive — agent is happy.</div>
      ) : (
        topIncidents.map((inc) => (
          <div key={inc.id} className="m-fetch-incident">
            <div className={`m-fetch-inc-bar ${inc.severity}`} />
            <div className="m-fetch-inc-body">
              <div className="m-fetch-inc-msg">{inc.message}</div>
              <div className="m-fetch-inc-meta">
                {formatClockTime(inc.timestamp)} · {inc.reason.replace(/_/g, ' ')} · severity {inc.severity}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

const RISK_COLOR: Record<AnalyzeResponse['overallRisk'], string> = {
  low: 'safe',
  moderate: 'warning',
  high: 'warning',
  critical: 'danger',
};

export default function MetricsPage() {
  const sessions = useSyncExternalStore(
    subscribeSessions,
    getSessionsSnapshot,
    () => EMPTY,
  );

  // Live session snapshot — populated by the drowsiness detector hook while
  // a drive is actively being monitored on Home or /monitor. When no drive is
  // active, `live.isActive` is false and we hide the card.
  const live = useSyncExternalStore(
    subscribeLiveSession,
    getLiveSessionSnapshot,
    getLiveSessionServerSnapshot,
  );

  // Fetch.ai SafetyOrchestratorAgent snapshot — published by `useSafetyAgent`
  // on whichever page currently owns the camera. Survives after monitoring
  // stops so this page can still show the last orchestrator response.
  const safety = useSyncExternalStore(
    subscribeSafetyDecision,
    getSafetyDecisionSnapshot,
    getSafetyDecisionServerSnapshot,
  );
  const decision = safety.decision;

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch AI analysis whenever the session list changes. Key on ids+length so
  // we don't refetch on reference changes that don't affect content.
  const sessionKey = sessions.map((s) => s.id).join(',');
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessions }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AnalyzeResponse;
        if (!cancelled) setAnalysis(data);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [sessionKey, sessions]);

  const stats = analysis?.stats;
  const hasSessions = sessions.length > 0;
  const sortedSessions = [...sessions].sort((a, b) => b.startTime - a.startTime);

  const weekly =
    stats?.weeklyScoreSeries && stats.weeklyScoreSeries.length > 0
      ? stats.weeklyScoreSeries
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => ({
          day,
          score: 0,
          count: 0,
        }));
  const maxBar = Math.max(1, ...weekly.map((d) => d.score));

  return (
    <>
      <style>{`
        .m-wrap { flex: 1; overflow-y: auto; padding-bottom: 5rem; background: var(--ios-background); }
        .m-head { padding: 2rem 1rem 1rem; background: var(--ios-midnight); color: #fff; }
        .m-head h1 { color: #fff; }
        .m-head p  { color: rgba(255,255,255,0.7); font-size: 0.875rem; margin-top: 0.25rem; }
        .m-head-risk { display: inline-flex; align-items: center; gap: 0.375rem; margin-top: 0.75rem; padding: 0.25rem 0.625rem; border-radius: 9999px; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
        .m-head-risk.safe    { background: rgba(16,185,129,0.2);  color: #6ee7b7; }
        .m-head-risk.warning { background: rgba(245,158,11,0.22); color: #fcd34d; }
        .m-head-risk.danger  { background: rgba(239,68,68,0.22);  color: #fca5a5; }

        .m-section { padding: 0 1rem; margin-top: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }

        /* Fetch.ai SafetyOrchestratorAgent panel */
        .m-fetch {
          background: linear-gradient(135deg, #0f1729 0%, #1e293b 100%);
          color: #fff; border-radius: 1rem; padding: 1.1rem 1.1rem 1rem;
          box-shadow: 0 12px 26px -12px rgba(15,23,41,0.55);
          border: 1px solid rgba(148,163,184,0.18);
        }
        .m-fetch-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.8rem; }
        .m-fetch-head svg { width: 1rem; height: 1rem; color: #a7f3d0; }
        .m-fetch-head h3 { color: #fff; font-size: 0.95rem; font-weight: 600; margin: 0; }
        .m-fetch-sub { color: rgba(255,255,255,0.55); font-size: 0.68rem; font-weight: 500; margin-left: auto; }
        .m-fetch-badge {
          font-size: 0.58rem; letter-spacing: 0.08em; text-transform: uppercase;
          padding: 0.18rem 0.5rem; border-radius: 9999px;
          background: rgba(16,185,129,0.18); color: #6ee7b7;
          border: 1px solid rgba(110,231,183,0.35);
        }
        .m-fetch-badge.mock { background: rgba(148,163,184,0.16); color: #cbd5e1; border-color: rgba(203,213,225,0.3); }
        .m-fetch-badge.idle { background: rgba(148,163,184,0.1); color: #94a3b8; border-color: rgba(148,163,184,0.3); }

        .m-fetch-hero { display: flex; align-items: center; gap: 0.875rem; margin-bottom: 0.875rem; }
        .m-fetch-score {
          width: 3.75rem; height: 3.75rem; border-radius: 9999px;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.4rem; font-weight: 700; color: #fff; flex-shrink: 0;
          border: 3px solid rgba(255,255,255,0.2);
        }
        .m-fetch-score.safe    { background: linear-gradient(135deg,#10b981,#059669); }
        .m-fetch-score.warning { background: linear-gradient(135deg,#f59e0b,#d97706); }
        .m-fetch-score.danger  { background: linear-gradient(135deg,#ef4444,#b91c1c); animation: mFetchPulse 1.1s ease-in-out infinite; }
        @keyframes mFetchPulse { 0%,100%{opacity:1} 50%{opacity:0.78} }
        .m-fetch-hero-body { flex: 1; min-width: 0; }
        .m-fetch-level {
          display: inline-flex; align-items: center; gap: 0.35rem;
          font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.1em;
          padding: 0.2rem 0.55rem; border-radius: 9999px;
          background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.18);
          color: #fff; font-weight: 600; margin-bottom: 0.35rem;
        }
        .m-fetch-level.critical { background: rgba(239,68,68,0.3); border-color: rgba(239,68,68,0.5); }
        .m-fetch-level.warning  { background: rgba(245,158,11,0.3); border-color: rgba(245,158,11,0.5); }
        .m-fetch-level.gentle   { background: rgba(110,231,183,0.25); border-color: rgba(110,231,183,0.45); }
        .m-fetch-reco { font-size: 0.88rem; font-weight: 600; line-height: 1.35; color: #fff; }
        .m-fetch-tip  { font-size: 0.72rem; color: rgba(255,255,255,0.75); margin-top: 0.25rem; line-height: 1.4; }

        .m-fetch-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-bottom: 0.875rem; }
        .m-fetch-meta-cell {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 0.625rem; padding: 0.55rem 0.45rem; text-align: center;
        }
        .m-fetch-meta-v { font-size: 0.92rem; font-weight: 700; color: #fff; }
        .m-fetch-meta-l { font-size: 0.56rem; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.6); margin-top: 0.15rem; }
        .m-fetch-meta-v-small { font-size: 0.7rem !important; line-height: 1.2; }
        .m-fetch-tip-idle { color: rgba(255,255,255,0.75); }

        .m-fetch-incidents-head {
          font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.1em;
          color: rgba(255,255,255,0.55); font-weight: 600; margin-bottom: 0.45rem;
        }
        .m-fetch-incident {
          display: flex; align-items: flex-start; gap: 0.55rem;
          padding: 0.55rem 0.65rem; border-radius: 0.625rem;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          margin-bottom: 0.375rem;
        }
        .m-fetch-inc-bar {
          width: 3px; align-self: stretch; border-radius: 99px; flex-shrink: 0;
        }
        .m-fetch-inc-bar.critical { background: #ef4444; }
        .m-fetch-inc-bar.warning  { background: #f59e0b; }
        .m-fetch-inc-bar.gentle   { background: #6ee7b7; }
        .m-fetch-inc-bar.none     { background: #94a3b8; }
        .m-fetch-inc-body { flex: 1; min-width: 0; }
        .m-fetch-inc-msg { font-size: 0.78rem; color: #fff; font-weight: 500; line-height: 1.3; }
        .m-fetch-inc-meta { font-size: 0.62rem; color: rgba(255,255,255,0.55); margin-top: 0.15rem; }
        .m-fetch-inc-empty {
          text-align: center; padding: 0.75rem;
          font-size: 0.72rem; color: rgba(255,255,255,0.55);
          background: rgba(255,255,255,0.04); border-radius: 0.625rem;
          border: 1px dashed rgba(255,255,255,0.12);
        }

        /* Live session card — only shown while a drive is being monitored */
        .m-live {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: #fff; border-radius: 1rem; padding: 1rem 1.1rem;
          box-shadow: 0 10px 20px -8px rgba(16,185,129,0.45);
          display: flex; flex-direction: column; gap: 0.75rem;
        }
        .m-live.warning { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); box-shadow: 0 10px 20px -8px rgba(245,158,11,0.45); }
        .m-live.danger  { background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); box-shadow: 0 10px 20px -8px rgba(239,68,68,0.55); animation: mLivePulse 1.1s ease-in-out infinite; }
        @keyframes mLivePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.88; } }
        .m-live-head { display: flex; align-items: center; gap: 0.5rem; }
        .m-live-dot { width: 0.5rem; height: 0.5rem; border-radius: 9999px; background: #fff; animation: mLiveDot 1.2s ease-in-out infinite; }
        @keyframes mLiveDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .m-live-title { font-weight: 600; font-size: 0.82rem; letter-spacing: 0.02em; }
        .m-live-tag { margin-left: auto; font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.08em; padding: 0.2rem 0.55rem; border-radius: 9999px; background: rgba(255,255,255,0.22); border: 1px solid rgba(255,255,255,0.3); }
        .m-live-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
        .m-live-grid-wide { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-top: 0.5rem; }
        .m-live-cell { background: rgba(255,255,255,0.14); border-radius: 0.625rem; padding: 0.55rem 0.4rem; text-align: center; }
        .m-live-cell .v { font-size: 1.05rem; font-weight: 600; color: #fff; }
        .m-live-cell .l { font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255,255,255,0.85); margin-top: 0.15rem; }

        .m-empty { background: #fff; border: 1px dashed var(--ios-border); border-radius: 1rem; padding: 2rem 1rem; text-align: center; }
        .m-empty h3 { color: var(--ios-midnight); margin-bottom: 0.375rem; }
        .m-empty p  { color: var(--ios-muted-foreground); font-size: 0.875rem; }

        .m-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .m-card { background: #fff; border: 1px solid var(--ios-border); border-radius: 1rem; padding: 1rem; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
        .m-card-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 0.75rem; }
        .m-card-icon { width: 2.25rem; height: 2.25rem; border-radius: 0.75rem; display: flex; align-items: center; justify-content: center; }
        .m-card-icon svg { width: 1rem; height: 1rem; }
        .m-card-icon.safe    { background: rgba(16,185,129,0.1); color: var(--ios-safe); }
        .m-card-icon.warning { background: rgba(245,158,11,0.1); color: var(--ios-warning); }
        .m-card-icon.danger  { background: rgba(239,68,68,0.1);  color: var(--ios-danger); }
        .m-card-val { font-size: 1.5rem; color: var(--ios-midnight); margin-bottom: 0.125rem; }
        .m-card-label { font-size: 0.75rem; color: var(--ios-muted-foreground); }

        .m-ai {
          background: linear-gradient(135deg, #1a2744 0%, #0f1729 100%);
          color: #fff; border-radius: 1rem; padding: 1.25rem;
          box-shadow: 0 10px 20px -5px rgba(0,0,0,0.25);
        }
        .m-ai-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
        .m-ai-head svg { width: 1rem; height: 1rem; color: #a7f3d0; }
        .m-ai-head h3 { color: #fff; font-size: 0.95rem; }
        .m-ai-badge { margin-left: auto; font-size: 0.6rem; letter-spacing: 0.05em; text-transform: uppercase; padding: 0.2rem 0.5rem; border-radius: 9999px; background: rgba(255,255,255,0.1); color: #a7f3d0; border: 1px solid rgba(167,243,208,0.3); }
        .m-ai-badge.off { color: rgba(255,255,255,0.6); border-color: rgba(255,255,255,0.2); }
        .m-ai-summary { font-size: 0.875rem; line-height: 1.5; color: rgba(255,255,255,0.92); margin-bottom: 0.75rem; }
        .m-ai-list { display: flex; flex-direction: column; gap: 0.375rem; }
        .m-ai-list-title { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.55); margin-top: 0.75rem; margin-bottom: 0.25rem; }
        .m-ai-list li { font-size: 0.8rem; color: rgba(255,255,255,0.85); padding-left: 0.875rem; position: relative; line-height: 1.4; }
        .m-ai-list li::before { content: '•'; position: absolute; left: 0; color: #6ee7b7; }
        .m-ai-loading { font-size: 0.8rem; color: rgba(255,255,255,0.6); }

        .m-chart-card { background: #fff; border: 1px solid var(--ios-border); border-radius: 1rem; padding: 1.25rem; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
        .m-chart-title { color: var(--ios-midnight); margin-bottom: 0.25rem; }
        .m-chart-sub   { color: var(--ios-muted-foreground); font-size: 0.75rem; margin-bottom: 1rem; }
        .m-chart { display: flex; align-items: flex-end; justify-content: space-between; height: 10rem; gap: 0.5rem; }
        .m-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
        .m-bar-track { width: 100%; background: var(--ios-background); border-radius: 0.5rem 0.5rem 0 0; position: relative; overflow: hidden; height: 100%; }
        .m-bar-fill {
          position: absolute; bottom: 0; left: 0; right: 0;
          background: linear-gradient(180deg, var(--ios-midnight-light) 0%, var(--ios-midnight) 100%);
          border-radius: 0.5rem 0.5rem 0 0;
          transition: height 0.3s;
        }
        .m-bar-fill.empty { background: rgba(15,23,41,0.08); }
        .m-bar-day { font-size: 0.75rem; color: var(--ios-muted-foreground); }
        .m-bar-val { font-size: 0.65rem; color: var(--ios-muted-foreground); }

        .m-drives { display: flex; flex-direction: column; gap: 0.625rem; }
        .m-drive { background: #fff; border: 1px solid var(--ios-border); border-radius: 0.875rem; padding: 0.875rem 1rem; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
        .m-drive-top { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; margin-bottom: 0.25rem; }
        .m-drive-title { color: var(--ios-midnight); font-weight: 600; font-size: 0.9rem; }
        .m-drive-date  { color: var(--ios-muted-foreground); font-size: 0.7rem; }
        .m-drive-stats { display: flex; gap: 0.75rem; font-size: 0.7rem; color: var(--ios-muted-foreground); margin-bottom: 0.5rem; }
        .m-drive-stats span strong { color: var(--ios-midnight); font-weight: 600; }
        .m-drive-insight { font-size: 0.8rem; line-height: 1.45; color: #334155; }
        .m-section-title { color: var(--ios-midnight); font-size: 0.95rem; font-weight: 600; margin-bottom: 0.5rem; }

        /* EAR / MAR gauge rows */
        .m-gauge-card { background: #fff; border: 1px solid var(--ios-border); border-radius: 1rem; padding: 1rem 1.1rem; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
        .m-gauge-title { color: var(--ios-midnight); font-weight: 600; font-size: 0.85rem; margin-bottom: 0.75rem; }
        .m-gauge-row { display: flex; align-items: center; gap: 0.625rem; margin-bottom: 0.5rem; }
        .m-gauge-label { font-size: 0.7rem; font-weight: 600; color: var(--ios-muted-foreground); width: 3rem; flex-shrink: 0; }
        .m-gauge-track { flex: 1; height: 0.5rem; background: var(--ios-background); border-radius: 99px; overflow: hidden; }
        .m-gauge-fill { height: 100%; border-radius: 99px; transition: width 0.4s; }
        .m-gauge-fill.ear { background: linear-gradient(90deg, #10b981, #059669); }
        .m-gauge-fill.mar { background: linear-gradient(90deg, #f59e0b, #d97706); }
        .m-gauge-val { font-size: 0.72rem; font-weight: 700; color: var(--ios-midnight); width: 2.8rem; text-align: right; flex-shrink: 0; }

        /* Per-drive expanded stats */
        .m-drive-earmar { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.375rem; }
        .m-drive-badge {
          font-size: 0.65rem; font-weight: 700; padding: 0.2rem 0.55rem;
          border-radius: 99px; border: 1px solid;
        }
        .m-drive-badge.ear  { color: #059669; background: rgba(16,185,129,0.08); border-color: rgba(16,185,129,0.3); }
        .m-drive-badge.mar  { color: #d97706; background: rgba(245,158,11,0.08); border-color: rgba(245,158,11,0.3); }
        .m-drive-badge.warn { color: #b45309; background: rgba(245,158,11,0.08); border-color: rgba(245,158,11,0.3); }
        .m-drive-badge.dngr { color: #b91c1c; background: rgba(239,68,68,0.08);  border-color: rgba(239,68,68,0.3); }
        .m-drive-badge.dest { color: #1d4ed8; background: rgba(59,130,246,0.08); border-color: rgba(59,130,246,0.3); }
        .m-drive-badge.agent{ color: #7c3aed; background: rgba(124,58,237,0.08); border-color: rgba(124,58,237,0.3); }
      `}</style>

      <div className="ios-app">
        <div className="m-wrap">
          <div className="m-head">
            <h1>Performance Metrics</h1>
            <p>
              {hasSessions
                ? `${sessions.length} session${sessions.length === 1 ? '' : 's'} analyzed`
                : 'No sessions recorded yet'}
            </p>
            {analysis && hasSessions && (
              <span className={`m-head-risk ${RISK_COLOR[analysis.overallRisk]}`}>
                {analysis.overallRisk} risk · {analysis.trend}
              </span>
            )}
          </div>

          <div className="m-section">
            {/* ── Fetch.ai SafetyOrchestratorAgent ───────────────────────── */}
            <FetchAiPanel decision={decision} isLive={safety.isLive} lastUpdatedAt={safety.lastUpdatedAt} />

            {live.isActive && (
              <div
                className={`m-live ${
                  live.drowsinessState === 'warning'
                    ? 'warning'
                    : live.drowsinessState === 'danger'
                      ? 'danger'
                      : ''
                }`}
              >
                <div className="m-live-head">
                  <span className="m-live-dot" />
                  <span className="m-live-title">Live drive in progress</span>
                  <span className="m-live-tag">
                    {live.drowsinessState === 'awake'
                      ? 'Alert'
                      : live.drowsinessState === 'warning'
                        ? 'Drowsy'
                        : 'Danger'}
                  </span>
                </div>
                <div className="m-live-grid">
                  <div className="m-live-cell">
                    <div className="v">{formatDuration(live.sessionTime)}</div>
                    <div className="l">Drive</div>
                  </div>
                  <div className="m-live-cell">
                    <div className="v">{live.blinkRate}</div>
                    <div className="l">Blinks/min</div>
                  </div>
                  <div className="m-live-cell">
                    <div className="v">{live.faceDetected ? live.ear.toFixed(2) : '—'}</div>
                    <div className="l">EAR</div>
                  </div>
                  <div className="m-live-cell">
                    <div className="v">{live.faceDetected ? live.mar.toFixed(2) : '—'}</div>
                    <div className="l">MAR</div>
                  </div>
                </div>
                <div className="m-live-grid-wide">
                  <div className="m-live-cell">
                    <div className="v">{live.alertCount}</div>
                    <div className="l">Alerts</div>
                  </div>
                  <div className="m-live-cell">
                    <div className="v">{live.warningCount}</div>
                    <div className="l">⚠️ Frames</div>
                  </div>
                  <div className="m-live-cell">
                    <div className="v">{live.dangerCount}</div>
                    <div className="l">🚨 Frames</div>
                  </div>
                  <div className="m-live-cell">
                    <div className="v">{live.faceDetected ? `${live.eyeOpenPct}%` : '—'}</div>
                    <div className="l">Eye Open</div>
                  </div>
                </div>
              </div>
            )}

            {!hasSessions && !live.isActive && !decision ? (
              <div className="m-empty">
                <h3>No drive data yet</h3>
                <p>Start a session on the Monitor tab — your metrics and AI insights will appear here.</p>
              </div>
            ) : !hasSessions ? null : (
              <>
                {/* ── AI Summary ── */}
                <div className="m-ai">
                  <div className="m-ai-head">
                    <Sparkle />
                    <h3>AI Weekly Analysis</h3>
                    <span className={`m-ai-badge ${analysis?.aiPowered ? '' : 'off'}`}>
                      {analysis?.aiPowered ? 'Claude' : 'Offline'}
                    </span>
                  </div>
                  {loading && !analysis ? (
                    <div className="m-ai-loading">Analyzing your drives…</div>
                  ) : error && !analysis ? (
                    <div className="m-ai-loading">Couldn&apos;t reach the analysis service.</div>
                  ) : analysis ? (
                    <>
                      <p className="m-ai-summary">{analysis.weekSummary}</p>
                      {analysis.keyInsights.length > 0 && (
                        <>
                          <div className="m-ai-list-title">Key Insights</div>
                          <ul className="m-ai-list">
                            {analysis.keyInsights.map((k, i) => (
                              <li key={`k-${i}`}>{k}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {analysis.recommendations.length > 0 && (
                        <>
                          <div className="m-ai-list-title">Recommendations</div>
                          <ul className="m-ai-list">
                            {analysis.recommendations.map((r, i) => (
                              <li key={`r-${i}`}>{r}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </>
                  ) : null}
                </div>

                {/* ── Stat cards (real, from /api/analyze) ── */}
                {stats && (
                  <div className="m-grid">
                    <div className="m-card">
                      <div className="m-card-top">
                        <div className="m-card-icon safe"><EyeI /></div>
                      </div>
                      <p className="m-card-val">{stats.totalSessions}</p>
                      <p className="m-card-label">Total Sessions</p>
                    </div>
                    <div className="m-card">
                      <div className="m-card-top">
                        <div className="m-card-icon safe"><ClockI /></div>
                      </div>
                      <p className="m-card-val">{formatDuration(stats.totalDriveSec)}</p>
                      <p className="m-card-label">Total Drive</p>
                    </div>
                    <div className="m-card">
                      <div className="m-card-top">
                        <div className={`m-card-icon ${stats.totalAlerts > 5 ? 'warning' : 'safe'}`}>
                          <AlertI />
                        </div>
                      </div>
                      <p className="m-card-val">{stats.totalAlerts}</p>
                      <p className="m-card-label">Total Alerts</p>
                    </div>
                    <div className="m-card">
                      <div className="m-card-top">
                        <div className={`m-card-icon ${stats.avgSafetyScore < 70 ? 'warning' : 'safe'}`}>
                          <ActivityI />
                        </div>
                      </div>
                      <p className="m-card-val">{stats.avgSafetyScore || '—'}</p>
                      <p className="m-card-label">Avg Safety Score</p>
                    </div>
                    <div className="m-card">
                      <div className="m-card-top">
                        <div className={`m-card-icon ${stats.fatiguePct > 40 ? 'warning' : 'safe'}`}>
                          <ActivityI />
                        </div>
                      </div>
                      <p className="m-card-val">{stats.fatiguePct}%</p>
                      <p className="m-card-label">Fatigue Index</p>
                    </div>
                    <div className="m-card">
                      <div className="m-card-top">
                        <div className="m-card-icon safe"><ClockI /></div>
                      </div>
                      <p className="m-card-val">{formatDuration(stats.avgDurationSec)}</p>
                      <p className="m-card-label">Avg Session</p>
                    </div>
                  </div>
                )}

                {/* ── EAR / MAR overview (per-session gauges) ── */}
                {sortedSessions.some(s => s.avgEAR || s.avgMAR) && (
                  <div className="m-gauge-card">
                    <p className="m-gauge-title">Avg EAR &amp; MAR per session</p>
                    {sortedSessions.slice(0, 5).map((s) => (
                      <div key={s.id}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--ios-muted-foreground)', marginBottom: '0.2rem' }}>
                          {formatSessionDate(s.startTime)}{s.destination ? ` → ${s.destination}` : ''}
                        </div>
                        <div className="m-gauge-row">
                          <span className="m-gauge-label">EAR</span>
                          <div className="m-gauge-track">
                            <div className="m-gauge-fill ear" style={{ width: `${Math.min(100, (s.avgEAR / 0.4) * 100)}%` }} />
                          </div>
                          <span className="m-gauge-val">{s.avgEAR?.toFixed(3) ?? '—'}</span>
                        </div>
                        <div className="m-gauge-row" style={{ marginBottom: '0.75rem' }}>
                          <span className="m-gauge-label">MAR</span>
                          <div className="m-gauge-track">
                            <div className="m-gauge-fill mar" style={{ width: `${Math.min(100, (s.avgMAR / 0.8) * 100)}%` }} />
                          </div>
                          <span className="m-gauge-val">{s.avgMAR?.toFixed(3) ?? '—'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Weekly chart ── */}
                <div className="m-chart-card">
                  <h3 className="m-chart-title">Weekly Safety Score</h3>
                  <p className="m-chart-sub">Average score per day over the last 7 days</p>
                  <div className="m-chart">
                    {weekly.map((d, i) => (
                      <div key={i} className="m-bar-col">
                        <span className="m-bar-val">{d.score || ''}</span>
                        <div className="m-bar-track">
                          <div
                            className={`m-bar-fill ${d.count === 0 ? 'empty' : ''}`}
                            style={{ height: `${(d.score / maxBar) * 100}%` }}
                          />
                        </div>
                        <span className="m-bar-day">{d.day}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Per-drive AI insights ── */}
                <div>
                  <h3 className="m-section-title">Drive-by-drive analysis</h3>
                  <div className="m-drives">
                    {sortedSessions.map((s) => {
                      const insight = analysis?.perDrive.find((p) => p.sessionId === s.id);
                      return (
                        <div key={s.id} className="m-drive">
                          <div className="m-drive-top">
                            <span className="m-drive-title">
                              {insight?.title ?? 'Drive'}
                            </span>
                            <span className="m-drive-date">
                              {formatSessionDate(s.startTime)}
                            </span>
                          </div>
                          <div className="m-drive-stats">
                            <span><strong>{formatDuration(s.duration)}</strong> drive</span>
                            <span><strong>{s.alerts}</strong> alert{s.alerts === 1 ? '' : 's'}</span>
                            {typeof s.safetyScore === 'number' && (
                              <span><strong>{Math.round(s.safetyScore)}</strong>/100</span>
                            )}
                          </div>
                          <div className="m-drive-earmar">
                            {s.avgEAR > 0 && (
                              <span className="m-drive-badge ear">EAR {s.avgEAR.toFixed(3)}</span>
                            )}
                            {s.avgMAR > 0 && (
                              <span className="m-drive-badge mar">MAR {s.avgMAR.toFixed(3)}</span>
                            )}
                            {s.warningCount > 0 && (
                              <span className="m-drive-badge warn">⚠️ {s.warningCount} frames</span>
                            )}
                            {s.dangerCount > 0 && (
                              <span className="m-drive-badge dngr">🚨 {s.dangerCount} frames</span>
                            )}
                            {s.destination && (
                              <span className="m-drive-badge dest">📍 {s.destination}</span>
                            )}
                            {s.agentTripScore != null && (
                              <span className="m-drive-badge agent">Fetch.ai score {s.agentTripScore}</span>
                            )}
                          </div>
                          {insight?.insight && (
                            <p className="m-drive-insight">{insight.insight}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <BottomNav />
      </div>
    </>
  );
}
