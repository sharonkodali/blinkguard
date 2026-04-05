'use client';
import { useRef, useEffect, useState, useCallback } from 'react';
import {
  computeEAR,
  computeMAR,
  type CalibrationData,
  saveCalibrationData,
} from '@/lib/drowsiness';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onCalibrationComplete: () => void;
}

type CalibrationStep = 'start' | 'eyes-open' | 'eyes-closed' | 'normal-blink' | 'yawning' | 'complete';

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

    let faceMesh: any = null;

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

      faceMesh.onResults((results: any) => {
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

  return (
    <div className="h-screen w-screen bg-gray-950 text-white flex flex-col items-center justify-start p-4 gap-4 overflow-hidden">
      <h1 className="text-2xl font-extrabold text-red-400 mt-2">BlinkGuard Calibration</h1>

      {/* Camera Feed Container */}
      <div className="relative w-96 h-72 rounded-lg overflow-hidden border-2 border-green-500 bg-gray-900">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ transform: 'scaleX(-1)' }}
        />
      </div>

      {/* Real-time Metrics Display */}
      <div className="flex gap-8 text-center">
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
          <p className="text-xs text-gray-400">EAR (Eye Aspect Ratio)</p>
          <p className="text-3xl font-mono font-bold text-green-400">{currentEAR.toFixed(3)}</p>
        </div>
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
          <p className="text-xs text-gray-400">MAR (Mouth Aspect Ratio)</p>
          <p className="text-3xl font-mono font-bold text-blue-400">{currentMAR.toFixed(3)}</p>
        </div>
      </div>

      {step === 'start' && (
        <div className="flex flex-col items-center gap-4">
          <div className="text-6xl">👁</div>
          <p className="text-center text-gray-300 max-w-sm">
            We'll guide you through simple eye movements to calibrate the system for your unique eyes.
          </p>
          <button
            onClick={startStep}
            className="mt-4 py-3 px-8 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold"
          >
            Start Calibration
          </button>
          <button
            onClick={skipCalibration}
            className="py-2 px-6 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm"
          >
            Skip for now
          </button>
        </div>
      )}

      {step === 'eyes-open' && (
        <div className="flex flex-col items-center gap-6">
          <div className="text-5xl animate-pulse">📖</div>
          <p className="text-xl font-bold text-center">Keep your eyes wide open</p>
          <div className="text-6xl font-bold text-green-400">{timeRemaining}</div>
          <div className="text-sm text-gray-400 text-center max-w-xs">
            Look at the camera. Keep eyes as open as possible. (EAR should be high)
          </div>
        </div>
      )}

      {step === 'eyes-closed' && (
        <div className="flex flex-col items-center gap-6">
          <div className="text-5xl animate-pulse">😴</div>
          <p className="text-xl font-bold text-center">Close your eyes fully</p>
          <div className="text-6xl font-bold text-yellow-400">{timeRemaining}</div>
          <div className="text-sm text-gray-400 text-center max-w-xs">
            Completely close your eyes and keep them shut. (EAR should be low)
          </div>
        </div>
      )}

      {step === 'normal-blink' && (
        <div className="flex flex-col items-center gap-6">
          <div className="text-5xl animate-pulse">✨</div>
          <p className="text-xl font-bold text-center">Blink naturally</p>
          <div className="text-6xl font-bold text-blue-400">{timeRemaining}</div>
          <div className="text-sm text-gray-400 text-center max-w-xs">
            Perform 3-4 natural blinks at your normal pace.
          </div>
        </div>
      )}

      {step === 'yawning' && (
        <div className="flex flex-col items-center gap-6">
          <div className="text-5xl animate-pulse">🥱</div>
          <p className="text-xl font-bold text-center">Perform a few yawns</p>
          <div className="text-6xl font-bold text-purple-400">{timeRemaining}</div>
          <div className="text-sm text-gray-400 text-center max-w-xs">
            Open your mouth wide like you're yawning. 2-3 yawns is enough.
          </div>
        </div>
      )}

      {step === 'complete' && (
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="text-6xl">✅</div>
          <p className="text-2xl font-bold">Calibration Complete!</p>
          <p className="text-gray-400 max-w-sm">
            Your personalized thresholds have been set. BlinkGuard is now optimized for your eyes.
          </p>
          <button
            onClick={() => onCalibrationComplete()}
            className="mt-4 py-3 px-8 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold"
          >
            Start Monitoring
          </button>
        </div>
      )}
    </div>
  );
}
