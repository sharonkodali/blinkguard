'use client';
import type { DrowsinessState } from '@/lib/drowsiness';

interface Props {
  videoRef:        React.RefObject<HTMLVideoElement>;
  canvasRef:       React.RefObject<HTMLCanvasElement>;
  drowsinessState: DrowsinessState;
  ear:             number;
  isStarted:       boolean;
  onStart:         () => void;
}

export default function CameraWidget({
  videoRef, canvasRef, drowsinessState, ear, isStarted, onStart
}: Props) {
  const borderColor =
    drowsinessState === 'danger'  ? '#ef4444' :
    drowsinessState === 'warning' ? '#eab308' : '#22c55e';

  if (!isStarted) {
    return (
      <button
        onClick={onStart}
        className="absolute bottom-24 right-4 z-30 bg-red-600 text-white
                   rounded-2xl px-4 py-3 text-sm font-bold shadow-xl
                   active:bg-red-700 transition-colors"
      >
        🚀 Start Safety Monitor
      </button>
    );
  }

  return (
    <div
      className="absolute bottom-24 right-3 z-30 rounded-2xl overflow-hidden shadow-2xl"
      style={{ width: 110, border: `3px solid ${borderColor}`, background: '#000' }}
    >
      {/* Live video */}
      <div className="relative" style={{ height: 88 }}>
        <video
          ref={videoRef}
          autoPlay muted playsInline
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ transform: 'scaleX(-1)' }}
        />
      </div>

      {/* EAR value */}
      <div className="bg-gray-900 px-2 py-1 text-center">
        <p className="text-xs text-gray-400">EAR</p>
        <p
          className="text-sm font-mono font-bold tabular-nums"
          style={{ color: borderColor }}
        >
          {ear.toFixed(3)}
        </p>
      </div>

      {/* State label */}
      <div
        className="px-2 py-1 text-center text-xs font-bold"
        style={{ background: borderColor + '22', color: borderColor }}
      >
        {drowsinessState === 'awake'   ? '👁 AWAKE'   :
         drowsinessState === 'warning' ? '⚠️ DROWSY'  : '🚨 DANGER'}
      </div>
    </div>
  );
}