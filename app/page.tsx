'use client';
import { useRef, useEffect, useState, useCallback } from 'react';
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
  const [mar,            setMar]            = useState(0);
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

  // ─── Start camera & MediaPipe ──────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user', 
          width: { ideal: 640 }, 
          height: { ideal: 480 }
        },
        audio: false,
      });
      if (!videoRef.current) return;
      
      // Ensure video element is set up correctly
      videoRef.current.srcObject = stream;
      
      // Wait for video to be loadable before playing
      videoRef.current.onloadedmetadata = async () => {
        if (videoRef.current) {
          try {
            await videoRef.current.play();
            setIsStarted(true);
            // Small delay to ensure video is playing
            setTimeout(() => runMediaPipe(), 100);
          } catch (playErr) {
            console.error('Play error:', playErr);
          }
        }
      };
    } catch (err) {
      console.error('Camera access error:', err);
      alert('Camera permission denied. Please allow camera access and reload.');
    }
  }, []);

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
      faceMesh.onResults((results: any) => {
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
          setMar(parseFloat(currentMAR.toFixed(3)));

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

  // ─── Border color by state ─────────────────────────────────────────────────
  const borderColor =
    drowsinessState === 'danger'  ? 'border-red-500'    :
    drowsinessState === 'warning' ? 'border-yellow-400' :
    isStarted ? 'border-green-500' : 'border-gray-700';

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
    <main className="h-screen w-screen bg-gray-950 text-white flex flex-col items-center py-2 px-4 overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="w-full flex items-center justify-between">
        <h1 className="text-lg font-extrabold text-red-400">BlinkGuard</h1>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-500">
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
              className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
            >
              Recalibrate
            </button>
          )}
        </div>
      </div>

      {/* ── Camera view - MAIN ELEMENT ─────────────────────────────── */}
      <div className={`relative rounded-lg overflow-hidden border-2 ${borderColor} transition-colors duration-300 mt-2`} style={{ width: '520px', height: '390px' }}>
        {/* Placeholder when not started */}
        {!isStarted && (
          <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center gap-3">
            <span className="text-7xl">🚗</span>
            <p className="text-gray-400 text-sm">Click Start to begin</p>
          </div>
        )}

        {/* Live video */}
        <video
          ref={videoRef}
          autoPlay muted playsInline
          className={`absolute inset-0 w-full h-full object-cover ${isStarted ? 'block' : 'hidden'}`}
          style={{ transform: 'scaleX(-1)' }}
        />

        {/* Landmark canvas — same mirror as video */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ transform: 'scaleX(-1)', display: isStarted ? 'block' : 'none' }}
        />

        {/* State pill overlay */}
        {isStarted && (
          <div className="absolute bottom-3 left-3 bg-black/60 rounded-full px-3 py-1 text-xs font-bold">
            {drowsinessState === 'awake'   && <span className="text-green-400">👁 AWAKE</span>}
            {drowsinessState === 'warning' && <span className="text-yellow-400">⚠️ DROWSY</span>}
            {drowsinessState === 'danger'  && <span className="text-red-400">🚨 DANGER</span>}
          </div>
        )}
      </div>

      {/* ── Start button ────────────────────────────────────────────────────── */}
      {!isStarted && (
        <button
          onClick={startCamera}
          className="mt-3 py-2 px-8 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-sm font-bold transition-colors"
        >
          🚀 Start Monitoring
        </button>
      )}

      {/* ── Metrics / Status ────────────────────────────────────────────────── */}
      {isStarted && (
        <div className="mt-2">
          <StatusPanel
            ear={ear}
            mar={mar}
            closedFrames={closedFrames}
            drowsinessState={drowsinessState}
            faceDetected={faceDetected}
            alertCount={alertCount}
            sessionTime={sessionTime}
          />
        </div>
      )}

      {/* ── Full-screen danger overlay ───────────────────────────────────────── */}
      <AlertBanner drowsinessState={drowsinessState} />

    </main>
  );
}