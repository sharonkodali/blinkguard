'use client';
import type { DrowsinessState } from '@/lib/drowsiness';
import { FRAMES_DANGER } from '@/lib/drowsiness';

interface Props {
  ear: number;
  mar: number;
  closedFrames: number;
  drowsinessState: DrowsinessState;
  faceDetected: boolean;
  alertCount: number;
  sessionTime: number;
}

export default function StatusPanel({
  ear, mar, closedFrames, drowsinessState, faceDetected, alertCount, sessionTime
}: Props) {
  const stateConfig = {
    awake:   { label: '✅  AWAKE',               bar: 'bg-green-500',  text: 'text-green-400',  border: 'border-green-500/30'  },
    warning: { label: '⚠️  DROWSY WARNING',      bar: 'bg-yellow-500', text: 'text-yellow-400', border: 'border-yellow-500/30' },
    danger:  { label: '🚨  DANGER — EYES CLOSED', bar: 'bg-red-500',    text: 'text-red-400',    border: 'border-red-500/30'    },
  };

  const cfg  = stateConfig[drowsinessState];
  const pct  = Math.min(100, (closedFrames / FRAMES_DANGER) * 100);
  const mins = Math.floor(sessionTime / 60);
  const secs = sessionTime % 60;

  return (
    <div className="w-full h-full flex flex-col space-y-1 p-1">

      {/* State Banner */}
      <div className={`rounded-lg border p-1 text-center ${cfg.border} bg-gray-900 flex-shrink-0`}>
        <p className={`text-xs font-extrabold ${cfg.text}`}>{cfg.label}</p>
        {!faceDetected && (
          <p className="text-xs text-gray-400 mt-0.5">
            No face — point camera at your face
          </p>
        )}
      </div>

      {/* Session row */}
      <div className="flex justify-between text-xs text-gray-400 px-1 flex-shrink-0">
        <span>⏱ {mins}:{secs.toString().padStart(2, '0')}</span>
        <span>🔔 {alertCount}</span>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-1 flex-shrink-0">
        {/* EAR */}
        <div className="bg-gray-900 rounded-lg p-1 border border-gray-700">
          <p className="text-xs text-gray-400">EAR</p>
          <p className={`text-lg font-mono font-bold tabular-nums ${ear < 0.27 ? 'text-red-400' : 'text-green-400'}`}>
            {ear.toFixed(3)}
          </p>
        </div>

        {/* MAR */}
        <div className="bg-gray-900 rounded-lg p-1 border border-gray-700">
          <p className="text-xs text-gray-400">MAR</p>
          <p className={`text-lg font-mono font-bold tabular-nums ${mar > 0.5 ? 'text-yellow-400' : 'text-green-400'}`}>
            {mar.toFixed(3)}
          </p>
        </div>
      </div>

      {/* Drowsiness progress bar */}
      <div className="bg-gray-900 rounded-lg p-1 border border-gray-700 flex-shrink-0">
        <div className="flex justify-between text-xs text-gray-400 mb-0.5">
          <span>Drowsiness</span>
          <span>{closedFrames}/{FRAMES_DANGER}</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-150 ${cfg.bar}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

    </div>
  );
}