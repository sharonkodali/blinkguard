'use client';
/**
 * useDrowsinessDetector — single source of truth for the camera + MediaPipe
 * drowsiness detection pipeline.
 *
 * Returns refs for <video> and <canvas> elements + live state. The consumer
 * is responsible for rendering those elements anywhere in their layout; the
 * hook just wires up the stream, the face mesh, and the session lifecycle.
 *
 * Live state is also mirrored to `lib/liveSession.ts` so other pages (Metrics)
 * can reactively display the current session without owning the camera.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeEAR,
  computeMAR,
  isEyeClosed,
  isYawning,
  getDrowsinessState,
  FRAMES_DANGER,
  type DrowsinessState,
} from '@/lib/drowsiness';
import { addSession } from '@/lib/sessions';
import {
  updateLiveSession,
  resetLiveSession,
} from '@/lib/liveSession';

const LEFT_EYE_IDX = [33, 7, 163, 144, 145, 153, 154, 155, 133, 246, 161, 160, 159, 158, 157, 173];
const RIGHT_EYE_IDX = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];

export interface DrowsinessDetectorOptions {
  /**
   * When true, the hook draws the face mesh + eye outlines on the canvas.
   * When false (e.g. for a small preview), it still runs detection but keeps
   * the canvas clean so the raw video is visible.
   */
  drawMesh?: boolean;
  /** Fire voice/vibration alerts on danger state. */
  enableAlerts?: boolean;
  /** Save a SessionData record to localStorage when the detector stops. */
  persistOnStop?: boolean;
}

export interface DrowsinessDetectorState {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isStarted: boolean;
  start: () => Promise<void>;
  stop: () => void;
  ear: number;
  closedFrames: number;
  drowsinessState: DrowsinessState;
  faceDetected: boolean;
  yawning: boolean;
  alertCount: number;
  sessionTime: number;
  blinkRate: number;
  eyeOpenPct: number;
  error: string | null;
}

