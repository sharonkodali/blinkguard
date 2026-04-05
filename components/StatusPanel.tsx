'use client';
import { useEffect, useRef } from 'react';
import type { DrowsinessState } from '@/lib/drowsiness';
import { FRAMES_DANGER } from '@/lib/drowsiness';

interface Props {
  ear: number;
  mar: number;
  closedFrames: number;
  drowsinessState: DrowsinessState;
  faceDetected: boolean;
  alertCount: number;
  sessionTime: number;
}

function formatHMS(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function StatusPanel({
  ear,
  mar: _mar,
  closedFrames,
  drowsinessState,
  faceDetected,
  alertCount,
  sessionTime,
}: Props) {
  const earBarRef = useRef<HTMLDivElement>(null);
  const scoreRingRef = useRef<SVGCircleElement>(null);

  const earPct = Math.min(100, Math.max(0, (ear / 0.5) * 100));
  const hrs = sessionTime / 3600 || 0.0001;
  const alertsPerHour = Math.round(alertCount / hrs);
  const safetyScore = Math.max(0, Math.min(100, 100 - alertCount * 6));
  const scoreKey =
    safetyScore > 65 ? 'ok' : safetyScore > 35 ? 'notice' : 'urgent';
  const scoreLabel =
    safetyScore > 80 ? 'Excellent' : safetyScore > 65 ? 'Good' : safetyScore > 35 ? 'Caution' : 'Rest soon';
  const circumference = 2 * Math.PI * 26;

  const statusTitle =
    drowsinessState === 'awake'
      ? 'Awake & alert'
      : drowsinessState === 'warning'
        ? 'Drowsy detected'
        : 'Critical — pull over';
  const statusSub =
    !faceDetected
      ? 'No face in frame — adjust the camera'
      : drowsinessState === 'awake'
        ? 'Eyes open, attention steady'
        : drowsinessState === 'warning'
          ? 'Eyes closing often — take a break soon'
          : 'Sustained closure — stop when safe';

  useEffect(() => {
    if (!earBarRef.current) return;
    earBarRef.current.style.width = `${earPct}%`;
  }, [earPct]);

  useEffect(() => {
    if (!scoreRingRef.current) return;
    const c =
      scoreKey === 'ok'
        ? 'var(--blue-soft)'
        : scoreKey === 'notice'
          ? 'var(--slate)'
          : 'var(--text-muted)';
    scoreRingRef.current.style.stroke = c;
    scoreRingRef.current.style.strokeDasharray = `${(safetyScore / 100) * circumference} ${circumference}`;
  }, [scoreKey, safetyScore, circumference]);

  const drowsyPct = Math.min(100, (closedFrames / FRAMES_DANGER) * 100);

  return (
    <>
      <style>{`
        .sp-root { display: flex; flex-direction: column; gap: 12px; min-height: 0; }

        .sp-brand {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; flex-shrink: 0;
        }
        .sp-brand-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .sp-brand-mark {
          width: 36px; height: 36px; border-radius: var(--radius-sm);
          background: linear-gradient(145deg, var(--slate), var(--blue-soft));
          display: flex; align-items: center; justify-content: center;
          font-size: 1.1rem; opacity: 0.95;
        }
        .sp-brand-name { font-size: 0.95rem; font-weight: 600; letter-spacing: -0.02em; color: var(--text); }
        .sp-brand-row2 { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
        .sp-live {
          font-size: 0.58rem; font-weight: 600; letter-spacing: 0.14em;
          padding: 3px 8px; border-radius: var(--radius-pill);
          border: 1px solid var(--border-strong); color: var(--blue-soft); background: var(--accent-muted);
        }
        .sp-timer { font-size: 0.78rem; font-variant-numeric: tabular-nums; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }

        .sp-status {
          border-radius: var(--radius); border: 1px solid var(--border); padding: 14px 16px;
          display: flex; align-items: flex-start; gap: 14px; background: var(--surface-inner);
          box-shadow: var(--shadow-card);
        }
        .sp-status.sp-awake   { border-color: rgba(134, 134, 172, 0.22); }
        .sp-status.sp-warning { border-color: rgba(80, 80, 129, 0.55); }
        .sp-status.sp-danger  { border-color: rgba(134, 134, 172, 0.45); }
        .sp-status-icon { font-size: 1.35rem; line-height: 1; flex-shrink: 0; opacity: 0.9; }
        .sp-status-title { font-size: 0.82rem; font-weight: 600; letter-spacing: -0.01em; color: var(--text); }
        .sp-status-sub { font-size: 0.72rem; color: var(--text-muted); margin-top: 4px; line-height: 1.45; }

        .sp-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .sp-metric {
          background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
          padding: 12px 10px; text-align: center; box-shadow: var(--shadow-card);
        }
        .sp-metric-lbl { font-size: 0.52rem; color: var(--text-faint); letter-spacing: 0.12em; margin-bottom: 6px; }
        .sp-metric-val { font-size: 1.05rem; font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--text); line-height: 1.1; }
        .sp-metric-val.sp-m-alert { color: var(--text-muted); }

        .sp-ear {
          background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
          padding: 14px 16px; box-shadow: var(--shadow-card);
        }
        .sp-ear-hdr { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
        .sp-ear-hdr span:first-child { font-size: 0.58rem; letter-spacing: 0.14em; color: var(--text-faint); }
        .sp-ear-hdr span:last-child { font-size: 0.62rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }
        .sp-ear-track { height: 6px; background: rgba(15, 14, 71, 0.35); border-radius: var(--radius-pill); overflow: hidden; }
        .sp-ear-fill {
          height: 100%; border-radius: var(--radius-pill);
          background: linear-gradient(90deg, var(--slate), var(--blue-soft));
          transition: width 0.12s ease;
        }
        .sp-ear-ticks { display: flex; justify-content: space-between; margin-top: 8px; font-size: 0.58rem; color: var(--text-faint); font-family: 'JetBrains Mono', monospace; }

        .sp-score {
          display: flex; align-items: center; gap: 18px;
          background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
          padding: 14px 18px; box-shadow: var(--shadow-card);
        }
        .sp-score-ring { transition: stroke-dasharray 0.45s ease, stroke 0.3s ease; }
        .sp-score-meta-lbl { font-size: 0.54rem; letter-spacing: 0.12em; color: var(--text-faint); margin-bottom: 6px; }
        .sp-score-meta-val { font-size: 1rem; font-weight: 600; color: var(--text); }
        .sp-score-meta-val.notice { color: var(--text-muted); }
        .sp-score-meta-val.urgent { color: var(--blue-soft); }

        .sp-drowse {
          background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
          padding: 10px 12px;
        }
        .sp-drowse-hdr { display: flex; justify-content: space-between; font-size: 0.55rem; color: var(--text-faint); letter-spacing: 0.08em; margin-bottom: 6px; }
        .sp-drowse-track { height: 4px; background: rgba(15, 14, 71, 0.4); border-radius: var(--radius-pill); overflow: hidden; }
        .sp-drowse-fill { height: 100%; border-radius: var(--radius-pill); background: var(--slate); transition: width 0.15s ease; }
      `}</style>

      <div className="sp-root">
        <div className="sp-brand">
          <div className="sp-brand-left">
            <div className="sp-brand-mark">⌁</div>
            <div>
              <div className="sp-brand-name">BlinkGuard</div>
              <div className="sp-brand-row2">
                <span className="sp-live">LIVE</span>
              </div>
            </div>
          </div>
          <span className="sp-timer">{formatHMS(sessionTime)}</span>
        </div>

        <div className={`sp-status sp-${drowsinessState}`}>
          <span className="sp-status-icon" aria-hidden>
            {drowsinessState === 'awake' ? '✓' : drowsinessState === 'warning' ? '!' : '●'}
          </span>
          <div>
            <div className="sp-status-title">{statusTitle}</div>
            <p className="sp-status-sub">{statusSub}</p>
          </div>
        </div>

        <div className="sp-metrics">
          <div className="sp-metric">
            <p className="sp-metric-lbl">EAR</p>
            <p className="sp-metric-val">{ear.toFixed(3)}</p>
          </div>
          <div className="sp-metric">
            <p className="sp-metric-lbl">ALERTS</p>
            <p className="sp-metric-val sp-m-alert">{alertCount}</p>
          </div>
          <div className="sp-metric">
            <p className="sp-metric-lbl">ALERTS/HR</p>
            <p className="sp-metric-val sp-m-alert">{alertsPerHour}</p>
          </div>
        </div>

        <div className="sp-ear">
          <div className="sp-ear-hdr">
            <span>EYE OPENNESS</span>
            <span>{ear.toFixed(3)}</span>
          </div>
          <div className="sp-ear-track">
            <div ref={earBarRef} className="sp-ear-fill" style={{ width: 0 }} />
          </div>
          <div className="sp-ear-ticks">
            <span>0.0</span>
            <span>0.25</span>
            <span>0.5</span>
          </div>
        </div>

        <div className="sp-score">
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
            <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(80,80,129,0.35)" strokeWidth="5" />
            <circle
              ref={scoreRingRef}
              cx="32"
              cy="32"
              r="26"
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              transform="rotate(-90 32 32)"
              className="sp-score-ring"
            />
            <text x="32" y="36" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text)">
              {safetyScore}
            </text>
          </svg>
          <div>
            <p className="sp-score-meta-lbl">SAFETY STATUS</p>
            <p className={`sp-score-meta-val ${scoreKey === 'notice' ? 'notice' : ''} ${scoreKey === 'urgent' ? 'urgent' : ''}`}>
              {scoreLabel}
            </p>
          </div>
        </div>

        <div className="sp-drowse">
          <div className="sp-drowse-hdr">
            <span>Drowsiness build-up</span>
            <span>
              {closedFrames}/{FRAMES_DANGER}
            </span>
          </div>
          <div className="sp-drowse-track">
            <div className="sp-drowse-fill" style={{ width: `${drowsyPct}%` }} />
          </div>
        </div>
      </div>
    </>
  );
}
