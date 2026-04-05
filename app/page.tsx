'use client';
import { useRef, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import StatusPanel from '@/components/StatusPanel';
import AlertBanner from '@/components/AlertBanner';
import CalibrationWizard from '@/components/CalibrationWizard';
import {
  computeEAR, computeMAR,
  isEyeClosed, isYawning,
  getDrowsinessState,
  hasCalibration,
  loadCalibrationData,
  FRAMES_DANGER,
} from '@/lib/drowsiness';
import type { DrowsinessState } from '@/lib/drowsiness';
import { formatCameraError, getUserMediaFrontCamera } from '@/lib/camera';

// ─── Eye landmark indices to highlight ───────────────────────────────────────
const LEFT_EYE_IDX  = [33,7,163,144,145,153,154,155,133,246,161,160,159,158,157,173];
const RIGHT_EYE_IDX = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398];

export default function Home() {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ─── State ─────────────────────────────────────────────────────────────────
  const [needsCalibration, setNeedsCalibration] = useState(true);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isStarted,      setIsStarted]      = useState(false);
  const [ear,            setEar]            = useState(0);
  const [closedFrames,   setClosedFrames]   = useState(0);
  const [drowsinessState, setDrowsinessState] = useState<DrowsinessState>('awake');
  const [faceDetected,   setFaceDetected]   = useState(false);
  const [alertCount,     setAlertCount]     = useState(0);
  const [sessionTime,    setSessionTime]    = useState(0);

  // Refs so callbacks always read fresh values
  const closedRef      = useRef(0);
  const alertCooling   = useRef(false);
  const lastAlertTime  = useRef(0);

  // ─── Check calibration on mount ────────────────────────────────────────────
  useEffect(() => {
    const hasCalib = hasCalibration();
    setNeedsCalibration(!hasCalib);
    if (hasCalib) {
      loadCalibrationData();
    }
  }, []);

  // ─── Session timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isStarted) return;
    const id = setInterval(() => setSessionTime(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [isStarted]);

  // ─── Alert trigger ─────────────────────────────────────────────────────────
  const triggerAlert = useCallback(() => {
    const now = Date.now();
    // Debounce: max one alert every 5 seconds
    if (alertCooling.current || now - lastAlertTime.current < 5000) return;
    alertCooling.current = true;
    lastAlertTime.current = now;
    setAlertCount(c => c + 1);

    // Vibrate pattern: buzz-pause-buzz
    if (navigator.vibrate) navigator.vibrate([600, 150, 600, 150, 600]);

    // Text-to-speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(
        'Warning! Eyes closing. Pull over safely now.'
      );
      u.rate  = 1.1;
      u.pitch = 1.2;
      window.speechSynthesis.speak(u);
    }

    setTimeout(() => { alertCooling.current = false; }, 3500);
  }, []);

  // ─── MediaPipe initialization ────────────────────────────────────────────
  const runMediaPipe = useCallback(async () => {
    try {
      // Dynamic imports → no SSR errors
      const { FaceMesh, FACEMESH_TESSELATION } = await import('@mediapipe/face_mesh');
      const { Camera }          = await import('@mediapipe/camera_utils');
      const { drawConnectors }  = await import('@mediapipe/drawing_utils');

      const faceMesh = new FaceMesh({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`,
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      // ── Results callback (runs every frame) ──────────────────────────────────
      faceMesh.onResults((results: { multiFaceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>> }) => {
        const video  = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width  = video.videoWidth  || 640;
        canvas.height = video.videoHeight || 480;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!results.multiFaceLandmarks?.length) {
          // No face in frame
          setFaceDetected(false);
          closedRef.current = 0;
          setClosedFrames(0);
          setDrowsinessState('awake');
          return;
        }

        setFaceDetected(true);
        const lm = results.multiFaceLandmarks[0];

        // ── Compute metrics ────────────────────────────────────────────────────
        try {
          const currentEAR = computeEAR(lm);
          const currentMAR = computeMAR(lm);
          setEar(parseFloat(currentEAR.toFixed(3)));

          // ── Update closed-frames counter ───────────────────────────────────────
          if (isEyeClosed(currentEAR)) {
            closedRef.current = Math.min(closedRef.current + 1, FRAMES_DANGER + 5);
          } else {
            closedRef.current = Math.max(0, closedRef.current - 2);
          }
          setClosedFrames(closedRef.current);

          // ── Compute state & fire alerts ───────────────────────────────────────
          const state = getDrowsinessState(closedRef.current, isYawning(currentMAR));
          setDrowsinessState(state);
          if (state === 'danger') triggerAlert();

          // ── Draw mesh lightly ──────────────────────────────────────────────────
          drawConnectors(ctx, lm, FACEMESH_TESSELATION, {
            color: 'rgba(0,255,128,0.08)',
            lineWidth: 0.5,
          });

          // ── Highlight eyes (green = open, red = closed) ────────────────────────
          const eyeColor = isEyeClosed(currentEAR)
            ? 'rgba(255, 60, 60, 0.9)'
            : 'rgba(60, 255, 120, 0.9)';

          ctx.fillStyle = eyeColor;
          for (const idx of [...LEFT_EYE_IDX, ...RIGHT_EYE_IDX]) {
            if (!lm[idx]) continue;
            ctx.beginPath();
            ctx.arc(lm[idx].x * canvas.width, lm[idx].y * canvas.height, 2.5, 0, 2 * Math.PI);
            ctx.fill();
          }

          // ── Yawn: highlight mouth ─────────────────────────────────────────────
          if (isYawning(currentMAR)) {
            ctx.strokeStyle = 'rgba(255, 220, 0, 0.7)';
            ctx.lineWidth   = 2;
            ctx.beginPath();
            if (lm[13]) {
              ctx.arc(
                lm[13].x * canvas.width,
                lm[13].y * canvas.height,
                14, 0, 2 * Math.PI
              );
            }
            ctx.stroke();
          }
        } catch (error) {
          console.error('Error processing face landmarks:', error);
          setFaceDetected(false);
        }
      });

      // ── Start camera loop ─────────────────────────────────────────────────────
      if (videoRef.current) {
        const cam = new Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current) await faceMesh.send({ image: videoRef.current });
          },
          width: 640, height: 480,
        });
        cam.start();
      }
    } catch (error) {
      console.error('Error initializing MediaPipe:', error);
      alert('Failed to initialize face detection. Please refresh the page.');
    }
  }, [triggerAlert]);

  // ─── Start camera ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await getUserMediaFrontCamera();
      if (!videoRef.current) return;
      const v = videoRef.current;
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.playsInline = true;
      v.muted = true;
      v.srcObject = stream;
      v.onloadedmetadata = async () => {
        if (!videoRef.current) return;
        try {
          await videoRef.current.play();
          setIsStarted(true);
          setTimeout(() => runMediaPipe(), 100);
        } catch (playErr) {
          console.error('Play error:', playErr);
          alert('Could not play video. On iPhone, tap Start again after allowing camera.');
        }
      };
    } catch (err) {
      console.error('Camera access error:', err);
      alert(formatCameraError(err));
    }
  }, [runMediaPipe]);

  // Show calibration wizard if needed
  if (needsCalibration && !isCalibrating) {
    return (
      <CalibrationWizard
        videoRef={videoRef}
        canvasRef={canvasRef}
        onCalibrationComplete={() => {
          setNeedsCalibration(false);
          setIsCalibrating(false);
        }}
      />
    );
  }

  return (
    <>
      <style>{`
        .page-main {
          width: 100%;
          max-width: 100vw;
          min-height: 100dvh;
          box-sizing: border-box;
          padding: calc(0.5rem + env(safe-area-inset-top)) 1rem calc(0.5rem + env(safe-area-inset-bottom));
          background: var(--bg); color: var(--text); display: flex; flex-direction: column; align-items: center;
          overflow: hidden;
        }
        .page-header { width: 100%; max-width: 520px; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
        .page-dash-link {
          font-size: 0.75rem; font-weight: 600; padding: 0.35rem 0.75rem; border-radius: var(--radius-sm);
          border: 1px solid var(--border-strong); background: var(--surface2); color: var(--blue-soft);
          text-decoration: none; white-space: nowrap; transition: border-color 0.2s, color 0.2s;
        }
        .page-dash-link:hover { border-color: var(--blue-soft); color: var(--text); }
        .page-title { font-size: 1.125rem; font-weight: 900; color: var(--red); }
        .page-header-status { display: flex; align-items: center; gap: 0.75rem; }
        .page-status-text { font-size: 0.75rem; color: var(--text-faint); }
        .page-recal-btn { font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); background: var(--surface2); color: var(--text-muted); border: 1px solid var(--border); cursor: pointer; transition: all 0.2s; }
        .page-recal-btn:hover { background: var(--surface3); color: var(--text); }
        .page-camera-container {
          position: relative; border-radius: var(--radius); overflow: hidden; border: 2px solid;
          transition: border-color 0.3s; margin-top: 0.5rem;
          width: min(520px, 100%); max-width: 100%;
          aspect-ratio: 4 / 3;
          max-height: min(390px, 55dvh);
        }
        .page-camera-ok      { border-color: var(--blue-soft); }
        .page-camera-warning { border-color: var(--amber); }
        .page-camera-danger  { border-color: var(--red); }
        .page-camera-off     { border-color: var(--border); }
        .page-placeholder { position: absolute; inset: 0; background: var(--surface2); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; }
        .page-placeholder-emoji { font-size: 3.5rem; }
        .page-placeholder-text { color: var(--text-faint); font-size: 0.875rem; }
        .page-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
        .page-canvas { position: absolute; inset: 0; width: 100%; height: 100%; transform: scaleX(-1); }
        .page-state-pill { position: absolute; bottom: 0.75rem; left: 0.75rem; background: rgba(0, 0, 0, 0.6); border-radius: 9999px; padding: 0.25rem 0.75rem; font-size: 0.75rem; font-weight: 700; }
        .page-pill-ok      { color: var(--blue-soft); }
        .page-pill-warning { color: var(--amber); }
        .page-pill-danger  { color: var(--red); }
        .page-start-btn { margin-top: 0.75rem; padding: 0.5rem 2rem; border-radius: var(--radius-sm); background: var(--red); color: var(--text); border: none; font-size: 0.875rem; font-weight: 700; cursor: pointer; transition: all 0.2s; }
        .page-start-btn:hover { background: #ff6b6b; }
        .page-metrics { margin-top: 0.5rem; }
        .page-hidden { display: none !important; }
      `}</style>
      <main className="page-main">
        <div className="page-header">
          <h1 className="page-title">BlinkGuard</h1>
          <Link href="/monitor" className="page-dash-link">
            Full dashboard →
          </Link>
          <div className="page-header-status">
            <div className="page-status-text">
              {isStarted
                ? faceDetected ? '🟢 Face' : '🔴 No face'
                : '⚫ Off'}
            </div>
            {isStarted && (
              <button
                onClick={() => {
                  setIsStarted(false);
                  setNeedsCalibration(true);
                }}
                className="page-recal-btn"
              >
                Recalibrate
              </button>
            )}
          </div>
        </div>

        <div className={`page-camera-container page-camera-${
          drowsinessState === 'danger'  ? 'danger' :
          drowsinessState === 'warning' ? 'warning' :
          isStarted && faceDetected ? 'ok' : 'off'
        }`}>
          {!isStarted && (
            <div className="page-placeholder">
              <span className="page-placeholder-emoji">🚗</span>
              <p className="page-placeholder-text">Click Start to begin</p>
            </div>
          )}

          <video
            ref={videoRef}
            autoPlay muted playsInline
            className={`page-video ${!isStarted ? 'page-hidden' : ''}`}
          />

          <canvas
            ref={canvasRef}
            className={`page-canvas ${!isStarted ? 'page-hidden' : ''}`}
          />

          {isStarted && (
            <div className={`page-state-pill page-pill-${drowsinessState}`}>
              {drowsinessState === 'awake'   && '👁 AWAKE'}
              {drowsinessState === 'warning' && '⚠️ DROWSY'}
              {drowsinessState === 'danger'  && '🚨 DANGER'}
            </div>
          )}
        </div>

        {!isStarted && (
          <button onClick={startCamera} className="page-start-btn">
            🚀 Start Monitoring
          </button>
        )}

        {isStarted && (
          <div className="page-metrics">
            <StatusPanel
              ear={ear}
              closedFrames={closedFrames}
              drowsinessState={drowsinessState}
              faceDetected={faceDetected}
              alertCount={alertCount}
              sessionTime={sessionTime}
            />
          </div>
        )}

        <AlertBanner drowsinessState={drowsinessState} />

      </main>
    </>
  );
}