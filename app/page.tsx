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
import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import BottomNav from '@/components/BottomNav';
import {
  loadCalibrationData,
  subscribeCalibration,
  getCalibrationSnapshot,
  getCalibrationServerSnapshot,
} from '@/lib/drowsiness';
import { useDrowsinessDetector } from '@/lib/useDrowsinessDetector';

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
  // Calibration status is subscribed via useSyncExternalStore so SSR returns a
  // stable `false` (avoids hydration mismatches) and the client re-reads after
  // mount. This also updates live when the user returns from /calibrate.
  const calibrated = useSyncExternalStore(
    subscribeCalibration,
    getCalibrationSnapshot,
    getCalibrationServerSnapshot,
  );
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
    stop: stopMonitor,
    drowsinessState,
    faceDetected,
    blinkRate,
    alertCount,
    error: detectorError,
  } = detector;

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

  // Danger banner: only shown while monitoring AND in danger state. The
  // detector already fires voice/vibration alerts; this is a visual echo.
  const showDanger = monitoring && drowsinessState === 'danger';

  // Mini video tile: draggable? No — keep simple. Expandable to /monitor.
  const [showTile, setShowTile] = useState(true);

  return (
    <>
      <style>{`
        .nav-screen {
          flex: 1; display: flex; flex-direction: column;
          min-height: 0; background: var(--ios-background);
          padding-bottom: calc(4rem + env(safe-area-inset-bottom));
        }

        /* Compact top header — calibration chip + live status pill */
        .nav-header {
          display: flex; align-items: center; gap: 0.5rem;
          padding: calc(0.75rem + env(safe-area-inset-top)) 0.875rem 0.625rem;
          background: var(--ios-background);
        }
        .nav-calib-chip {
          display: inline-flex; align-items: center; gap: 0.35rem;
          padding: 0.4rem 0.75rem; border-radius: 9999px;
          background: #fff; color: var(--ios-midnight);
          border: 1px solid var(--ios-border); font-size: 0.7rem; font-weight: 600;
          box-shadow: 0 1px 2px rgba(15,23,41,0.04); text-decoration: none;
          white-space: nowrap;
        }
        .nav-calib-chip svg { width: 0.8rem; height: 0.8rem; }
        .nav-calib-chip.calibrated { color: var(--ios-safe); border-color: rgba(16,185,129,0.35); }
        .nav-calib-chip.pending    { color: var(--ios-warning); border-color: rgba(245,158,11,0.45); }

        .nav-score-pill {
          margin-left: auto; display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.4rem 0.75rem; border-radius: 9999px; color: #fff;
          font-size: 0.7rem; font-weight: 600; white-space: nowrap;
          box-shadow: 0 1px 2px rgba(15,23,41,0.08);
        }
        .nav-score-pill svg { width: 0.8rem; height: 0.8rem; }
        .nav-score-pill.idle    { background: #64748b; }
        .nav-score-pill.safe    { background: var(--ios-safe); }
        .nav-score-pill.warning { background: var(--ios-warning); }
        .nav-score-pill.danger  { background: var(--ios-danger); animation: iosPulse 1s ease-in-out infinite; }
        .nav-score-label { opacity: 0.9; }
        .nav-score-value { font-size: 0.78rem; font-weight: 700; }

        /* Map layer — takes the remaining flex space */
        .nav-map-layer {
          flex: 1; position: relative; min-height: 280px;
          margin: 0 0.625rem; border-radius: 1rem; overflow: hidden;
          border: 1px solid var(--ios-border);
          box-shadow: 0 6px 18px -8px rgba(15,23,41,0.15);
        }
        .nav-map-layer > * { position: absolute; inset: 0; width: 100%; height: 100%; }
        .nav-map-loading {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          gap: 0.5rem; font-size: 0.78rem; color: var(--ios-muted-foreground);
          background: var(--ios-muted);
        }
        .nav-map-loading-dot {
          width: 0.5rem; height: 0.5rem; border-radius: 9999px;
          background: var(--ios-primary); animation: navPulse 1s ease-in-out infinite;
        }
        @keyframes navPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes iosPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.75; } }

        /* Danger banner below header, above map */
        .nav-alert {
          margin: 0 0.625rem 0.5rem;
          background: var(--ios-danger); color: #fff; border-radius: 0.875rem;
          padding: 0.75rem 0.875rem; border: 1px solid rgba(255,255,255,0.3);
          box-shadow: 0 10px 24px -10px rgba(239,68,68,0.45);
          animation: iosPulse 1.2s ease-in-out infinite;
        }
        .nav-alert-row { display: flex; align-items: center; gap: 0.625rem; }
        .nav-alert-icon-wrap {
          width: 2rem; height: 2rem; border-radius: 9999px;
          background: #fff; color: var(--ios-danger);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .nav-alert-icon-wrap svg { width: 1.1rem; height: 1.1rem; }
        .nav-alert-title { font-weight: 600; font-size: 0.78rem; line-height: 1.2; }
        .nav-alert-sub { font-size: 0.7rem; color: rgba(255,255,255,0.9); line-height: 1.3; }

        .nav-error {
          margin: 0 0.625rem 0.5rem; padding: 0.5rem 0.75rem;
          background: rgba(239,68,68,0.1); color: #b91c1c;
          border: 1px solid rgba(239,68,68,0.25); border-radius: 0.75rem;
          font-size: 0.72rem;
        }

        /* Camera PiP — bottom-left of the map, floats over but below map bar */
        .nav-pip {
          position: absolute;
          left: 0.75rem; bottom: 0.75rem;
          width: 7.5rem; height: 10rem;
          border-radius: 0.875rem; overflow: hidden;
          background: #0f1729; color: #fff;
          border: 2px solid #fff;
          box-shadow: 0 12px 28px -10px rgba(15,23,41,0.55);
          z-index: 5;
          display: flex; flex-direction: column;
        }
        .nav-pip-hidden { display: none !important; }
        .nav-pip video { flex: 1; width: 100%; object-fit: cover; transform: scaleX(-1); }
        .nav-pip canvas { position: absolute; inset: 0; width: 100%; height: 100%; transform: scaleX(-1); pointer-events: none; }
        .nav-pip-empty { flex: 1; display: flex; align-items: center; justify-content: center; padding: 0.5rem; text-align: center; font-size: 0.62rem; color: rgba(255,255,255,0.75); line-height: 1.3; }
        .nav-pip-footer {
          display: flex; align-items: center; justify-content: space-between;
          gap: 0.25rem; padding: 0.25rem 0.4rem;
          background: rgba(15,23,41,0.85);
          font-size: 0.58rem;
        }
        .nav-pip-dot {
          width: 0.4rem; height: 0.4rem; border-radius: 9999px; flex-shrink: 0;
          background: #64748b;
        }
        .nav-pip-dot.safe { background: var(--ios-safe); animation: iosPulse 2s ease-in-out infinite; }
        .nav-pip-dot.warning { background: var(--ios-warning); animation: iosPulse 1.4s ease-in-out infinite; }
        .nav-pip-dot.danger { background: var(--ios-danger); animation: iosPulse 0.8s ease-in-out infinite; }
        .nav-pip-label { flex: 1; text-align: center; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; }
        .nav-pip-close {
          background: transparent; border: none; color: rgba(255,255,255,0.7);
          font-size: 0.75rem; line-height: 1; padding: 0 0.15rem; cursor: pointer;
        }

        .nav-pip-reopen {
          position: absolute; left: 0.75rem; bottom: 0.75rem; z-index: 5;
          display: inline-flex; align-items: center; gap: 0.35rem;
          padding: 0.5rem 0.75rem; border-radius: 9999px;
          background: rgba(15,23,41,0.85); color: #fff;
          font-size: 0.65rem; font-weight: 600;
          border: 1px solid rgba(255,255,255,0.25);
          backdrop-filter: blur(8px);
          cursor: pointer;
        }
        .nav-pip-reopen svg { width: 0.75rem; height: 0.75rem; }

        /* Bottom action bar — start/stop monitor + full-screen link */
        .nav-cta-wrap {
          padding: 0.625rem 0.625rem 0.25rem;
          display: flex; gap: 0.5rem;
        }
        .nav-cta {
          flex: 1;
          display: flex; align-items: center; justify-content: center; gap: 0.4rem;
          border-radius: 9999px; padding: 0.75rem 1rem; font-weight: 600; font-size: 0.82rem;
          text-decoration: none; border: none; cursor: pointer; font-family: inherit;
        }
        .nav-cta svg { width: 0.9rem; height: 0.9rem; }
        .nav-cta.primary {
          background: var(--ios-midnight); color: #fff;
          box-shadow: 0 8px 20px -8px rgba(15,23,41,0.4);
        }
        .nav-cta.stop {
          background: var(--ios-danger); color: #fff;
          box-shadow: 0 8px 20px -8px rgba(239,68,68,0.4);
        }
        .nav-cta.ghost {
          background: #fff; color: var(--ios-midnight);
          border: 1px solid var(--ios-border);
        }
      `}</style>

      <div className="ios-app">
        <div className="nav-screen">
          {/* Compact header row */}
          <div className="nav-header">
            <Link
              href="/calibrate"
              className={`nav-calib-chip ${calibrated ? 'calibrated' : 'pending'}`}
            >
              <CalibIcon />
              {calibrated ? 'Calibrated' : 'Calibrate'}
            </Link>

            <div className={`nav-score-pill ${statusClass}`}>
              {monitoring && drowsinessState !== 'awake' ? <EyeOffIcon /> : <EyeIcon />}
              <span className="nav-score-label">Live</span>
              <span className="nav-score-value">{statusText}</span>
              {monitoring && (
                <span className="nav-score-label">· {blinkRate}/min</span>
              )}
            </div>
          </div>

          {showDanger && (
            <div className="nav-alert" role="alert">
              <div className="nav-alert-row">
                <div className="nav-alert-icon-wrap"><AlertIcon /></div>
                <div style={{ flex: 1 }}>
                  <p className="nav-alert-title">Eyes closing — pull over safely</p>
                  <p className="nav-alert-sub">
                    {alertCount > 0 ? `${alertCount} alert${alertCount === 1 ? '' : 's'} this drive` : 'Fatigue detected'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {detectorError && (
            <div className="nav-error">{detectorError}</div>
          )}

          {/* Map + camera PiP layer — both run concurrently */}
          <div className="nav-map-layer">
            <GoogleNavigationMap drowsinessState={drowsinessState} />

            {/* The video+canvas must be mounted at all times so the detector
                hook can attach the MediaStream. We just hide the PiP shell
                when monitoring is off or the user collapsed it. */}
            <div className={`nav-pip ${monitoring && showTile ? '' : 'nav-pip-hidden'}`}>
              <video ref={videoRef} autoPlay muted playsInline />
              <canvas ref={canvasRef} />
              <div className="nav-pip-footer">
                <div className={`nav-pip-dot ${statusClass}`} />
                <span className="nav-pip-label">{faceDetected ? 'Tracking' : 'No face'}</span>
                <button
                  type="button"
                  className="nav-pip-close"
                  onClick={() => setShowTile(false)}
                  aria-label="Hide camera preview"
                >
                  ×
                </button>
              </div>
            </div>

            {monitoring && !showTile && (
              <button
                type="button"
                className="nav-pip-reopen"
                onClick={() => setShowTile(true)}
              >
                <CameraIcon /> Show camera
              </button>
            )}
          </div>

          <div className="nav-cta-wrap">
            {!monitoring ? (
              <button
                type="button"
                className="nav-cta primary"
                onClick={() => void startMonitor()}
              >
                <CameraIcon /> Start monitoring
              </button>
            ) : (
              <button
                type="button"
                className="nav-cta stop"
                onClick={stopMonitor}
              >
                <StopIcon /> Stop monitoring
              </button>
            )}
            <Link href="/monitor" className="nav-cta ghost">
              Full view →
            </Link>
          </div>
        </div>

        <BottomNav />
      </div>
    </>
  );
}