export function useDrowsinessDetector(
  options: DrowsinessDetectorOptions = {},
): DrowsinessDetectorState {
  const { drawMesh = true, enableAlerts = true, persistOnStop = true } = options;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isStarted, setIsStarted] = useState(false);
  const [ear, setEar] = useState(0);
  const [closedFrames, setClosedFrames] = useState(0);
  const [drowsinessState, setDrowsinessState] = useState<DrowsinessState>('awake');
  const [yawning, setYawning] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);
  const [blinkRate, setBlinkRate] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs that tick every frame — keep them out of React state to avoid churn.
  const closedRef = useRef(0);
  const lastClosedRef = useRef(false);
  const blinkCountRef = useRef(0);
  const maxClosedFramesRef = useRef(0);
  const earValuesRef = useRef<number[]>([]);
  const sessionStartRef = useRef<number | null>(null);
  const alertCoolingRef = useRef(false);
  const lastAlertRef = useRef(0);
  const cameraInstanceRef = useRef<{ stop: () => void } | null>(null);
  const faceMeshInstanceRef = useRef<{ close: () => void } | null>(null);

  const eyeOpenPct = Math.max(0, Math.min(100, Math.round((ear / 0.3) * 100)));

  // ── Session timer + rolling blink-rate computation ─────────────────────
  useEffect(() => {
    if (!isStarted) return;
    const tick = setInterval(() => setSessionTime((t) => t + 1), 1000);
    return () => clearInterval(tick);
  }, [isStarted]);

  useEffect(() => {
    if (!isStarted) return;
    const id = setInterval(() => {
      const elapsedMin = Math.max(1 / 60, sessionTime / 60);
      setBlinkRate(Math.round(blinkCountRef.current / elapsedMin));
    }, 2000);
    return () => clearInterval(id);
  }, [isStarted, sessionTime]);

  // ── Mirror live state to the cross-page store ──────────────────────────
  useEffect(() => {
    if (!isStarted) return;
    updateLiveSession({
      isActive: true,
      faceDetected,
      ear,
      closedFrames,
      blinkRate,
      alertCount,
      sessionTime,
      yawning,
      drowsinessState,
      eyeOpenPct,
      startedAt: sessionStartRef.current,
    });
  }, [
    isStarted,
    faceDetected,
    ear,
    closedFrames,
    blinkRate,
    alertCount,
    sessionTime,
    yawning,
    drowsinessState,
    eyeOpenPct,
  ]);

  // ── Alert trigger (vibration only — AlertBanner owns audio/speech) ────────
  const triggerAlert = useCallback(() => {
    if (!enableAlerts) return;
    const now = Date.now();
    if (alertCoolingRef.current || now - lastAlertRef.current < 5000) return;
    alertCoolingRef.current = true;
    lastAlertRef.current = now;
    setAlertCount((c) => c + 1);

    // Aggressive vibration pattern — AlertBanner handles beeps + speech
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([700, 100, 700, 100, 700, 100, 700]);
    }
    setTimeout(() => {
      alertCoolingRef.current = false;
    }, 3500);
  }, [enableAlerts]);

  // ── Start the camera + MediaPipe pipeline ──────────────────────────────
  const start = useCallback(async () => {
    if (isStarted) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      const v = videoRef.current;
      if (!v) {
        stream.getTracks().forEach((t) => t.stop());
        setError('Video element not mounted yet.');
        return;
      }
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.playsInline = true;
      v.muted = true;
      v.srcObject = stream;

      await new Promise<void>((resolve) => {
        const onMeta = () => {
          v.removeEventListener('loadedmetadata', onMeta);
          resolve();
        };
        v.addEventListener('loadedmetadata', onMeta);
      });
      await v.play();

      // Reset session accumulators
      closedRef.current = 0;
      lastClosedRef.current = false;
      blinkCountRef.current = 0;
      maxClosedFramesRef.current = 0;
      earValuesRef.current = [];
      sessionStartRef.current = Date.now();
      setSessionTime(0);
      setAlertCount(0);
      setIsStarted(true);

      // Dynamic imports — MediaPipe must not run during SSR.
      const { FaceMesh, FACEMESH_TESSELATION } = await import('@mediapipe/face_mesh');
      const { Camera } = await import('@mediapipe/camera_utils');
      const { drawConnectors } = await import('@mediapipe/drawing_utils');

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

      faceMesh.onResults((results: { multiFaceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>> }) => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video) return;
        const ctx = canvas?.getContext('2d');

        if (canvas) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }

        if (!results.multiFaceLandmarks?.length) {
          setFaceDetected(false);
          closedRef.current = 0;
          setClosedFrames(0);
          setDrowsinessState('awake');
          return;
        }

        setFaceDetected(true);
        const lm = results.multiFaceLandmarks[0];
        try {
          const currentEAR = computeEAR(lm);
          const currentMAR = computeMAR(lm);
          setEar(parseFloat(currentEAR.toFixed(3)));

          const closed = isEyeClosed(currentEAR);
          if (closed && !lastClosedRef.current) blinkCountRef.current += 1;
          lastClosedRef.current = closed;

          closedRef.current = closed
            ? Math.min(closedRef.current + 1, FRAMES_DANGER + 5)
            : Math.max(0, closedRef.current - 2);
          setClosedFrames(closedRef.current);
          earValuesRef.current.push(currentEAR);
          if (closedRef.current > maxClosedFramesRef.current) {
            maxClosedFramesRef.current = closedRef.current;
          }

          const yawn = isYawning(currentMAR);
          setYawning(yawn);
          const state = getDrowsinessState(closedRef.current, yawn);
          setDrowsinessState(state);
          if (state === 'danger') triggerAlert();

          // Optional canvas overlays
          if (drawMesh && ctx && canvas) {
            drawConnectors(ctx, lm, FACEMESH_TESSELATION, {
              color: 'rgba(16,185,129,0.35)',
              lineWidth: 0.6,
            });
            const eyeStroke = closed ? 'rgba(239,68,68,0.95)' : 'rgba(16,185,129,0.95)';
            const eyeFill = closed ? 'rgba(239,68,68,1)' : 'rgba(16,185,129,1)';
            ctx.strokeStyle = eyeStroke;
            ctx.lineWidth = 2;
            const drawEye = (idxs: number[]) => {
              ctx.beginPath();
              idxs.forEach((idx, i) => {
                const p = lm[idx];
                if (!p) return;
                const x = p.x * canvas.width;
                const y = p.y * canvas.height;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              });
              ctx.closePath();
              ctx.stroke();
            };
            drawEye(LEFT_EYE_IDX);
            drawEye(RIGHT_EYE_IDX);
            ctx.fillStyle = eyeFill;
            for (const idx of [...LEFT_EYE_IDX, ...RIGHT_EYE_IDX]) {
              if (!lm[idx]) continue;
              ctx.beginPath();
              ctx.arc(lm[idx].x * canvas.width, lm[idx].y * canvas.height, 2.2, 0, 2 * Math.PI);
              ctx.fill();
            }
            if (yawn && lm[13]) {
              ctx.strokeStyle = 'rgba(245,158,11,0.85)';
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.arc(lm[13].x * canvas.width, lm[13].y * canvas.height, 16, 0, 2 * Math.PI);
              ctx.stroke();
            }
          }
        } catch (e) {
          console.error('Landmark error:', e);
          setFaceDetected(false);
        }
      });

      faceMeshInstanceRef.current = faceMesh as unknown as { close: () => void };

      const cam = new Camera(v, {
        onFrame: async () => {
          if (videoRef.current) {
            await faceMesh.send({ image: videoRef.current });
          }
        },
        width: 640,
        height: 480,
      });
      cam.start();
      cameraInstanceRef.current = cam as unknown as { stop: () => void };
    } catch (e) {
      console.error('Detector start error:', e);
      setError(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access and try again.'
          : 'Could not start the camera.',
      );
      setIsStarted(false);
    }
  }, [isStarted, drawMesh, triggerAlert]);

  // ── Stop the pipeline + persist the session ────────────────────────────
  const stop = useCallback(() => {
    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
    cameraInstanceRef.current?.stop?.();
    cameraInstanceRef.current = null;
    faceMeshInstanceRef.current?.close?.();
    faceMeshInstanceRef.current = null;

    if (persistOnStop && sessionStartRef.current && sessionTime > 0) {
      const avgEAR =
        earValuesRef.current.length > 0
          ? earValuesRef.current.reduce((a, b) => a + b, 0) / earValuesRef.current.length
          : 0;
      addSession({
        duration: sessionTime,
        alerts: alertCount,
        avgEAR,
        maxClosedFrames: maxClosedFramesRef.current,
        safetyScore: Math.max(
          0,
          100 - alertCount * 20 - maxClosedFramesRef.current * 0.5,
        ),
      });
    }

    sessionStartRef.current = null;
    setIsStarted(false);
    setFaceDetected(false);
    setDrowsinessState('awake');
    setClosedFrames(0);
    setEar(0);
    resetLiveSession();
  }, [alertCount, persistOnStop, sessionTime]);

  // Cleanup on unmount: release camera + reset live store
  useEffect(() => {
    return () => {
      const v = videoRef.current;
      const stream = v?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      cameraInstanceRef.current?.stop?.();
      faceMeshInstanceRef.current?.close?.();
      resetLiveSession();
    };
  }, []);

  return {
    videoRef,
    canvasRef,
    isStarted,
    start,
    stop,
    ear,
    closedFrames,
    drowsinessState,
    faceDetected,
    yawning,
    alertCount,
    sessionTime,
    blinkRate,
    eyeOpenPct,
    error,
  };
}
