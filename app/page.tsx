'use client';
/**
 * Home — the main driver surface.
 *
 * Unlike a typical landing page, this screen runs BOTH the real Google Maps
 * navigation AND the live drowsiness detector at the same time, because the
 * whole point of BlinkGuard is that fatigue monitoring should never be an
 * afterthought you toggle into. The map fills the main area; a small PiP
 * camera preview (powered by `useDrowsinessDetector`) sits in the corner and
 * drives a live status chip + danger banner up top.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import AlertBanner from '@/components/AlertBanner';
import {
  hasCalibration,
  loadCalibrationData,
  subscribeCalibration,
  getCalibrationSnapshot,
  getCalibrationServerSnapshot,
} from '@/lib/drowsiness';
import { useDrowsinessDetector } from '@/lib/useDrowsinessDetector';
import { useSafetyAgent } from '@/lib/safety-client';

// Dynamic import — Google Maps must run client-side only.
const GoogleNavigationMap = dynamic(
  () => import('@/components/GoogleNavigationMap'),
  {
    ssr: false,
    loading: () => (
      <div className="nav-map-loading">
        <span className="nav-map-loading-dot" />
        Loading map…
      </div>
    ),
  },
);

// ── Icons ─────────────────────────────────────────────────────────────────
const EyeIcon = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
    <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
    <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
    <path d="m2 2 20 20" />
  </svg>
);
const AlertIcon = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);
const CalibIcon = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
  </svg>
);
const CameraIcon = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);
const StopIcon = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export default function Home() {
  const router = useRouter();

  // Calibration status is subscribed via useSyncExternalStore so SSR returns a
  // stable `false` (avoids hydration mismatches) and the client re-reads after
  // mount. This also updates live when the user returns from /calibrate.
  const calibrated = useSyncExternalStore(
    subscribeCalibration,
    getCalibrationSnapshot,
    getCalibrationServerSnapshot,
  );

  // First-time users must calibrate before seeing the map.
  // Once calibration is saved to localStorage it never redirects again.
  useEffect(() => {
    if (!hasCalibration()) {
      router.replace('/calibrate');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — only check once on mount

  useEffect(() => {
    if (calibrated) loadCalibrationData();
  }, [calibrated]);

  // ── Live drowsiness detector ──────────────────────────────────────────
  // The hook owns the camera + MediaPipe pipeline and mirrors its state to
  // the cross-page liveSession store so Metrics can read it too. We disable
  // the mesh drawing here because the Home-page preview is a tiny PiP — the
  // full mesh overlay lives on the /monitor page.
  const detector = useDrowsinessDetector({
    drawMesh: false,
    enableAlerts: true,
    persistOnStop: true,
  });
  const {
    videoRef,
    canvasRef,
    isStarted: monitoring,
    start: startMonitor,
    drowsinessState,
    faceDetected,
    blinkRate,
    alertCount,
    ear,
    mar,
    warningCount,
    dangerCount,
    sessionTime,
    yawning,
    closedFrames,
    error: detectorError,
    setSessionMeta,
  } = detector;

  // Stable session ID — regenerated when monitoring restarts.
  const sessionIdRef = useRef(`session_${Date.now()}`);
  useEffect(() => {
    if (monitoring) sessionIdRef.current = `session_${Date.now()}`;
  }, [monitoring]);

  // Fetch.ai safety agent — sends telemetry every 2 s, gets back tripScore.
  const { decision: agentDecision } = useSafetyAgent({
    sessionId: sessionIdRef.current,
    enabled: monitoring,
    state: drowsinessState,
    closedFrames,
    ear,
    mar,
    blinkRate,
    yawning,
    calibrated,
  });

  // Feed the agent's trip score back into the session record.
  useEffect(() => {
    if (agentDecision?.tripScore != null) {
      setSessionMeta({ agentTripScore: agentDecision.tripScore });
    }
  }, [agentDecision?.tripScore, setSessionMeta]);

  // When the navigation destination changes, record it on the session.
  const handleRouteMeta = useCallback(
    (meta: { destinationLabel?: string } | null) => {
      setSessionMeta({ destination: meta?.destinationLabel ?? undefined });
    },
    [setSessionMeta],
  );

  // Watchdog: keep monitoring running at all times while on this page.
  // Fires on mount and any time `monitoring` drops to false.
  const startMonitorRef = useRef(startMonitor);
  startMonitorRef.current = startMonitor;
  useEffect(() => {
    if (monitoring) return; // already running — nothing to do
    const t = setTimeout(() => { void startMonitorRef.current(); }, 500);
    return () => clearTimeout(t);
  }, [monitoring]); // re-run whenever monitoring flips off

  // Drive status pill — driven by live detector state while monitoring,
  // otherwise shows a neutral idle pill so the header stays stable.
  const statusClass = !monitoring
    ? 'idle'
    : drowsinessState === 'awake'
      ? 'safe'
      : drowsinessState === 'warning'
        ? 'warning'
        : 'danger';
  const statusText = !monitoring
    ? 'Monitor off'
    : !faceDetected
      ? 'Finding face…'
      : drowsinessState === 'awake'
        ? 'Alert'
        : drowsinessState === 'warning'
          ? 'Drowsy'
          : 'Danger';

  // Track user's geolocation — passed to AlertBanner so it can fetch nearby
  // pullover recommendations from the Fetch.ai agent when an alert fires.
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setUserPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {/* permission denied — spots won't load but app still works */},
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Danger banner: only shown while monitoring AND in danger state. The
  // detector already fires voice/vibration alerts; this is a visual echo.
  const showDanger = monitoring && drowsinessState === 'danger';

  return (
    <>
      <style>{`
        @keyframes navPulse  { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes iosPulse  { 0%,100%{opacity:1} 50%{opacity:0.75} }

        /* Full-screen map container */
        .nav-screen {
          flex: 1; position: relative; min-height: 0; overflow: hidden;
          background: #e8eaed;
        }

        /* Map fills every pixel */
        .nav-map-layer {
          position: absolute; inset: 0;
          padding-bottom: calc(4rem + env(safe-area-inset-bottom));
        }
        .nav-map-layer > *:first-child { position: absolute; inset: 0; width: 100%; height: 100%; }
        .nav-map-loading {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          gap: 0.5rem; font-size: 0.78rem; color: #9aa0a6; background: #f8f9fa;
        }
        .nav-map-loading-dot {
          width: 0.5rem; height: 0.5rem; border-radius: 9999px;
          background: #1a73e8; animation: navPulse 1s ease-in-out infinite;
        }

        /* Floating top-left: calibration chip */
        .nav-float-calib {
          position: absolute;
          top: calc(0.75rem + env(safe-area-inset-top));
          left: 0.75rem;
          z-index: 800;
        }
        .nav-calib-chip {
          display: inline-flex; align-items: center; gap: 0.35rem;
          padding: 0.45rem 0.85rem; border-radius: 9999px;
          background: rgba(255,255,255,0.96); color: #202124;
          border: 1px solid rgba(0,0,0,0.12); font-size: 0.7rem; font-weight: 600;
          box-shadow: 0 2px 8px rgba(0,0,0,0.14); text-decoration: none;
          white-space: nowrap; backdrop-filter: blur(8px);
        }
        .nav-calib-chip svg { width: 0.75rem; height: 0.75rem; }
        .nav-calib-chip.calibrated { color: #137333; border-color: rgba(19,115,51,0.3); }
        .nav-calib-chip.pending    { color: #e37400; border-color: rgba(227,116,0,0.35); }

        /* Floating top-right: live status pill */
        .nav-float-status {
          position: absolute;
          top: calc(0.75rem + env(safe-area-inset-top));
          right: 0.75rem;
          z-index: 800;
        }
        .nav-score-pill {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.45rem 0.85rem; border-radius: 9999px; color: #fff;
          font-size: 0.7rem; font-weight: 600; white-space: nowrap;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2); backdrop-filter: blur(8px);
        }
        .nav-score-pill svg { width: 0.75rem; height: 0.75rem; }
        .nav-score-pill.idle    { background: rgba(100,116,139,0.9); }
        .nav-score-pill.safe    { background: rgba(16,185,129,0.92); }
        .nav-score-pill.warning { background: rgba(245,158,11,0.95); }
        .nav-score-pill.danger  { background: rgba(239,68,68,0.97); animation: iosPulse 0.9s ease-in-out infinite; }

        /* Full-screen danger overlay (on top of map + banner) */
        .nav-danger-flash {
          position: absolute; inset: 0; z-index: 700;
          background: rgba(220, 38, 38, 0.22);
          pointer-events: none;
          animation: iosPulse 1s ease-in-out infinite;
        }

        /* Danger pull-over strip — floats just above the navigation ETA bar */
        .nav-alert-strip {
          position: absolute; left: 0.75rem; right: 0.75rem; bottom: 170px; z-index: 800;
          background: #b91c1c; color: #fff; border-radius: 14px;
          padding: 0.7rem 1rem;
          display: flex; align-items: center; gap: 0.75rem;
          box-shadow: 0 4px 20px rgba(185,28,28,0.5);
          animation: iosPulse 1.2s ease-in-out infinite;
        }
        .nav-alert-icon-wrap {
          width: 2rem; height: 2rem; border-radius: 50%;
          background: #fff; color: #b91c1c;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .nav-alert-icon-wrap svg { width: 1rem; height: 1rem; }
        .nav-alert-title { font-weight: 700; font-size: 0.82rem; line-height: 1.2; }
        .nav-alert-sub   { font-size: 0.68rem; opacity: 0.9; line-height: 1.3; margin-top: 2px; }

        /* Camera: always mounted so hook can attach, but invisible */
        .nav-cam-bg {
          position: absolute; width: 1px; height: 1px; opacity: 0;
          pointer-events: none; left: -9999px; top: -9999px; overflow: hidden;
        }

        /* Monitoring indicator chip (bottom-left, above nav strip) */
        .nav-monitor-indicator {
          position: absolute; left: 0.75rem; bottom: 170px; z-index: 800;
          display: inline-flex; align-items: center; gap: 0.45rem;
          padding: 0.45rem 0.85rem; border-radius: 9999px;
          background: rgba(15,23,41,0.88); color: #fff;
          font-size: 0.68rem; font-weight: 600;
          box-shadow: 0 2px 10px rgba(0,0,0,0.25); backdrop-filter: blur(8px);
          pointer-events: none;
        }
        .nav-monitor-dot {
          width: 0.5rem; height: 0.5rem; border-radius: 50%;
          animation: navPulse 1.2s ease-in-out infinite;
        }
        .nav-monitor-dot.safe    { background: #10b981; }
        .nav-monitor-dot.warning { background: #f59e0b; }
        .nav-monitor-dot.danger  { background: #ef4444; }

        /* FAB: Start / Stop monitoring — bottom center of the map */
        .nav-fab-wrap {
          position: absolute;
          bottom: calc(4.5rem + env(safe-area-inset-bottom));
          left: 50%; transform: translateX(-50%);
          z-index: 800;
        }
        .nav-fab {
          -webkit-appearance: none; appearance: none;
          display: inline-flex; align-items: center; gap: 0.45rem;
          padding: 0.875rem 1.75rem; border-radius: 9999px;
          font-weight: 700; font-size: 0.88rem; border: none; cursor: pointer;
          font-family: inherit; white-space: nowrap;
          box-shadow: 0 4px 16px rgba(0,0,0,0.28);
        }
        .nav-fab svg { width: 1rem; height: 1rem; }
        .nav-fab.start { background: #202124; color: #fff; }
        .nav-fab.stop  { background: #ea4335; color: #fff; }

        .nav-error {
          position: absolute; top: calc(4rem + env(safe-area-inset-top)); left: 0.75rem; right: 0.75rem;
          z-index: 810; padding: 0.55rem 0.875rem;
          background: rgba(234,67,53,0.92); color: #fff;
          border-radius: 0.75rem; font-size: 0.72rem; text-align: center;
        }
      `}</style>

      <div className="ios-app">
        <div className="nav-screen">
          {/* Edge-to-edge map layer */}
          <div className="nav-map-layer">
            <GoogleNavigationMap
              drowsinessState={drowsinessState}
              onRouteMetaChange={handleRouteMeta}
            />
          </div>

          {/* Camera runs invisibly — hook needs the DOM ref to attach MediaStream */}
          <div className="nav-cam-bg" aria-hidden>
            <video ref={videoRef} autoPlay muted playsInline />
            <canvas ref={canvasRef} />
          </div>

          {/* Danger screen flash */}
          {showDanger && <div className="nav-danger-flash" aria-hidden />}

          {/* Calibration chip — top left */}
          <div className="nav-float-calib">
            <Link href="/calibrate" className={`nav-calib-chip ${calibrated ? 'calibrated' : 'pending'}`}>
              <CalibIcon />
              {calibrated ? 'Calibrated' : 'Calibrate'}
            </Link>
          </div>

          {/* Live status pill — top right */}
          <div className="nav-float-status">
            <div className={`nav-score-pill ${statusClass}`}>
              {monitoring && drowsinessState !== 'awake' ? <EyeOffIcon /> : <EyeIcon />}
              <span>{statusText}</span>
              {monitoring && <span>· {blinkRate}/min</span>}
            </div>
          </div>

          {/* Pull-over alert strip — floats above ETA bar */}
          {showDanger && (
            <div className="nav-alert-strip" role="alert">
              <div className="nav-alert-icon-wrap"><AlertIcon /></div>
              <div>
                <p className="nav-alert-title">WAKE UP — Pull over safely</p>
                <p className="nav-alert-sub">
                  {alertCount > 0 ? `${alertCount} alert${alertCount === 1 ? '' : 's'} this drive` : 'Fatigue detected'}
                </p>
              </div>
            </div>
          )}

          {/* Monitoring live indicator */}
          {monitoring && !showDanger && (
            <div className="nav-monitor-indicator">
              <span className={`nav-monitor-dot ${statusClass}`} />
              <span>{faceDetected ? `Monitoring · ${blinkRate}/min` : 'Finding face…'}</span>
            </div>
          )}

          {detectorError && (
            <div className="nav-error">{detectorError}</div>
          )}
        </div>

        <BottomNav />
      </div>

      {/* Full-screen graded alert — warning=amber, danger=red strobe + audio.
          userPosition enables Fetch.ai-powered nearby pullover recommendations. */}
      <AlertBanner drowsinessState={drowsinessState} userPosition={userPosition} />
    </>
  );
}
