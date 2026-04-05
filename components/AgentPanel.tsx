'use client';
import { useEffect, useRef, useState, startTransition } from 'react';
import NearbyStopsCard from '@/components/NearbyStopsCard';
import {
  runDrowsyAgents,
  checkTraffic,
  speakAlert,
  vibrateAlert,
  type AgentResponse,
  type TrafficContext,
} from '@/lib/agents';

interface AgentPanelProps {
  isDrowsy: boolean;
  alertCount: number;
  /** Active Google route — improves Anthropic traffic copy */
  trafficContext?: TrafficContext | null;
}

type AgentStatus = 'idle' | 'loading' | 'done' | 'error';

export default function AgentPanel({ isDrowsy, alertCount, trafficContext }: AgentPanelProps) {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [response, setResponse] = useState<AgentResponse | null>(null);
  const [trafficTick, setTrafficTick] = useState('Checking traffic...');
  const [lastAlertCount, setLastAlertCount] = useState(0);
  const [spoken, setSpoken] = useState(false);
  const trafficCtxRef = useRef(trafficContext);

  const trafficCtxKey = JSON.stringify({
    d: trafficContext?.destinationLabel ?? '',
    o: trafficContext?.originLabel ?? '',
  });

  useEffect(() => {
    trafficCtxRef.current = trafficContext;
  }, [trafficContext]);

  // Immediate refresh when route labels change (stable key avoids effect array bugs)
  useEffect(() => {
    checkTraffic(trafficCtxRef.current ?? undefined).then(setTrafficTick);
  }, [trafficCtxKey]);

  // Poll traffic every 60s; always read latest route from ref
  useEffect(() => {
    const id = setInterval(() => {
      checkTraffic(trafficCtxRef.current ?? undefined).then(setTrafficTick);
    }, 60000);
    return () => clearInterval(id);
  }, []);

  // Trigger agent on new drowsy event
  useEffect(() => {
    if (!isDrowsy || alertCount <= lastAlertCount) return;

    startTransition(() => {
      setLastAlertCount(alertCount);
      setStatus('loading');
      setSpoken(false);
    });

    runDrowsyAgents(alertCount)
      .then(res => {
        setResponse(res);
        setStatus('done');
        speakAlert(res.voiceCoach);
        vibrateAlert();
        setSpoken(true);
      })
      .catch(() => setStatus('error'));
  }, [isDrowsy, alertCount, lastAlertCount]);

  const handleManualTest = () => {
    setStatus('loading');
    runDrowsyAgents(alertCount || 1)
      .then(res => { setResponse(res); setStatus('done'); speakAlert(res.voiceCoach); vibrateAlert(); })
      .catch(() => setStatus('error'));
  };

  return (
    <>
      <style>{`
        .ap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; display: flex; flex-direction: column; gap: 10px; }
        .ap-header { display: flex; justify-content: space-between; align-items: center; }
        .ap-title { font-size: 0.58rem; color: var(--text-faint); letter-spacing: 0.14em; font-weight: 600; }
        .ap-status { font-size: 0.55rem; padding: 4px 8px; border-radius: var(--radius-sm); border: 1px solid; letter-spacing: 0.08em; font-weight: 600; transition: all 0.3s; }
        .ap-status-idle    { background: var(--accent-muted); border-color: var(--border-strong); color: var(--text-faint); }
        .ap-status-loading { background: rgba(80, 80, 129, 0.35); border-color: rgba(134, 134, 172, 0.35); color: var(--text-muted); animation: ap-pulse 1.2s infinite; }
        .ap-status-done    { background: var(--accent-dim); border-color: var(--border-strong); color: var(--text); }
        .ap-status-error   { background: rgba(80, 80, 129, 0.4); border-color: rgba(134, 134, 172, 0.4); color: var(--text-muted); }
        @keyframes ap-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        .ap-traffic { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px; display: flex; gap: 10px; align-items: flex-start; }
        .ap-traffic-icon { font-size: 1rem; flex-shrink: 0; }
        .ap-traffic-label { font-size: 0.55rem; color: var(--text-faint); letter-spacing: 0.1em; margin-bottom: 3px; }
        .ap-traffic-text { font-size: 0.72rem; color: var(--text-muted); line-height: 1.4; }
      `}</style>
      <div className="ap">
        <div className="ap-header">
          <div className="ap-title">AI AGENTS</div>
          <div className={`ap-status ap-status-${status}`}>
            {status === 'idle' ? 'STANDBY' : status === 'loading' ? 'THINKING...' : status === 'done' ? 'READY' : 'ERROR'}
          </div>
        </div>
        <div className="ap-traffic">
          <span className="ap-traffic-icon">🗺️</span>
          <div>
            <div className="ap-traffic-label">LIVE TRAFFIC</div>
            <div className="ap-traffic-text">{trafficTick}</div>
          </div>
        </div>

        <NearbyStopsCard />

        {/* Agent Responses */}
        {status === 'loading' && (
          <div className="ap-loading">
            <div className="ap-loading-text">⚡ Agents analyzing...</div>
            <div className="ap-loading-sub">Checking traffic + nearby stops</div>
          </div>
        )}

        {status === 'done' && response && (
          <div className="ap-responses">
            <div className="ap-response">
              <span className="ap-response-icon">🚦</span>
              <div>
                <div className="ap-response-label">TRAFFIC</div>
                <div className="ap-response-value">{response.traffic}</div>
              </div>
            </div>
            <div className="ap-response">
              <span className="ap-response-icon">🏨</span>
              <div>
                <div className="ap-response-label">REST STOP</div>
                <div className="ap-response-value">{response.hotel}</div>
              </div>
            </div>
            <div className="ap-response">
              <span className="ap-response-icon">🎙️</span>
              <div>
                <div className="ap-response-label">VOICE COACH</div>
                <div className="ap-response-value">{response.voiceCoach}</div>
              </div>
            </div>

            {response.pullOver && (
              <div className="ap-pullover">
                <div className="ap-pullover-emoji">🚨</div>
                <div className="ap-pullover-text">PULL OVER NOW</div>
                <div className="ap-pullover-sub">{alertCount} alerts — rest required</div>
              </div>
            )}

            {spoken && (
              <button onClick={() => speakAlert(response.voiceCoach)} className="ap-btn-voice">
                🔊 REPLAY VOICE ALERT
              </button>
            )}
          </div>
        )}

        <button onClick={handleManualTest} disabled={status === 'loading'} className={`ap-btn-demo ap-btn-demo-${status === 'loading' ? 'loading' : 'ready'}`}>
          {status === 'loading' ? '⏳ LOADING...' : '⚡ SIMULATE DROWSY ALERT (DEMO)'}
        </button>
      </div>
      <style>{`
        .ap-loading { text-align: center; padding: 12px 0; }
        .ap-loading-text { font-size: 0.7rem; color: var(--text-muted); animation: ap-blink 1s infinite; }
        .ap-loading-sub { font-size: 0.55rem; color: var(--text-faint); margin-top: 6px; }
        .ap-responses { display: flex; flex-direction: column; gap: 8px; }
        .ap-response { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px; display: flex; gap: 10px; align-items: flex-start; }
        .ap-response-icon { font-size: 1rem; flex-shrink: 0; }
        .ap-response-label { font-size: 0.55rem; color: var(--text-faint); letter-spacing: 0.1em; margin-bottom: 3px; }
        .ap-response-value { font-size: 0.72rem; color: var(--text-muted); line-height: 1.4; }
        .ap-pullover { background: rgba(80, 80, 129, 0.35); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 12px; text-align: center; animation: ap-pulse 1s infinite; }
        .ap-pullover-emoji { font-size: 1.2rem; margin-bottom: 4px; }
        .ap-pullover-text { font-size: 0.75rem; font-weight: 700; color: var(--text); letter-spacing: 0.1em; }
        .ap-pullover-sub { font-size: 0.6rem; color: var(--text-muted); margin-top: 4px; }
        .ap-btn-voice { width: 100%; background: transparent; border: 1px solid rgba(134, 134, 172, 0.3); border-radius: var(--radius-sm); color: var(--blue-soft); font-size: 0.6rem; padding: 8px; cursor: pointer; transition: all 0.2s; letter-spacing: 0.08em; font-weight: 600; }
        .ap-btn-voice:hover { background: rgba(134, 134, 172, 0.06); border-color: rgba(134, 134, 172, 0.5); }
        .ap-btn-demo { width: 100%; background: transparent; border: 1px solid; border-radius: var(--radius-sm); font-size: 0.6rem; padding: 8px; cursor: pointer; transition: all 0.2s; letter-spacing: 0.08em; font-weight: 600; margin-top: 4px; }
        .ap-btn-demo-ready { border-color: rgba(134, 134, 172, 0.3); color: var(--blue-soft); }
        .ap-btn-demo-ready:hover { background: rgba(134, 134, 172, 0.06); border-color: rgba(134, 134, 172, 0.5); }
        .ap-btn-demo-loading { border-color: var(--border); color: var(--text-faint); cursor: not-allowed; opacity: 0.5; }
        @keyframes ap-blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </>
  );
}
