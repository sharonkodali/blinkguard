'use client';
import { useEffect, useRef, useState } from 'react';
import { runDrowsyAgents, checkTraffic, speakAlert, vibrateAlert, type AgentResponse } from '../lib/agents';

interface AgentPanelProps {
  isDrowsy: boolean;
  alertCount: number;
}

type AgentStatus = 'idle' | 'loading' | 'done' | 'error';

export default function AgentPanel({ isDrowsy, alertCount }: AgentPanelProps) {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [response, setResponse] = useState<AgentResponse | null>(null);
  const [trafficTick, setTrafficTick] = useState('Checking traffic...');
  const [lastAlertCount, setLastAlertCount] = useState(0);
  const [spoken, setSpoken] = useState(false);
  const trafficRef = useRef<ReturnType<typeof setInterval>>(null);

  // Poll traffic every 60s
  useEffect(() => {
    checkTraffic().then(setTrafficTick);
    trafficRef.current = setInterval(() => {
      checkTraffic().then(setTrafficTick);
    }, 60000);
    return () => { if (trafficRef.current) clearInterval(trafficRef.current); };
  }, []);

  // Trigger agent on new drowsy event
  useEffect(() => {
    if (isDrowsy && alertCount > lastAlertCount) {
      setLastAlertCount(alertCount);
      setStatus('loading');
      setSpoken(false);

      runDrowsyAgents(alertCount)
        .then(res => {
          setResponse(res);
          setStatus('done');

          // Voice + vibrate
          speakAlert(res.voiceCoach);
          vibrateAlert();
          setSpoken(true);
        })
        .catch(() => setStatus('error'));
    }
  }, [isDrowsy, alertCount, lastAlertCount]);

  const handleManualTest = () => {
    setStatus('loading');
    runDrowsyAgents(alertCount || 1)
      .then(res => { setResponse(res); setStatus('done'); speakAlert(res.voiceCoach); vibrateAlert(); })
      .catch(() => setStatus('error'));
  };

  return (
    <div style={{
      fontFamily: "'DM Mono', 'Courier New', monospace",
      background: '#0d1117',
      border: '1px solid #1e2a1e',
      borderRadius: '10px',
      padding: '1.2rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.85rem',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.6rem', color: '#555', letterSpacing: '0.12em' }}>AI AGENT PANEL</div>
        <div style={{
          fontSize: '0.55rem',
          padding: '2px 8px',
          borderRadius: '3px',
          background: status === 'loading' ? '#ff9f0a20' : status === 'done' ? '#30d15820' : '#1e2a1e',
          color: status === 'loading' ? '#ff9f0a' : status === 'done' ? '#30d158' : '#444',
          border: `1px solid ${status === 'loading' ? '#ff9f0a40' : status === 'done' ? '#30d15840' : '#333'}`,
          letterSpacing: '0.08em',
        }}>
          {status === 'idle' ? 'STANDBY' : status === 'loading' ? 'THINKING...' : status === 'done' ? 'READY' : 'ERROR'}
        </div>
      </div>

      {/* Live Traffic Ticker */}
      <div style={{
        background: '#0a0f0a',
        border: '1px solid #1e2a1e',
        borderRadius: '6px',
        padding: '0.7rem',
        display: 'flex',
        gap: '0.6rem',
        alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: '1rem', flexShrink: 0 }}>🗺️</span>
        <div>
          <div style={{ fontSize: '0.55rem', color: '#444', letterSpacing: '0.1em', marginBottom: '3px' }}>LIVE TRAFFIC</div>
          <div style={{ fontSize: '0.72rem', color: '#aaa', lineHeight: 1.4 }}>{trafficTick}</div>
        </div>
      </div>

      {/* Agent Responses */}
      {status === 'loading' && (
        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
          <div style={{ fontSize: '0.7rem', color: '#ff9f0a', animation: 'blink 1s infinite' }}>
            ⚡ Agents analyzing...
          </div>
          <div style={{ fontSize: '0.55rem', color: '#444', marginTop: '6px' }}>Checking traffic + nearby stops</div>
        </div>
      )}

      {status === 'done' && response && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {[
            { icon: '🚦', label: 'TRAFFIC', value: response.traffic, color: '#30d158' },
            { icon: '🏨', label: 'REST STOP', value: response.hotel, color: '#0a84ff' },
            { icon: '🎙️', label: 'VOICE COACH', value: response.voiceCoach, color: '#bf5af2' },
          ].map(item => (
            <div key={item.label} style={{
              background: '#0a0f0a',
              border: `1px solid ${item.color}20`,
              borderRadius: '6px',
              padding: '0.7rem',
              display: 'flex',
              gap: '0.6rem',
              alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: '0.5rem', color: '#444', letterSpacing: '0.1em', marginBottom: '3px' }}>{item.label}</div>
                <div style={{ fontSize: '0.72rem', color: item.color, lineHeight: 1.4 }}>{item.value}</div>
              </div>
            </div>
          ))}

          {/* Pull Over Banner */}
          {response.pullOver && (
            <div style={{
              background: '#ff2d5515',
              border: '1px solid #ff2d5560',
              borderRadius: '6px',
              padding: '0.8rem',
              textAlign: 'center',
              animation: 'pulse 1s infinite',
            }}>
              <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>🚨</div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ff2d55', letterSpacing: '0.1em' }}>PULL OVER NOW</div>
              <div style={{ fontSize: '0.6rem', color: '#ff2d5580', marginTop: '3px' }}>{alertCount} alerts — rest required</div>
            </div>
          )}

          {/* Replay voice */}
          {spoken && (
            <button
              onClick={() => speakAlert(response.voiceCoach)}
              style={{
                background: 'transparent',
                border: '1px solid #bf5af240',
                borderRadius: '5px',
                color: '#bf5af2',
                fontSize: '0.6rem',
                padding: '0.4rem',
                cursor: 'pointer',
                letterSpacing: '0.08em',
              }}
            >
              🔊 REPLAY VOICE ALERT
            </button>
          )}
        </div>
      )}

      {/* Manual test button (for demo / Person A not connected yet) */}
      <button
        onClick={handleManualTest}
        disabled={status === 'loading'}
        style={{
          marginTop: '0.2rem',
          background: 'transparent',
          border: `1px solid ${status === 'loading' ? '#333' : '#30d15840'}`,
          borderRadius: '5px',
          color: status === 'loading' ? '#444' : '#30d158',
          fontSize: '0.6rem',
          padding: '0.5rem',
          cursor: status === 'loading' ? 'not-allowed' : 'pointer',
          letterSpacing: '0.08em',
          transition: 'all 0.2s',
        }}
      >
        {status === 'loading' ? '⏳ LOADING...' : '⚡ SIMULATE DROWSY ALERT (DEMO)'}
      </button>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}
