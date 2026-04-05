'use client';
/**
 * Monitor — full-screen camera view for live drowsiness detection.
 *
 * This page exists for the moments when the driver wants a dedicated fatigue
 * view instead of the map+PiP combo on Home. All session stats (blinks/min,
 * eye open %, alert count, per-drive history, AI summary) live on Metrics;
 * this page is deliberately minimal — camera, mesh, danger state, and done.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import AlertBanner from '@/components/AlertBanner';
import {
  subscribeCalibration,
  getCalibrationSnapshot,
  getCalibrationServerSnapshot,
} from '@/lib/drowsiness';
import { useDrowsinessDetector } from '@/lib/useDrowsinessDetector';
import { useSafetyAgent } from '@/lib/safety-client';

// ── Icons ────────────────────────────────────────────────────────────────
const EyeIcon = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const AlertIcon = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4" /><path d="M12 17h.01" />
  </svg>
);

export default function Monitor() {
  const calibrated = useSyncExternalStore(
    subscribeCalibration,
    getCalibrationSnapshot,
    getCalibrationServerSnapshot,
  );

  // Full-screen mesh view: ask the detector to draw the face mesh on its
  // canvas. Alerts + persistence are on because this is a "real drive" view.
  const {
    videoRef,
    canvasRef,
    isStarted,
    start,
    stop,
    drowsinessState,
    faceDetected,
    ear,
    mar,
    closedFrames,
    blinkRate,
    yawning,
    setSessionMeta,
    error,
  } = useDrowsinessDetector({ drawMesh: true, enableAlerts: true, persistOnStop: true });

  // Stable session id for the uAgents SafetyOrchestrator — regenerated
  // whenever the detector restarts (keyed on isStarted) so each trip gets
  // its own memory bucket on the agent side.
  const sessionId = useMemo(
    () => `session_${Date.now()}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isStarted],
  );

  // Fetch.ai bridge — posts telemetry every 2s while monitoring. The decision
  // is pushed into the cross-page store via useSafetyAgent → Metrics reads it.
  const { decision: agentDecision } = useSafetyAgent({
    sessionId,
    enabled: isStarted,
    state: drowsinessState,
    closedFrames,
    ear,
    mar,
    blinkRate,
    yawning,
    calibrated,
  });

  useEffect(() => {
    if (agentDecision?.tripScore != null) {
      setSessionMeta({ agentTripScore: agentDecision.tripScore });
    }
  }, [agentDecision?.tripScore, setSessionMeta]);

  // ── Derived UI state ──
  const statusClass =
    drowsinessState === 'awake' ? 'safe' : drowsinessState === 'warning' ? 'warning' : 'danger';
  const statusLabel = !isStarted
    ? 'Camera off'
    : !faceDetected
      ? 'Finding face…'
      : drowsinessState === 'awake'
        ? 'Alert & Safe'
        : drowsinessState === 'warning'
          ? 'Fatigue Detected'
          : 'Critical Alert';

  return (
    <>
      <style>{`
        .mon-screen { flex: 1; background: var(--ios-midnight); position: relative; overflow: hidden; color: #fff; }
        .mon-feed { position: absolute; inset: 0; background: linear-gradient(180deg, var(--ios-midnight-light) 0%, var(--ios-midnight) 100%); }
        .mon-placeholder { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
        .mon-placeholder-ring { width: 12rem; height: 12rem; border-radius: 9999px; border: 4px solid rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; }
        .mon-placeholder-ring svg { width: 6rem; height: 6rem; color: rgba(255,255,255,0.4); }

        .mon-scan { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 0%, rgba(6,182,212,0.1) 50%, transparent 100%); animation: iosScanPulse 2s ease-in-out infinite; pointer-events: none; }
        @keyframes iosScanPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

        .mon-video {
          position: absolute; inset: 0; width: 100%; height: 100%;
          object-fit: cover; transform: scaleX(-1);
        }
        .mon-canvas {
          position: absolute; inset: 0; width: 100%; height: 100%; transform: scaleX(-1);
          pointer-events: none;
        }
        .mon-hidden { display: none !important; }

        .mon-top-badges { position: absolute; top: 1rem; left: 0; right: 0; padding: 0 1rem; display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; z-index: 10; }
        .mon-badge-status { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.625rem 1rem; border-radius: 1rem; color: #fff; box-shadow: 0 10px 15px -3px rgba(0,0,0,.2); backdrop-filter: blur(8px); font-weight: 500; font-size: 0.82rem; }
        .mon-badge-status.safe    { background: var(--ios-safe); }
        .mon-badge-status.warning { background: var(--ios-warning); }
        .mon-badge-status.danger  { background: var(--ios-danger); animation: iosDangerPulse 1s ease-in-out infinite; }
        .mon-badge-status svg { width: 1rem; height: 1rem; }
        @keyframes iosDangerPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; } }

        .mon-rec { position: absolute; top: 1rem; right: 1rem; display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.75rem; border-radius: 9999px; background: rgba(239,68,68,0.9); color: #fff; backdrop-filter: blur(8px); box-shadow: 0 10px 15px -3px rgba(0,0,0,.2); z-index: 10; font-size: 0.78rem; }
        .mon-rec-dot { width: 0.5rem; height: 0.5rem; border-radius: 9999px; background: #fff; animation: iosBlinkPulse 1.2s ease-in-out infinite; }
        @keyframes iosBlinkPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

        /* Floating action row — start/stop + metrics link */
        .mon-actions {
          position: absolute; bottom: 6.25rem; left: 0; right: 0;
          padding: 0 1rem; z-index: 10;
          display: flex; justify-content: center; gap: 0.625rem;
        }
        .mon-btn {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 0.75rem 1.25rem; border-radius: 9999px;
          font-weight: 600; font-size: 0.82rem;
          border: none; cursor: pointer; font-family: inherit; text-decoration: none;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,.25);
        }
        .mon-btn.start { background: #fff; color: var(--ios-midnight); }
        .mon-btn.stop { background: var(--ios-danger); color: #fff; }
        .mon-btn.ghost {
          background: rgba(255,255,255,0.15); color: #fff;
          border: 1px solid rgba(255,255,255,0.3);
          backdrop-filter: blur(8px);
        }

        .mon-calib-cta {
          position: absolute; bottom: 9.75rem; left: 50%; transform: translateX(-50%);
          background: var(--ios-warning); color: #fff; border-radius: 9999px;
          padding: 0.55rem 1.1rem; font-weight: 600; font-size: 0.72rem;
          text-decoration: none; box-shadow: 0 10px 20px -6px rgba(245,158,11,0.45);
          z-index: 10; white-space: nowrap;
        }

        .mon-error {
          position: absolute; bottom: 11rem; left: 1rem; right: 1rem; z-index: 10;
          padding: 0.625rem 0.875rem; border-radius: 0.75rem;
          background: rgba(239,68,68,0.92); color: #fff;
          font-size: 0.75rem; text-align: center;
          box-shadow: 0 10px 20px -8px rgba(239,68,68,0.4);
        }
      `}</style>

      <div className="ios-app">
        <div className="mon-screen">
          <div className="mon-feed">
            {!isStarted && (
              <div className="mon-placeholder">
                <div className="mon-placeholder-ring"><EyeIcon /></div>
              </div>
            )}
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`mon-video ${!isStarted ? 'mon-hidden' : ''}`}
            />
            <canvas
              ref={canvasRef}
              className={`mon-canvas ${!isStarted ? 'mon-hidden' : ''}`}
            />
            <div className="mon-scan" />
          </div>

          <div className="mon-top-badges">
            <div className={`mon-badge-status ${isStarted ? statusClass : 'safe'}`}>
              {drowsinessState === 'danger' && <AlertIcon />}
              <span>{statusLabel}</span>
            </div>
          </div>

          {isStarted && (
            <div className="mon-rec">
              <div className="mon-rec-dot" />
              <span>Recording</span>
            </div>
          )}

          {!isStarted && !calibrated && (
            <Link href="/calibrate" className="mon-calib-cta">
              Calibrate for best accuracy →
            </Link>
          )}

          {error && <div className="mon-error">{error}</div>}

          <div className="mon-actions">
            {!isStarted ? (
              <button type="button" className="mon-btn start" onClick={() => void start()}>
                Start monitoring
              </button>
            ) : (
              <button type="button" className="mon-btn stop" onClick={stop}>
                Stop
              </button>
            )}
            <Link href="/metrics" className="mon-btn ghost">
              View stats →
            </Link>
          </div>
        </div>

        <BottomNav />
      </div>

      <AlertBanner drowsinessState={drowsinessState} />
    </>
  );
}
