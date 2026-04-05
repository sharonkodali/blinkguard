'use client';
import { useEffect, useReducer, useRef, useState } from 'react';

interface AlertLog {
  id: number;
  time: string;
  type: 'drowsy' | 'yawn';
  ear: number;
}

type AlertAction = { type: 'ADD'; alert: AlertLog };

function alertReducer(state: AlertLog[], action: AlertAction): AlertLog[] {
  return [action.alert, ...state].slice(0, 20);
}

interface DashboardProps {
  ear: number;
  isDrowsy: boolean;
  isYawning?: boolean;
}

export default function Dashboard({ ear, isDrowsy, isYawning = false }: DashboardProps) {
  const [alertLog, dispatchAlert]         = useReducer(alertReducer, []);
  const [sessionStart]                    = useState(() => Date.now());
  const [elapsed, setElapsed]             = useState('00:00');
  const [alertsPerHour, setAlertsPerHour] = useState(0);
  const lastAlertRef                      = useRef<number>(0);
  const earBarRef                         = useRef<HTMLDivElement>(null);
  const scoreRingRef                      = useRef<SVGCircleElement>(null);
  const alertLogLenRef                    = useRef(0);

  useEffect(() => {
    const iv = setInterval(() => {
      const s   = Math.floor((Date.now() - sessionStart) / 1000);
      const m   = Math.floor(s / 60).toString().padStart(2, '0');
      const sec = (s % 60).toString().padStart(2, '0');
      setElapsed(`${m}:${sec}`);
      const hrs = s / 3600 || 0.001;
      setAlertsPerHour(Math.round(alertLogLenRef.current / hrs));
    }, 1000);
    return () => clearInterval(iv);
  }, [sessionStart]);

  useEffect(() => {
    if (!(isDrowsy || isYawning) || Date.now() - lastAlertRef.current <= 3000) return;
    lastAlertRef.current = Date.now();
    const timeStr   = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const alertType: 'drowsy' | 'yawn' = isDrowsy ? 'drowsy' : 'yawn';
    dispatchAlert({ type: 'ADD', alert: { id: Date.now(), time: timeStr, type: alertType, ear: parseFloat(ear.toFixed(3)) } });
    alertLogLenRef.current += 1;
  }, [isDrowsy, isYawning, ear]);

  const earPct      = Math.min(100, Math.max(0, (ear / 0.5) * 100));
  const earColor    = ear < 0.2 ? '#f87171' : ear < 0.28 ? '#fbbf24' : '#8686AC';
  const earLabel    = ear < 0.2 ? 'CLOSED' : ear < 0.28 ? 'HEAVY' : 'OPEN';
  const earStateKey = ear < 0.2 ? 'danger' : ear < 0.28 ? 'warning' : 'ok';
  const safetyScore = Math.max(0, 100 - alertLog.length * 8);
  const scoreKey    = safetyScore > 60 ? 'ok' : safetyScore > 30 ? 'warning' : 'danger';
  const scoreLabel  = safetyScore > 80 ? 'Excellent' : safetyScore > 60 ? 'Good' : safetyScore > 30 ? 'Caution' : 'Pull Over';
  const stateColor  = isDrowsy ? 'danger' : isYawning ? 'warning' : 'ok';
  const circumference = 150.8;

  useEffect(() => {
    if (!earBarRef.current) return;
    earBarRef.current.style.width      = `${earPct}%`;
    earBarRef.current.style.background = `linear-gradient(90deg, #f87171, ${earColor})`;
  }, [earPct, earColor]);

  useEffect(() => {
    if (!scoreRingRef.current) return;
    const c = scoreKey === 'ok' ? '#8686AC' : scoreKey === 'warning' ? '#fbbf24' : '#f87171';
    scoreRingRef.current.style.stroke          = c;
    scoreRingRef.current.style.strokeDasharray = `${(safetyScore / 100) * circumference} ${circumference}`;
  }, [scoreKey, safetyScore]);

  return (
    <>
      <style>{`
        .db { display:flex; flex-direction:column; gap:10px; }

        .db-banner { border-radius:var(--radius-sm); border:1px solid; padding:11px 14px; display:flex; align-items:center; gap:12px; transition:all 0.3s; }
        .db-banner-ok      { background:rgba(134,134,172,0.07); border-color:var(--accent-border); }
        .db-banner-warning { background:rgba(251,191,36,0.07);  border-color:rgba(251,191,36,0.25); animation:db-pulse 1.2s ease-in-out infinite; }
        .db-banner-danger  { background:rgba(248,113,113,0.07); border-color:rgba(248,113,113,0.25); animation:db-pulse 0.8s ease-in-out infinite; }
        @keyframes db-pulse { 0%,100%{opacity:1} 50%{opacity:0.65} }
        .db-banner-icon  { font-size:1.4rem; flex-shrink:0; }
        .db-banner-title { font-size:0.78rem; font-weight:700; letter-spacing:0.06em; }
        .db-banner-sub   { font-size:0.68rem; color:var(--text-muted); margin-top:2px; }

        .db-col-ok      { color:var(--blue-soft); }
        .db-col-warning { color:var(--amber); }
        .db-col-danger  { color:var(--red); }

        .db-metrics { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
        .db-metric  { background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px 8px; text-align:center; }
        .db-metric-lbl { font-size:0.55rem; color:var(--text-faint); letter-spacing:0.1em; margin-bottom:4px; }
        .db-metric-val { font-size:1.15rem; font-family:'JetBrains Mono',monospace; font-weight:700; line-height:1; }
        .db-val-ear  { color:var(--blue-soft); }
        .db-val-alrt { color:var(--amber); }
        .db-val-rate { color:var(--blue-soft); }

        .db-ear { background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px 14px; }
        .db-ear-hdr   { display:flex; justify-content:space-between; font-size:0.6rem; color:var(--text-faint); letter-spacing:0.09em; margin-bottom:8px; }
        .db-ear-track { height:4px; background:var(--surface3); border-radius:99px; overflow:hidden; }
        .db-ear-fill  { height:100%; border-radius:99px; transition:width 0.15s ease, background 0.3s ease; }
        .db-ear-lbls  { display:flex; justify-content:space-between; font-size:0.55rem; color:var(--text-faint); margin-top:5px; }

        .db-score      { background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px 14px; display:flex; align-items:center; gap:14px; }
        .db-score-ring { transition:stroke-dasharray 0.5s ease, stroke 0.3s ease; }
        .db-score-lbl  { font-size:0.55rem; color:var(--text-faint); letter-spacing:0.1em; margin-bottom:4px; }
        .db-score-val      { font-size:0.82rem; font-weight:700; }
        .db-score-val-ok      { color:var(--blue-soft); }
        .db-score-val-warning { color:var(--amber); }
        .db-score-val-danger  { color:var(--red); }

        .db-log      { background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px 14px; }
        .db-log-hdr  { font-size:0.6rem; color:var(--text-faint); letter-spacing:0.1em; margin-bottom:9px; }
        .db-log-empty { font-size:0.72rem; color:var(--text-faint); text-align:center; padding:8px 0; }
        .db-log-list { display:flex; flex-direction:column; gap:5px; max-height:150px; overflow-y:auto; }
        .db-log-row  { display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:6px; font-size:0.65rem; border:1px solid; }
        .db-row-drowsy { background:rgba(248,113,113,0.05); border-color:rgba(248,113,113,0.18); }
        .db-row-yawn   { background:rgba(251,191,36,0.05);  border-color:rgba(251,191,36,0.18); }
        .db-log-time       { color:var(--text-muted); }
        .db-log-type-drowsy { flex:1; font-weight:700; color:var(--red); letter-spacing:0.05em; }
        .db-log-type-yawn   { flex:1; font-weight:700; color:var(--amber); letter-spacing:0.05em; }
        .db-log-ear { color:var(--text-faint); }
      `}</style>

      <div className="db">

        {/* Status banner */}
        <div className={`db-banner db-banner-${stateColor}`}>
          <span className="db-banner-icon">
            {isDrowsy ? '🚨' : isYawning ? '😮' : '✅'}
          </span>
          <div>
            <p className={`db-banner-title db-col-${stateColor}`}>
              {isDrowsy ? 'DROWSINESS DETECTED' : isYawning ? 'YAWN DETECTED' : 'DRIVER ALERT'}
            </p>
            <p className="db-banner-sub">
              {isDrowsy ? 'Eyes closed too long — take a break' : isYawning ? 'Fatigue building up' : 'Eyes open — stay safe'}
            </p>
          </div>
        </div>

        {/* Metrics */}
        <div className="db-metrics">
          <div className="db-metric">
            <p className="db-metric-lbl">EAR</p>
            <p className="db-metric-val db-val-ear">{ear.toFixed(3)}</p>
          </div>
          <div className="db-metric">
            <p className="db-metric-lbl">ALERTS</p>
            <p className="db-metric-val db-val-alrt">{alertLog.length}</p>
          </div>
          <div className="db-metric">
            <p className="db-metric-lbl">ALERTS/HR</p>
            <p className="db-metric-val db-val-rate">{alertsPerHour}</p>
          </div>
        </div>

        {/* EAR meter */}
        <div className="db-ear">
          <div className="db-ear-hdr">
            <span>EYE OPENNESS</span>
            <span className={`db-col-${earStateKey}`}>{earLabel}</span>
          </div>
          <div className="db-ear-track">
            <div ref={earBarRef} className="db-ear-fill" />
          </div>
          <div className="db-ear-lbls">
            <span>0.0</span><span>0.25</span><span>0.5</span>
          </div>
        </div>

        {/* Safety score */}
        <div className="db-score">
          <svg width="56" height="56" viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="24" fill="none" stroke="var(--surface3)" strokeWidth="5" />
            <circle
              ref={scoreRingRef}
              cx="30" cy="30" r="24" fill="none" strokeWidth="5"
              strokeLinecap="round" transform="rotate(-90 30 30)"
              className="db-score-ring"
            />
            <text x="30" y="34" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text)">{safetyScore}</text>
          </svg>
          <div>
            <p className="db-score-lbl">SAFETY SCORE</p>
            <p className={`db-score-val db-score-val-${scoreKey}`}>{scoreLabel}</p>
          </div>
        </div>

        {/* Alert log */}
        <div className="db-log">
          <p className="db-log-hdr">ALERT LOG — {elapsed}</p>
          {alertLog.length === 0 ? (
            <p className="db-log-empty">No alerts yet</p>
          ) : (
            <div className="db-log-list">
              {alertLog.map(a => (
                <div key={a.id} className={`db-log-row db-row-${a.type}`}>
                  <span>{a.type === 'drowsy' ? '😴' : '😮'}</span>
                  <span className="db-log-time">{a.time}</span>
                  <span className={`db-log-type-${a.type}`}>{a.type === 'drowsy' ? 'DROWSY' : 'YAWN'}</span>
                  <span className="db-log-ear">EAR {a.ear}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </>
  );
}
