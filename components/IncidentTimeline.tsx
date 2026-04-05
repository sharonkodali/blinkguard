'use client';
/**
 * IncidentTimeline — rolling log of safety incidents returned by the agent.
 * Renders as a stack of compact rows, matching the iOS card styling used
 * elsewhere in /monitor.
 */

import type { Incident } from '@/lib/safety-types';

interface Props {
  incidents: Incident[];
}

const SEVERITY_STYLE: Record<string, string> = {
  gentle:   'tl-row-safe',
  warning:  'tl-row-warning',
  critical: 'tl-row-danger',
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 15_000)  return 'just now';
  if (diff < 60_000)  return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3600_000)}h ago`;
}

export default function IncidentTimeline({ incidents }: Props) {
  return (
    <>
      <style>{`
        .tl {
          background: rgba(255,255,255,0.97);
          backdrop-filter: blur(10px);
          border-radius: 1rem;
          padding: 0.875rem 1rem;
          box-shadow: 0 10px 20px -5px rgba(0,0,0,.3);
          display: flex; flex-direction: column; gap: 0.5rem;
          max-height: 11rem; overflow-y: auto;
        }
        .tl-title {
          font-size: 0.65rem; letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--ios-muted-foreground, #64748b);
        }
        .tl-empty { font-size: 0.8rem; color: var(--ios-muted-foreground, #64748b); text-align: center; padding: 0.5rem 0; }

        .tl-row {
          display: flex; align-items: center; gap: 0.625rem;
          padding: 0.5rem 0.625rem; border-radius: 0.625rem;
          border: 1px solid rgba(15,23,41,0.06);
          font-size: 0.8rem;
        }
        .tl-row-safe    { background: rgba(16,185,129,0.05);  border-color: rgba(16,185,129,0.25); }
        .tl-row-warning { background: rgba(245,158,11,0.06);  border-color: rgba(245,158,11,0.3); }
        .tl-row-danger  { background: rgba(239,68,68,0.06);   border-color: rgba(239,68,68,0.3); }

        .tl-dot { width: 0.5rem; height: 0.5rem; border-radius: 9999px; flex-shrink: 0; }
        .tl-dot.gentle   { background: #10b981; }
        .tl-dot.warning  { background: #f59e0b; }
        .tl-dot.critical { background: #ef4444; }

        .tl-main   { flex: 1; color: var(--ios-midnight, #0f1729); }
        .tl-reason { font-size: 0.65rem; color: var(--ios-muted-foreground, #64748b); letter-spacing: 0.02em; }
        .tl-time   { font-size: 0.7rem; color: var(--ios-muted-foreground, #64748b); white-space: nowrap; }
      `}</style>

      <div className="tl">
        <div className="tl-title">Incident Log</div>
        {incidents.length === 0 ? (
          <div className="tl-empty">No incidents yet — drive safely.</div>
        ) : (
          incidents.slice(0, 8).map((inc) => (
            <div key={inc.id} className={`tl-row ${SEVERITY_STYLE[inc.severity] ?? ''}`}>
              <span className={`tl-dot ${inc.severity}`} />
              <div className="tl-main">
                <div>{inc.message}</div>
                <div className="tl-reason">{inc.reason.replaceAll('_', ' ')}</div>
              </div>
              <div className="tl-time">{relativeTime(inc.timestamp)}</div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
