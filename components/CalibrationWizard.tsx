'use client';
import { useRef, useEffect, useState, useCallback } from 'react';
import {
  computeAdaptiveEAR,
  computeAdaptiveMAR,
  type CalibrationData,
  type FaceLandmark,
  saveCalibrationData,
} from '@/lib/drowsiness';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onCalibrationComplete: () => void;
}

type CalibrationStep = 'start' | 'eyes-open' | 'eyes-closed' | 'normal-blink' | 'yawning' | 'complete';

type FaceMeshResults = { multiFaceLandmarks?: FaceLandmark[][] };

export default function CalibrationWizard({
  videoRef,
  canvasRef,
  onCalibrationComplete,
}: Props) {
  const [step, setStep] = useState<CalibrationStep>('start');
  const [timeRemaining, setTimeRemaining] = useState(3);
  const [isCollecting, setIsCollecting] = useState(false);
  const [currentEAR, setCurrentEAR] = useState(0);
  const [currentMAR, setCurrentMAR] = useState(0);
  const calibDataRef = useRef<CalibrationData>({
    eyesOpenEARValues: [],
    eyesClosedEARValues: [],
    normalBlinkEARValues: [],
    yawningMARValues: [],
    timestamp: Date.now(),
  });

  // Collect data during calibration
  useEffect(() => {
    if (!isCollecting || !videoRef.current || !canvasRef.current) return;

    // Instance from dynamic import; MediaPipe types are incomplete.
    let faceMesh: {
      close: () => void;
      setOptions: (o: object) => void;
      onResults: (cb: (r: FaceMeshResults) => void) => void;
      send: (input: { image: HTMLVideoElement }) => Promise<void>;
    } | null = null;

    const setupMediaPipe = async () => {
      const { FaceMesh } = await import('@mediapipe/face_mesh');

      faceMesh = new FaceMesh({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`,
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      faceMesh.onResults((results: FaceMeshResults) => {
        if (!results.multiFaceLandmarks?.length) return;

        const lm = results.multiFaceLandmarks[0];
        const ear = computeAdaptiveEAR(lm);
        const mar = computeAdaptiveMAR(lm);

        // Update display in real-time
        setCurrentEAR(ear);
        setCurrentMAR(mar);

        const data = calibDataRef.current;
        switch (step) {
          case 'eyes-open':
            data.eyesOpenEARValues.push(ear);
            break;
          case 'eyes-closed':
            data.eyesClosedEARValues.push(ear);
            break;
          case 'normal-blink':
            data.normalBlinkEARValues.push(ear);
            break;
          case 'yawning':
            data.yawningMARValues.push(mar);
            break;
        }

        // Draw canvas overlay
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw eye landmarks
        const LEFT_EYE_IDX = [33, 7, 163, 144, 145, 153, 154, 155, 133, 246, 161, 160, 159, 158, 157, 173];
        const RIGHT_EYE_IDX = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];

        const eyeColor = ear < 0.27 ? 'rgba(255, 60, 60, 0.9)' : 'rgba(60, 255, 120, 0.9)';
        ctx.fillStyle = eyeColor;
        for (const idx of [...LEFT_EYE_IDX, ...RIGHT_EYE_IDX]) {
          if (!lm[idx]) continue;
          ctx.beginPath();
          ctx.arc(lm[idx].x * canvas.width, lm[idx].y * canvas.height, 2.5, 0, 2 * Math.PI);
          ctx.fill();
        }

        // Draw metrics text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`EAR: ${ear.toFixed(3)}`, 20, 40);
        ctx.fillText(`MAR: ${mar.toFixed(3)}`, 20, 70);
      });

      if (videoRef.current) {
        const { Camera } = await import('@mediapipe/camera_utils');
        const cam = new Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && faceMesh) {
              await faceMesh.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480,
        });
        cam.start();
      }
    };

    setupMediaPipe();
  }, [isCollecting, step, videoRef, canvasRef]);

  const completeCalibration = useCallback(() => {
    const data = calibDataRef.current;
    
    // Validate we have enough data
    if (
      data.eyesOpenEARValues.length < 10 ||
      data.eyesClosedEARValues.length < 10 ||
      data.normalBlinkEARValues.length < 5 ||
      data.yawningMARValues.length < 5
    ) {
      alert('Not enough calibration data. Please try again.');
      setStep('start');
      return;
    }

    saveCalibrationData(data);
    onCalibrationComplete();
  }, [onCalibrationComplete]);

  // Timer logic
  useEffect(() => {
    if (!isCollecting || timeRemaining <= 0) return;

    const timer = setTimeout(() => setTimeRemaining(t => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [isCollecting, timeRemaining]);

  // Move to next step when timer finishes
  useEffect(() => {
    if (timeRemaining === 0 && isCollecting) {
      switch (step) {
        case 'eyes-open':
          setStep('eyes-closed');
          setTimeRemaining(3);
          // Keep isCollecting true to keep the timer running
          break;
        case 'eyes-closed':
          setStep('normal-blink');
          setTimeRemaining(4);
          break;
        case 'normal-blink':
          setStep('yawning');
          setTimeRemaining(4);
          break;
        case 'yawning':
          completeCalibration();
          setIsCollecting(false);
          setStep('complete');
          break;
      }
    }
  }, [timeRemaining, isCollecting, step, completeCalibration]);

  const startStep = useCallback(() => {
    setStep('eyes-open');
    setTimeRemaining(3);
    setIsCollecting(true);
  }, []);

  const skipCalibration = useCallback(() => {
    onCalibrationComplete();
  }, [onCalibrationComplete]);

  return (
    <>
      <style>{`
        .cw { width: 100vw; height: 100vh; background: var(--bg); color: var(--text); display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 1rem; gap: 1rem; overflow: hidden; font-family: inherit; }
        .cw-title { font-size: 1.5rem; font-weight: 900; color: var(--red); margin-top: 0.5rem; }
        .cw-video-container { position: relative; width: 384px; height: 288px; border-radius: var(--radius); overflow: hidden; border: 2px solid var(--blue-soft); background: var(--surface); }
        .cw-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
        .cw-canvas { position: absolute; inset: 0; width: 100%; height: 100%; transform: scaleX(-1); }
        .cw-metrics { display: flex; gap: 32px; text-align: center; }
        .cw-metric { background: var(--surface2); border-radius: var(--radius-sm); padding: 12px; border: 1px solid var(--border); }
        .cw-metric-label { font-size: 0.75rem; color: var(--text-faint); letter-spacing: 0.1em; margin-bottom: 4px; }
        .cw-metric-value { font-size: 2rem; font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--blue-soft); }
        .cw-step { display: flex; flex-direction: column; align-items: center; gap: 1.5rem; }
        .cw-emoji { font-size: 3rem; animation: cw-pulse 1s infinite; }
        .cw-step-title { font-size: 1.25rem; font-weight: 700; text-align: center; }
        .cw-timer { font-size: 3.5rem; font-weight: 700; color: var(--blue-soft); }
        .cw-step-subtitle { font-size: 0.875rem; color: var(--text-faint); text-align: center; max-width: 20rem; }
        .cw-button-group { display: flex; flex-direction: column; gap: 1rem; align-items: center; }
        .cw-button { padding: 0.75rem 2rem; border-radius: var(--radius-sm); border: none; font-weight: 700; font-size: 0.95rem; cursor: pointer; transition: all 0.2s; }
        .cw-button-primary { background: var(--red); color: var(--text); }
        .cw-button-primary:hover { background: #ff6b6b; }
        .cw-button-secondary { background: var(--surface2); color: var(--text-muted); border: 1px solid var(--border); }
        .cw-button-secondary:hover { background: var(--surface3); color: var(--text); }
        .cw-complete { text-align: center; }
        .cw-complete-emoji { font-size: 4rem; }
        .cw-complete-title { font-size: 1.5rem; font-weight: 700; margin-top: 1rem; }
        .cw-complete-subtitle { color: var(--text-muted); max-width: 20rem; margin-top: 0.5rem; }
        @keyframes cw-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
      `}</style>
      <div className="cw">
        <h1 className="cw-title">BlinkGuard Calibration</h1>

        {/* Camera Feed Container */}
        <div className="cw-video-container">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="cw-video"
          />
          <canvas
            ref={canvasRef}
            className="cw-canvas"
          />
        </div>

        {/* Real-time Metrics Display */}
        <div className="cw-metrics">
          <div className="cw-metric">
            <p className="cw-metric-label">EAR (Eye Aspect Ratio)</p>
            <p className="cw-metric-value">{currentEAR.toFixed(3)}</p>
          </div>
          <div className="cw-metric">
            <p className="cw-metric-label">MAR (Mouth Aspect Ratio)</p>
            <p className="cw-metric-value">{currentMAR.toFixed(3)}</p>
          </div>
        </div>

        {step === 'start' && (
          <div className="cw-step">
            <div className="cw-emoji">👁</div>
            <p className="cw-step-title">Eye Calibration Setup</p>
            <p className="cw-step-subtitle">
              We&apos;ll guide you through simple eye movements to calibrate the system for your unique eyes.
            </p>
            <div className="cw-button-group">
              <button onClick={startStep} className="cw-button cw-button-primary">
                Start Calibration
              </button>
              <button onClick={skipCalibration} className="cw-button cw-button-secondary">
                Skip for now
              </button>
            </div>
          </div>
        )}

        {step === 'eyes-open' && (
          <div className="cw-step">
            <div className="cw-emoji">📖</div>
            <p className="cw-step-title">Keep eyes wide open</p>
            <div className="cw-timer">{timeRemaining}</div>
            <p className="cw-step-subtitle">
              Look at the camera. Keep eyes as open as possible. (EAR should be high)
            </p>
          </div>
        )}

        {step === 'eyes-closed' && (
          <div className="cw-step">
            <div className="cw-emoji">😴</div>
            <p className="cw-step-title">Close your eyes fully</p>
            <div className="cw-timer">{timeRemaining}</div>
            <p className="cw-step-subtitle">
              Completely close your eyes and keep them shut. (EAR should be low)
            </p>
          </div>
        )}

        {step === 'normal-blink' && (
          <div className="cw-step">
            <div className="cw-emoji">✨</div>
            <p className="cw-step-title">Blink naturally</p>
            <div className="cw-timer">{timeRemaining}</div>
            <p className="cw-step-subtitle">
              Perform 3-4 natural blinks at your normal pace.
            </p>
          </div>
        )}

        {step === 'yawning' && (
          <div className="cw-step">
            <div className="cw-emoji">🥱</div>
            <p className="cw-step-title">Perform a few yawns</p>
            <div className="cw-timer">{timeRemaining}</div>
            <p className="cw-step-subtitle">
              Open your mouth wide like you&apos;re yawning. 2-3 yawns is enough.
            </p>
          </div>
        )}

        {step === 'complete' && (
          <div className="cw-step cw-complete">
            <div className="cw-complete-emoji">✅</div>
            <p className="cw-complete-title">Calibration Complete!</p>
            <p className="cw-complete-subtitle">
              Your personalized thresholds have been set. BlinkGuard is now optimized for your eyes.
            </p>
            <div className="cw-button-group" style={{ marginTop: '1rem' }}>
              <button onClick={() => onCalibrationComplete()} className="cw-button cw-button-primary">
                Start Monitoring
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
