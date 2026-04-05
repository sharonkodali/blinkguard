'use client';
/**
 * Dedicated calibration screen. Hosts the CalibrationWizard with its own
 * video/canvas refs and handles camera setup + iOS-styled chrome. On
 * completion, returns to the home dashboard.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import CalibrationWizard from '@/components/CalibrationWizard';
import BottomNav from '@/components/BottomNav';
import { formatCameraError, getUserMediaFrontCamera } from '@/lib/camera';

export default function CalibratePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await getUserMediaFrontCamera();
      const v = videoRef.current;
      if (!v) return;
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.playsInline = true;
      v.muted = true;
      v.srcObject = stream;
      v.onloadedmetadata = async () => {
        try {
          await v.play();
          setCameraReady(true);
        } catch (e) {
          console.error('Video play failed:', e);
          setError('Could not play the camera feed. Tap "Try again".');
        }
      };
    } catch (err) {
      console.error('Camera access error:', err);
      setError(formatCameraError(err));
    }
  }, []);

  // Start camera on mount. Deferred via rAF so the lint rule sees state
  // updates happen inside an async callback, not synchronously in the effect.
  useEffect(() => {
    const video = videoRef.current;
    const raf = requestAnimationFrame(() => { startCamera(); });
    return () => {
      cancelAnimationFrame(raf);
      const stream = video?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  const handleComplete = () => {
    router.push('/');
  };

  return (
    <>
      <style>{`
        .cal-screen {
          flex: 1; position: relative; overflow-y: auto;
          background: var(--ios-background, #f2f4f8);
          padding: calc(1rem + env(safe-area-inset-top)) 1rem 6rem;
        }
        .cal-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 1rem;
        }
        .cal-title { font-size: 1.125rem; font-weight: 700; color: var(--ios-midnight); }
        .cal-back {
          font-size: 0.78rem; font-weight: 600; color: var(--ios-primary);
          text-decoration: none; padding: 0.4rem 0.75rem;
          background: #fff; border: 1px solid var(--ios-border);
          border-radius: 9999px;
        }
        .cal-stage {
          position: relative; width: 100%; aspect-ratio: 4/3;
          border-radius: 1.25rem; overflow: hidden;
          background: #0b1220; border: 1px solid var(--ios-border);
          box-shadow: 0 20px 40px -16px rgba(15,23,41,0.25);
        }
        .cal-video, .cal-canvas {
          position: absolute; inset: 0; width: 100%; height: 100%;
          object-fit: cover; transform: scaleX(-1);
        }
        .cal-loading {
          position: absolute; inset: 0; display: flex; align-items: center;
          justify-content: center; color: #fff; font-size: 0.85rem;
          background: rgba(11,18,32,0.8);
        }
        .cal-error {
          margin-top: 1rem; padding: 0.875rem 1rem; border-radius: 0.875rem;
          background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
          font-size: 0.85rem;
        }
        .cal-retry {
          display: inline-block; margin-top: 0.5rem; padding: 0.4rem 0.85rem;
          border-radius: 9999px; background: var(--ios-midnight); color: #fff;
          font-size: 0.78rem; font-weight: 600; border: none; cursor: pointer;
        }
        .cal-wizard-wrap { margin-top: 1rem; }
      `}</style>

      <div className="ios-app">
        <div className="cal-screen">
          <div className="cal-header">
            <h1 className="cal-title">Calibration</h1>
            <Link href="/" className="cal-back">Cancel</Link>
          </div>

          <div className="cal-stage">
            <video ref={videoRef} autoPlay muted playsInline className="cal-video" />
            <canvas ref={canvasRef} className="cal-canvas" />
            {!cameraReady && !error && (
              <div className="cal-loading">Starting camera…</div>
            )}
          </div>

          {error && (
            <div className="cal-error">
              {error}
              <div>
                <button
                  type="button"
                  className="cal-retry"
                  onClick={() => { setError(null); startCamera(); }}
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {cameraReady && (
            <div className="cal-wizard-wrap">
              <CalibrationWizard
                videoRef={videoRef}
                canvasRef={canvasRef}
                onCalibrationComplete={handleComplete}
              />
            </div>
          )}
        </div>

        <BottomNav />
      </div>
    </>
  );
}
