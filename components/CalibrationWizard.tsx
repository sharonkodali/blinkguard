'use client';
import { useRef, useEffect, useState, useCallback } from 'react';
import {
  computeEAR,
  computeMAR,
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
        const ear = computeEAR(lm);
        const mar = computeMAR(lm);

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

  // Progress: start -> eyes-open(1) -> eyes-closed(2) -> normal-blink(3) -> yawning(4) -> complete
  const stepNumber =
    step === 'eyes-open' ? 1
    : step === 'eyes-closed' ? 2
    : step === 'normal-blink' ? 3
    : step === 'yawning' ? 4
    : step === 'complete' ? 5
    : 0;
  const totalSteps = 4;

  // Tip copy for each capture step. Short, direct, action-first.
  const stepContent: Record<
    Exclude<CalibrationStep, 'start' | 'complete'>,
    { title: string; sub: string; tip: string }
  > = {
    'eyes-open': {
      title: 'Look at the camera',
      sub: 'Keep both eyes comfortably wide open and hold still.',
      tip: 'This teaches BlinkGuard what your alert, open eyes look like.',
    },
    'eyes-closed': {
      title: 'Close your eyes fully',
      sub: 'Shut your eyes gently and keep them closed until the timer ends.',
      tip: 'This sets the boundary for detecting eyes-closed drowsiness.',
    },
    'normal-blink': {
      title: 'Blink naturally',
      sub: 'Do 3–4 normal blinks at your everyday pace — don\u2019t force them.',
      tip: 'This tells the system what a healthy blink rhythm looks like.',
    },
    yawning: {
      title: 'Open wide like a yawn',
      sub: 'Stretch your mouth open 2–3 times as if mid-yawn.',
      tip: 'This calibrates the yawn detector so it doesn\u2019t trigger on talking.',
    },
  };

  return (
    <>
      <style>{`
        .cal-wrap {
          flex: 1; display: flex; flex-direction: column; min-height: 0;
          background: var(--ios-background);
          padding-bottom: calc(1rem + env(safe-area-inset-bottom));
        }
        .cal-header {
          padding: calc(1.25rem + env(safe-area-inset-top)) 1rem 0.875rem;
          background: var(--ios-midnight); color: #fff;
          border-bottom-left-radius: 1.25rem; border-bottom-right-radius: 1.25rem;
        }
        .cal-header h1 { color: #fff; font-size: 1.15rem; font-weight: 600; margin: 0; }
        .cal-header p  { color: rgba(255,255,255,0.7); font-size: 0.78rem; margin-top: 0.2rem; }
        .cal-progress { display: flex; gap: 0.3rem; margin-top: 0.8rem; }
        .cal-progress-seg {
          flex: 1; height: 0.3rem; border-radius: 9999px;
          background: rgba(255,255,255,0.18);
        }
        .cal-progress-seg.filled { background: var(--ios-safe); }
        .cal-progress-seg.active { background: #fff; }

        .cal-body { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }

        .cal-video-card {
          position: relative; width: 100%; aspect-ratio: 4 / 3;
          background: #0f1729; border-radius: 1rem; overflow: hidden;
          border: 1px solid var(--ios-border);
          box-shadow: 0 10px 22px -10px rgba(15,23,41,0.35);
        }
        .cal-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
        .cal-canvas { position: absolute; inset: 0; width: 100%; height: 100%; transform: scaleX(-1); pointer-events: none; }
        .cal-timer-pill {
          position: absolute; top: 0.75rem; right: 0.75rem;
          background: rgba(15,23,41,0.8); color: #fff;
          padding: 0.4rem 0.75rem; border-radius: 9999px;
          font-size: 0.72rem; font-weight: 600;
          border: 1px solid rgba(255,255,255,0.2);
          backdrop-filter: blur(8px);
        }

        .cal-metrics {
          display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;
        }
        .cal-metric {
          background: #fff; border: 1px solid var(--ios-border); border-radius: 0.75rem;
          padding: 0.6rem 0.75rem;
          box-shadow: 0 1px 2px rgba(15,23,41,0.04);
        }
        .cal-metric-l { font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ios-muted-foreground); font-weight: 600; }
        .cal-metric-v { font-size: 1.15rem; font-weight: 700; color: var(--ios-midnight); font-family: 'JetBrains Mono', monospace; margin-top: 0.15rem; }

        .cal-card {
          background: #fff; border: 1px solid var(--ios-border); border-radius: 1rem;
          padding: 1.1rem 1rem;
          box-shadow: 0 1px 2px rgba(15,23,41,0.04);
        }
        .cal-card h2 { color: var(--ios-midnight); font-size: 1.05rem; font-weight: 600; margin: 0; }
        .cal-card p  { color: var(--ios-muted-foreground); font-size: 0.82rem; margin-top: 0.35rem; line-height: 1.5; }
        .cal-tip {
          margin-top: 0.75rem; padding: 0.55rem 0.75rem;
          background: rgba(16,185,129,0.08); color: #047857;
          border: 1px solid rgba(16,185,129,0.2); border-radius: 0.625rem;
          font-size: 0.72rem; line-height: 1.45;
        }

        .cal-intro-list {
          margin: 0.75rem 0 0; padding: 0;
          display: flex; flex-direction: column; gap: 0.45rem;
          list-style: none;
        }
        .cal-intro-list li {
          display: flex; gap: 0.55rem; align-items: flex-start;
          font-size: 0.78rem; color: #334155; line-height: 1.45;
        }
        .cal-intro-num {
          flex-shrink: 0;
          width: 1.25rem; height: 1.25rem; border-radius: 9999px;
          background: var(--ios-midnight); color: #fff;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 0.62rem; font-weight: 700;
        }

        .cal-actions { display: flex; gap: 0.5rem; }
        .cal-btn {
          flex: 1; padding: 0.85rem 1rem; border-radius: 9999px;
          border: none; font-family: inherit; font-weight: 600; font-size: 0.85rem;
          cursor: pointer;
        }
        .cal-btn-primary {
          background: var(--ios-midnight); color: #fff;
          box-shadow: 0 8px 20px -8px rgba(15,23,41,0.4);
        }
        .cal-btn-ghost {
          background: #fff; color: var(--ios-midnight-lighter);
          border: 1px solid var(--ios-border);
        }

        .cal-timer-big {
          font-size: 2.5rem; font-weight: 700; color: var(--ios-midnight);
          text-align: center; font-variant-numeric: tabular-nums;
          margin: 0.4rem 0 0;
        }
        .cal-timer-label { text-align: center; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ios-muted-foreground); }
      `}</style>

      <div className="ios-app">
        <div className="cal-wrap">
          <div className="cal-header">
            <h1>Calibration</h1>
            <p>
              {step === 'start'
                ? 'Personalize BlinkGuard to your eyes in under 20 seconds.'
                : step === 'complete'
                  ? 'All done — thresholds saved to this device.'
                  : `Step ${stepNumber} of ${totalSteps}`}
            </p>
            {stepNumber > 0 && stepNumber <= totalSteps && (
              <div className="cal-progress">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className={`cal-progress-seg ${
                      n < stepNumber ? 'filled' : n === stepNumber ? 'active' : ''
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="cal-body">
            {/* Camera preview — always rendered so MediaPipe can attach */}
            <div className="cal-video-card">
              <video ref={videoRef} autoPlay muted playsInline className="cal-video" />
              <canvas ref={canvasRef} className="cal-canvas" />
              {isCollecting && (
                <div className="cal-timer-pill">{timeRemaining}s</div>
              )}
            </div>

            {/* Live metrics — only useful once collecting */}
            {(isCollecting || step === 'complete') && (
              <div className="cal-metrics">
                <div className="cal-metric">
                  <div className="cal-metric-l">EAR · Eye ratio</div>
                  <div className="cal-metric-v">{currentEAR.toFixed(3)}</div>
                </div>
                <div className="cal-metric">
                  <div className="cal-metric-l">MAR · Mouth ratio</div>
                  <div className="cal-metric-v">{currentMAR.toFixed(3)}</div>
                </div>
              </div>
            )}

            {/* Step-specific copy */}
            {step === 'start' && (
              <div className="cal-card">
                <h2>Before you start</h2>
                <p>
                  BlinkGuard learns your personal baseline so it can tell your
                  normal blinks apart from actual fatigue. You&apos;ll do 4 quick
                  actions on camera — about 14 seconds total.
                </p>
                <ol className="cal-intro-list">
                  <li><span className="cal-intro-num">1</span><span><strong>Keep eyes open</strong> for 3 seconds</span></li>
                  <li><span className="cal-intro-num">2</span><span><strong>Close eyes fully</strong> for 3 seconds</span></li>
                  <li><span className="cal-intro-num">3</span><span><strong>Blink naturally</strong> 3–4 times (4 seconds)</span></li>
                  <li><span className="cal-intro-num">4</span><span><strong>Yawn wide</strong> 2–3 times (4 seconds)</span></li>
                </ol>
                <div className="cal-tip">
                  Sit where you normally drive, remove sunglasses, and make sure your face is well lit and centered in the frame.
                </div>
              </div>
            )}

            {step !== 'start' && step !== 'complete' && (
              <div className="cal-card">
                <h2>{stepContent[step].title}</h2>
                <p>{stepContent[step].sub}</p>
                <p className="cal-timer-big">{timeRemaining}</p>
                <p className="cal-timer-label">seconds remaining</p>
                <div className="cal-tip">{stepContent[step].tip}</div>
              </div>
            )}

            {step === 'complete' && (
              <div className="cal-card">
                <h2>Calibration complete</h2>
                <p>
                  Your personalized EAR and MAR thresholds are saved on this
                  device. BlinkGuard will now use your baseline for every drive.
                </p>
                <div className="cal-tip">
                  Re-calibrate anytime if your lighting, seating, or eyewear changes significantly.
                </div>
              </div>
            )}

            {/* Actions */}
            {step === 'start' && (
              <div className="cal-actions">
                <button type="button" className="cal-btn cal-btn-primary" onClick={startStep}>
                  Begin calibration
                </button>
                <button type="button" className="cal-btn cal-btn-ghost" onClick={skipCalibration}>
                  Skip
                </button>
              </div>
            )}
            {step === 'complete' && (
              <div className="cal-actions">
                <button type="button" className="cal-btn cal-btn-primary" onClick={onCalibrationComplete}>
                  Start monitoring
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
