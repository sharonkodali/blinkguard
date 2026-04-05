'use client';
/**
 * SafetyHUD — compact iOS-style panel that surfaces the latest SafetyDecision
 * from the Fetch.ai agent. Shows alert level, recommendation, trip score,
 * predictive-risk bar, calibration state, and an inline "uAgents / mock" badge
 * so it's obvious at demo time which backend is live.
 *
 * Design intentionally matches the iOS theme in `app/globals.css` (.ios-app
 * tokens — var(--ios-*)) so it drops into the existing /monitor chrome.
 */

import type { SafetyDecision } from '@/lib/safety-types';

interface Props {
  decision: SafetyDecision | null;
  /** Passthrough — shown in the calibration chip. */
  calibrated: boolean;
}

const LEVEL_CLASS: Record<string, string> = {
  none:     'hud-level-safe',
  gentle:   'hud-level-safe',
  warning:  'hud-level-warning',
  critical: 'hud-level-danger',
};
const LEVEL_LABEL: Record<string, string> = {
  none:     'All clear',
  gentle:   'Heads up',
  warning:  'Fatigue rising',
  critical: 'Critical',
};

const TREND_ICON: Record<string, string> = {
  improving: '↘︎',
  stable:    '→',
  rising:    '↗︎',
  critical:  '⚠︎',
};

export default function SafetyHUD({ decision, calibrated }: Props) {
  const level = decision?.alertLevel ?? 'none';
  const levelClass = LEVEL_CLASS[level] ?? 'hud-level-safe';
  const levelLabel = LEVEL_LABEL[level] ?? 'Standby';
  const score = decision?.tripScore ?? 100;
  const riskPct = Math.round((decision?.predictedRisk ?? 0) * 100);
  const trend = decision?.predictedTrend ?? 'stable';
  const source = decision?.source ?? 'mock';

  return (
    <>
      <style>{`
        .hud {
          background: rgba(255,255,255,0.97);
          backdrop-filter: blur(10px);
          border-radius: 1rem;
          padding: 0.875rem 1rem;
          box-shadow: 0 10px 20px -5px rgba(0,0,0,.3);
          color: var(--ios-midnight, #0f1729);
          font-size: 0.875rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .hud-top { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
        .hud-level-pill {
          display: inline-flex; align-items: center; gap: 0.375rem;
          padding: 0.25rem 0.625rem; border-radius: 9999px;
          font-size: 0.7rem; font-weight: 600; letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .hud-level-safe    { background: rgba(16,185,129,0.15); color: #047857; }
        .hud-level-warning { background: rgba(245,158,11,0.18); color: #b45309; }
        .hud-level-danger  { background: rgba(239,68,68,0.15);  color: #b91c1c; }
        .hud-level-pill::before { content: ''; width: 0.4rem; height: 0.4rem; border-radius: 9999px; background: currentColor; }

        .hud-source {
          font-size: 0.625rem; letter-spacing: 0.05em;
          padding: 0.125rem 0.5rem; border-radius: 9999px;
          text-transform: uppercase;
          border: 1px solid rgba(15,23,41,0.12);
          color: rgba(15,23,41,0.6);
          background: rgba(15,23,41,0.04);
        }
        .hud-source.live { color: #065f46; border-color: rgba(16,185,129,0.4); background: rgba(16,185,129,0.08); }

        .hud-rec { line-height: 1.4; color: var(--ios-midnight, #0f1729); font-weight: 500; }
        .hud-tip { color: var(--ios-muted-foreground, #64748b); font-size: 0.78rem; line-height: 1.4; }

        .hud-row { display: flex; align-items: center; gap: 0.75rem; }
        .hud-metric { flex: 1; }
        .hud-metric-label { font-size: 0.65rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ios-muted-foreground, #64748b); }
        .hud-metric-value { font-size: 1.1rem; font-weight: 600; color: var(--ios-midnight, #0f1729); }
        .hud-divider { width: 1px; align-self: stretch; background: rgba(15,23,41,0.08); }

        .hud-bar-wrap { height: 0.375rem; background: rgba(15,23,41,0.08); border-radius: 9999px; overflow: hidden; }
        .hud-bar { height: 100%; border-radius: 9999px; transition: width .4s ease, background-color .4s ease; }
        .hud-bar.low    { background: #10b981; }
        .hud-bar.mid    { background: #f59e0b; }
        .hud-bar.high   { background: #ef4444; }

        .hud-footer { display: flex; align-items: center; justify-content: space-between; font-size: 0.7rem; color: var(--ios-muted-foreground, #64748b); }
        .hud-calib { display: inline-flex; align-items: center; gap: 0.25rem; }
        .hud-calib.ok::before   { content: '●'; color: #10b981; }
        .hud-calib.none::before { content: '○'; color: #94a3b8; }
      `}</style>

      <div className="hud" role="status" aria-live="polite">
        <div className="hud-top">
          <span className={`hud-level-pill ${levelClass}`}>{levelLabel}</span>
          <span className={`hud-source ${source === 'uagents' ? 'live' : ''}`}>
            {source === 'uagents' ? 'Fetch.ai live' : 'Mock mode'}
          </span>
        </div>

        <div className="hud-rec">
          {decision?.recommendation ?? 'Starting Fetch.ai safety agent…'}
        </div>
        {decision?.coachingTip && <div className="hud-tip">{decision.coachingTip}</div>}

        <div className="hud-row">
          <div className="hud-metric">
            <div className="hud-metric-label">Trip Score</div>
            <div className="hud-metric-value">{score}<span style={{ fontSize: '0.75rem', color: 'var(--ios-muted-foreground)' }}>/100</span></div>
          </div>
          <div className="hud-divider" />
          <div className="hud-metric">
            <div className="hud-metric-label">Predicted Risk</div>
            <div className="hud-metric-value">
              {riskPct}% <span style={{ fontSize: '0.85rem', color: 'var(--ios-muted-foreground)' }}>{TREND_ICON[trend]} {trend}</span>
            </div>
            <div className="hud-bar-wrap" style={{ marginTop: '0.375rem' }}>
              <div
                className={`hud-bar ${riskPct < 40 ? 'low' : riskPct < 75 ? 'mid' : 'high'}`}
                style={{ width: `${Math.max(4, riskPct)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="hud-footer">
          <span className={`hud-calib ${calibrated ? 'ok' : 'none'}`}>
            {calibrated ? 'Baseline calibrated' : 'No baseline yet'}
          </span>
          <span>{decision?.incidents.length ?? 0} incident{(decision?.incidents.length ?? 0) === 1 ? '' : 's'}</span>
        </div>
      </div>
    </>
  );
}
