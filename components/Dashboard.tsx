'use client';
import { useEffect, useRef, useState } from 'react';

interface AlertLog {
  id: number;
  time: string;
  type: 'drowsy' | 'yawn';
  ear: number;
}

interface DashboardProps {
  ear: number;           // 0.0 – 0.5, live from Person A
  isDrowsy: boolean;     // true when EAR < 0.25 for 3+ frames
  isYawning?: boolean;
}

export default function Dashboard({ ear, isDrowsy, isYawning = false }: DashboardProps) {
  const [alertLog, setAlertLog] = useState<AlertLog[]>([]);
  const [sessionStart] = useState(Date.now());
  const [elapsed, setElapsed] = useState('00:00');
  const [alertsPerHour, setAlertsPerHour] = useState(0);
  const lastAlertRef = useRef<number>(0);

  // Session timer
  useEffect(() => {
    const iv = setInterval(() => {
      const s = Math.floor((Date.now() - sessionStart) / 1000);
      const m = Math.floor(s / 60).toString().padStart(2, '0');
      const sec = (s % 60).toString().padStart(2, '0');
      setElapsed(`${m}:${sec}`);
    }, 1000);
    return () => clearInterval(iv);
  }, [sessionStart]);

  // Log new alerts (debounce 3s)
  useEffect(() => {
    if ((isDrowsy || isYawning) && Date.now() - lastAlertRef.current > 3000) {
      lastAlertRef.current = Date.now();
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setAlertLog(prev => {
        const alertType: 'drowsy' | 'yawn' = isDrowsy ? 'drowsy' : 'yawn';
        const next: AlertLog[] = [
          { id: Date.now(), time: timeStr, type: alertType, ear: parseFloat(ear.toFixed(3)) },
          ...prev,
        ].slice(0, 20);
        // compute alerts/hour
        const hrs = (Date.now() - sessionStart) / 3600000 || 0.001;
        setAlertsPerHour(Math.round(next.length / hrs));
        return next;
      });
    }
  }, [isDrowsy, isYawning, ear, sessionStart]);

  const earPct = Math.min(100, Math.max(0, (ear / 0.5) * 100));
  const earColor = ear < 0.2 ? '#ff2d55' : ear < 0.28 ? '#ff9f0a' : '#30d158';
  const safetyScore = Math.max(0, 100 - alertLog.length * 8);

  return (
    <div style={{
      fontFamily: "'DM Mono', 'Courier New', monospace",
      background: 'linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0f0a 100%)',
      minHeight: '100vh',
      color: '#e0e0e0',
      padding: '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
    }}>

      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e2a1e', paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.4rem' }}>👁️</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.15em', color: '#30d158' }}>BLINKGUARD</span>
          <span style={{ fontSize: '0.6rem', background: '#30d15820', color: '#30d158', border: '1px solid #30d15840', borderRadius: '3px', padding: '2px 6px', letterSpacing: '0.1em' }}>LIVE</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#666', letterSpacing: '0.1em' }}>SESSION {elapsed}</div>
      </header>

      {/* Status Banner */}
      <div style={{
        borderRadius: '8px',
        padding: '0.9rem 1.2rem',
        background: isDrowsy ? '#ff2d5512' : '#30d15812',
        border: `1px solid ${isDrowsy ? '#ff2d5540' : '#30d15840'}`,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        transition: 'all 0.3s',
        animation: isDrowsy ? 'pulse 1s infinite' : 'none',
      }}>
        <span style={{ fontSize: '1.5rem' }}>{isDrowsy ? '🚨' : isYawning ? '😮' : '✅'}</span>
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: isDrowsy ? '#ff2d55' : '#30d158', letterSpacing: '0.08em' }}>
            {isDrowsy ? 'DROWSINESS DETECTED' : isYawning ? 'YAWN DETECTED' : 'DRIVER ALERT'}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#888', marginTop: '2px' }}>
            {isDrowsy ? 'Eyes closed too long — take a break!' : isYawning ? 'Fatigue building up' : 'Eyes open — stay safe'}
          </div>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
        {[
          { label: 'EAR', value: ear.toFixed(3), sub: 'eye aspect ratio', color: earColor },
          { label: 'ALERTS', value: alertLog.length, sub: 'this session', color: '#ff9f0a' },
          { label: 'ALERTS/HR', value: alertsPerHour, sub: 'rate', color: '#bf5af2' },
        ].map(m => (
          <div key={m.label} style={{
            background: '#0d1117',
            border: '1px solid #1e2a1e',
            borderRadius: '8px',
            padding: '0.8rem',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '0.55rem', color: '#555', letterSpacing: '0.12em', marginBottom: '0.3rem' }}>{m.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: '0.55rem', color: '#444', marginTop: '2px' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* EAR Meter */}
      <div style={{ background: '#0d1117', border: '1px solid #1e2a1e', borderRadius: '8px', padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.65rem', color: '#666', letterSpacing: '0.1em' }}>EYE OPENNESS</span>
          <span style={{ fontSize: '0.65rem', color: earColor }}>{ear < 0.2 ? 'CLOSED' : ear < 0.28 ? 'HEAVY' : 'OPEN'}</span>
        </div>
        <div style={{ height: '8px', background: '#1a1a2e', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${earPct}%`,
            background: `linear-gradient(90deg, #ff2d55, ${earColor})`,
            borderRadius: '4px',
            transition: 'width 0.15s ease, background 0.3s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span style={{ fontSize: '0.5rem', color: '#333' }}>0.0 CLOSED</span>
          <span style={{ fontSize: '0.5rem', color: '#555' }}>0.25 threshold</span>
          <span style={{ fontSize: '0.5rem', color: '#333' }}>0.5 OPEN</span>
        </div>
      </div>

      {/* Safety Score */}
      <div style={{ background: '#0d1117', border: '1px solid #1e2a1e', borderRadius: '8px', padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ position: 'relative', width: '60px', height: '60px', flexShrink: 0 }}>
          <svg width="60" height="60" viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="24" fill="none" stroke="#1e2a1e" strokeWidth="5" />
            <circle cx="30" cy="30" r="24" fill="none"
              stroke={safetyScore > 60 ? '#30d158' : safetyScore > 30 ? '#ff9f0a' : '#ff2d55'}
              strokeWidth="5"
              strokeDasharray={`${(safetyScore / 100) * 150.8} 150.8`}
              strokeLinecap="round"
              transform="rotate(-90 30 30)"
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#e0e0e0' }}>
            {safetyScore}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.65rem', color: '#555', letterSpacing: '0.1em', marginBottom: '2px' }}>SAFETY SCORE</div>
          <div style={{ fontSize: '0.8rem', color: safetyScore > 60 ? '#30d158' : '#ff9f0a' }}>
            {safetyScore > 80 ? 'Excellent' : safetyScore > 60 ? 'Good' : safetyScore > 30 ? 'Caution' : 'PULL OVER'}
          </div>
          <div style={{ fontSize: '0.55rem', color: '#444', marginTop: '2px' }}>-8pts per alert event</div>
        </div>
      </div>

      {/* Alert Log */}
      <div style={{ background: '#0d1117', border: '1px solid #1e2a1e', borderRadius: '8px', padding: '1rem', flex: 1 }}>
        <div style={{ fontSize: '0.6rem', color: '#555', letterSpacing: '0.12em', marginBottom: '0.75rem' }}>ALERT LOG</div>
        {alertLog.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#333', fontSize: '0.7rem', padding: '1rem 0' }}>No alerts yet — drive safe! 🚗</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
            {alertLog.map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.4rem 0.6rem',
                background: a.type === 'drowsy' ? '#ff2d5508' : '#ff9f0a08',
                border: `1px solid ${a.type === 'drowsy' ? '#ff2d5520' : '#ff9f0a20'}`,
                borderRadius: '5px',
                fontSize: '0.65rem',
              }}>
                <span>{a.type === 'drowsy' ? '😴' : '😮'}</span>
                <span style={{ color: '#666' }}>{a.time}</span>
                <span style={{ flex: 1, color: a.type === 'drowsy' ? '#ff2d55' : '#ff9f0a', letterSpacing: '0.05em' }}>
                  {a.type === 'drowsy' ? 'DROWSY' : 'YAWN'}
                </span>
                <span style={{ color: '#444' }}>EAR {a.ear}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.7 } }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: #0d1117; }
        ::-webkit-scrollbar-thumb { background: #30d15840; border-radius: 2px; }
      `}</style>
    </div>
  );
}
