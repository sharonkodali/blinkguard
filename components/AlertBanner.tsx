'use client';
/**
 * AlertBanner — full-screen drowsiness alert with graded urgency.
 *
 * warning → amber pulse overlay  + sharp double-beep tone  + urgent AI voice
 * danger  → red strobe overlay   + emergency siren sweep   + loud AI voice
 *
 * Mobile audio strategy
 * ─────────────────────
 * iOS Safari and Android Chrome both require an AudioContext to be created
 * (or resumed) inside a user-gesture handler before it can play freely.
 * We use three techniques together:
 *   1. Module-level singleton AudioContext — survives component remounts.
 *   2. Re-unlock on EVERY touch/click (not just once) — if iOS re-suspends
 *      the context, the next user interaction revives it.
 *   3. Silent keep-alive pulse every 8 s — prevents iOS from auto-suspending
 *      the context during the drive when the user isn't touching anything.
 * Speech synthesis gets a silent warm-up utterance on the first gesture so
 * later non-gesture calls (setInterval) are allowed by iOS Safari.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import type { DrowsinessState } from '@/lib/drowsiness';
import type { PulloverSpot } from '@/lib/safety-types';

interface Props {
  drowsinessState: DrowsinessState;
  userPosition?: { lat: number; lng: number } | null;
}

// ── Module-level audio state (persists across re-renders / fast refresh) ──────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AC = typeof window !== 'undefined' ? (window.AudioContext || (window as any).webkitAudioContext) : null;
let _ctx: AudioContext | null = null;
let _keepAliveId: ReturnType<typeof setInterval> | null = null;
let _speechWarmed = false;

function ctx(): AudioContext | null {
  if (!AC) return null;
  if (!_ctx) { try { _ctx = new AC(); } catch { return null; } }
  return _ctx;
}

/** Resume context + play an inaudible buffer to prevent iOS auto-suspend. */
function keepAlivePing(): void {
  const c = ctx();
  if (!c) return;
  if (c.state === 'suspended') { void c.resume(); return; }
  try {
    // 50 ms of silence — just enough to satisfy iOS's "activity" check
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.05), c.sampleRate);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start();
  } catch { /* ignore */ }
}

function startKeepAlive(): void {
  if (_keepAliveId !== null) return;
  _keepAliveId = setInterval(keepAlivePing, 8_000);
}

/** Call inside every user-gesture handler to ensure audio stays unlocked. */
function unlockAudio(): void {
  const c = ctx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  startKeepAlive();
  // Warm up speech synthesis with a zero-volume utterance (iOS Safari fix)
  if (!_speechWarmed && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
      _speechWarmed = true;
    } catch { /* ignore */ }
  }
}

// ── Sound synthesis ───────────────────────────────────────────────────────────

/** Warning: two sharp two-tone chirps — attention-getting without full panic. */
function playWarningChirps(c: AudioContext): void {
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  // Two chirp groups, each a fast sweep 880 → 1320 Hz
  for (let g = 0; g < 3; g++) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain); gain.connect(c.destination);
    osc.type = 'sawtooth';
    const t0 = now + g * 0.28;
    osc.frequency.setValueAtTime(880, t0);
    osc.frequency.linearRampToValueAtTime(1320, t0 + 0.12);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.75, t0 + 0.01);
    gain.gain.setValueAtTime(0.75, t0 + 0.10);
    gain.gain.linearRampToValueAtTime(0, t0 + 0.16);
    osc.start(t0);
    osc.stop(t0 + 0.18);
  }
}

/**
 * Danger: emergency siren sweep (800 ↔ 1500 Hz, sawtooth) layered with
 * staccato high-pitch pulses — mimics a real emergency vehicle alert.
 */
function playEmergencySiren(c: AudioContext): void {
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  const sirenDur = 2.8;
  const sweeps = 5; // complete up+down cycles

  // ── Layer 1: frequency-sweep siren ──────────────────────────────
  const siren = c.createOscillator();
  const sirenGain = c.createGain();
  siren.connect(sirenGain); sirenGain.connect(c.destination);
  siren.type = 'sawtooth';
  sirenGain.gain.setValueAtTime(0.9, now);
  sirenGain.gain.linearRampToValueAtTime(0, now + sirenDur - 0.05);
  for (let i = 0; i < sweeps * 2; i++) {
    const t = now + (i / (sweeps * 2)) * sirenDur;
    siren.frequency.setValueAtTime(i % 2 === 0 ? 800 : 1500, t);
    siren.frequency.linearRampToValueAtTime(i % 2 === 0 ? 1500 : 800, t + sirenDur / (sweeps * 2));
  }
  siren.start(now);
  siren.stop(now + sirenDur);

  // ── Layer 2: high-pitch staccato pulses on top of the siren ─────
  for (let i = 0; i < 7; i++) {
    const osc = c.createOscillator();
    const g   = c.createGain();
    osc.connect(g); g.connect(c.destination);
    osc.type = 'square';
    osc.frequency.value = 1760 + (i % 2) * 440; // alternates 1760/2200 Hz
    const t0 = now + i * 0.32;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.6, t0 + 0.02);
    g.gain.setValueAtTime(0.6, t0 + 0.09);
    g.gain.linearRampToValueAtTime(0, t0 + 0.14);
    osc.start(t0);
    osc.stop(t0 + 0.16);
  }
}

// ── Speech ────────────────────────────────────────────────────────────────────

function bestEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  // Prefer high-quality synthetic voices; fall back to any English voice
  const priority = ['Google US English', 'Microsoft Aria', 'Microsoft Guy', 'Samantha', 'Alex', 'Karen', 'Daniel'];
  for (const name of priority) {
    const v = voices.find(v => v.name.includes(name) && v.lang.startsWith('en'));
    if (v) return v;
  }
  return voices.find(v => v.lang.startsWith('en')) ?? null;
}

function speak(text: string, rate: number, pitch: number): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = bestEnglishVoice();
  if (voice) u.voice = voice;
  u.lang = 'en-US';
  u.rate   = rate;
  u.pitch  = pitch;
  u.volume = 1.0;
  window.speechSynthesis.speak(u);
}

function vibrate(pattern: number[]): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
}

// ── Pullover spot helpers ────────────────────────────────────────────────────

function spotIcon(type: string): string {
  if (type === 'gas_station') return '⛽';
  if (type === 'rest_stop')   return '🛑';
  return '🅿️';
}
function formatDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1609.34).toFixed(1)} mi`;
}
function mapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

function SpotsList({ spots, loading }: { spots: PulloverSpot[]; loading: boolean }) {
  if (loading) return <div className="ab-spots"><p className="ab-spots-loading">Finding nearby stops…</p></div>;
  if (!spots.length) return null;
  return (
    <div className="ab-spots">
      <p className="ab-spots-title">📍 Safe stops nearby</p>
      {spots.map((s, i) => (
        <a key={i} href={mapsDirectionsUrl(s.lat, s.lng)} target="_blank" rel="noopener noreferrer" className="ab-spot-row">
          <span className="ab-spot-icon">{spotIcon(s.type)}</span>
          <div className="ab-spot-info">
            <div className="ab-spot-name">{s.name}</div>
            <div className="ab-spot-addr">{s.address}</div>
          </div>
          <span className="ab-spot-dist">{formatDist(s.distanceMeters)}</span>
        </a>
      ))}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AlertBanner({ drowsinessState, userPosition }: Props) {
  const repeatRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStateRef = useRef<DrowsinessState>('awake');

  const [spots, setSpots]             = useState<PulloverSpot[]>([]);
  const [spotsLoading, setSpotsLoading] = useState(false);

  // ── Audio unlock — re-fire on every gesture so iOS stays unlocked ──────────
  useEffect(() => {
    const handler = () => unlockAudio();
    // passive: true avoids scroll jank; capture: false is fine for our use
    document.addEventListener('touchstart', handler, { passive: true });
    document.addEventListener('touchend',   handler, { passive: true });
    document.addEventListener('click',      handler, { passive: true });
    // Also unlock immediately if we're already in a user-gesture context
    unlockAudio();
    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('touchend',   handler);
      document.removeEventListener('click',      handler);
    };
  }, []);

  // ── Core alert fire ───────────────────────────────────────────────────────
  const clearRepeat = useCallback(() => {
    if (repeatRef.current) { clearInterval(repeatRef.current); repeatRef.current = null; }
  }, []);

  const fireAlert = useCallback((level: 'warning' | 'danger') => {
    const c = ctx();

    if (level === 'warning') {
      if (c) playWarningChirps(c);
      setTimeout(() => speak('Warning. Warning.', 1.0, 1.15), 900);
      vibrate([300, 120, 300, 120, 300]);
    } else {
      if (c) playEmergencySiren(c);
      setTimeout(() => speak('Wake up! Pull over! Wake up! Pull over now!', 1.2, 1.3), 700);
      vibrate([700, 100, 700, 100, 700, 100, 700, 100, 700]);
    }
  }, []);

  // ── Fetch nearby pullover spots on alert ──────────────────────────────────
  useEffect(() => {
    if (drowsinessState === 'awake') { setSpots([]); return; }
    if (!userPosition || spots.length > 0 || spotsLoading) return;
    setSpotsLoading(true);
    fetch(`/api/pullover?lat=${userPosition.lat}&lng=${userPosition.lng}&level=${drowsinessState}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.spots) setSpots(d.spots); })
      .catch(() => {})
      .finally(() => setSpotsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drowsinessState, userPosition]);

  // ── Alert lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = drowsinessState;

    if (drowsinessState === 'awake') {
      clearRepeat();
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
      vibrate([0]);
      return;
    }

    if (drowsinessState !== prev) fireAlert(drowsinessState);

    clearRepeat();
    repeatRef.current = setInterval(
      () => fireAlert(drowsinessState),
      drowsinessState === 'danger' ? 3500 : 6000
    );
    return clearRepeat;
  }, [drowsinessState, fireAlert, clearRepeat]);

  if (drowsinessState === 'awake') return null;

  const isWarning = drowsinessState === 'warning';
  const isDanger  = drowsinessState === 'danger';

  return (
    <>
      <style>{`
        /* ── Warning overlay ──────────────────────────────────────── */
        .ab-warning {
          position: fixed; inset: 0; z-index: 9000;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          background: rgba(217,119,6,0.94);
          backdrop-filter: blur(4px);
          animation: ab-warn-pulse 1.4s ease-in-out infinite;
          pointer-events: auto;
          gap: 12px; padding: 20px; text-align: center;
          overflow-y: auto;
        }
        @keyframes ab-warn-pulse {
          0%,100% { opacity:1; } 50% { opacity:0.82; }
        }

        /* ── Danger overlay ───────────────────────────────────────── */
        .ab-danger {
          position: fixed; inset: 0; z-index: 9000;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          animation: ab-danger-strobe 0.38s ease-in-out infinite;
          pointer-events: auto;
          gap: 14px; padding: 20px; text-align: center;
          overflow-y: auto;
        }
        @keyframes ab-danger-strobe {
          0%,100% { background: #b91c1c; }
          50%      { background: #7f1d1d; }
        }

        /* ── Shared typography ────────────────────────────────────── */
        .ab-icon-wrap {
          font-size: clamp(3.5rem,12vw,6rem);
          animation: ab-bounce 0.55s ease-in-out infinite;
        }
        @keyframes ab-bounce {
          0%,100% { transform:scale(1); } 50% { transform:scale(1.14); }
        }
        .ab-headline {
          font-size: clamp(2.8rem,14vw,6rem); font-weight:900; color:#fff;
          letter-spacing:-0.02em; line-height:1; margin:0;
          text-shadow: 0 4px 24px rgba(0,0,0,0.5);
        }
        .ab-warn-headline {
          font-size: clamp(2rem,10vw,4rem); font-weight:900; color:#fff;
          letter-spacing:-0.02em; line-height:1; margin:0;
          text-shadow: 0 3px 16px rgba(0,0,0,0.35);
        }
        .ab-sub {
          font-size: clamp(1rem,4vw,1.6rem); font-weight:700;
          color:rgba(255,255,255,0.93); letter-spacing:0.06em;
          margin:0; text-transform:uppercase;
          text-shadow:0 2px 8px rgba(0,0,0,0.3);
        }
        .ab-warn-sub {
          font-size: clamp(0.9rem,3.5vw,1.3rem); font-weight:600;
          color:rgba(255,255,255,0.88); margin:0; letter-spacing:0.04em;
        }
        .ab-strip {
          margin-top:6px; padding:11px 22px;
          background:rgba(255,255,255,0.18); border-radius:99px;
          font-size:clamp(0.78rem,2.8vw,1.05rem); font-weight:700;
          color:#fff; letter-spacing:0.05em;
          border:2px solid rgba(255,255,255,0.4);
        }

        /* ── Animated sound bars (danger) ─────────────────────────── */
        .ab-danger-bars { display:flex; gap:8px; margin-top:4px; }
        .ab-bar {
          width:14px; height:50px; border-radius:7px;
          background:rgba(255,255,255,0.55);
        }
        .ab-bar:nth-child(1){animation:ab-bar-grow 0.38s ease-in-out 0.00s infinite;}
        .ab-bar:nth-child(2){animation:ab-bar-grow 0.38s ease-in-out 0.07s infinite;}
        .ab-bar:nth-child(3){animation:ab-bar-grow 0.38s ease-in-out 0.14s infinite;}
        .ab-bar:nth-child(4){animation:ab-bar-grow 0.38s ease-in-out 0.21s infinite;}
        .ab-bar:nth-child(5){animation:ab-bar-grow 0.38s ease-in-out 0.28s infinite;}
        @keyframes ab-bar-grow {
          0%,100%{transform:scaleY(0.35);opacity:0.55;}
          50%    {transform:scaleY(1.0); opacity:1.0;}
        }

        /* ── Pullover spots ───────────────────────────────────────── */
        .ab-spots { width:100%; max-width:420px; margin-top:10px; }
        .ab-spots-title {
          font-size:0.7rem; font-weight:700; letter-spacing:0.08em;
          text-transform:uppercase; color:rgba(255,255,255,0.75);
          margin-bottom:6px; text-align:left;
        }
        .ab-spot-row {
          display:flex; align-items:center; gap:10px;
          background:rgba(0,0,0,0.28); border-radius:12px;
          padding:10px 12px; margin-bottom:6px;
          text-decoration:none; color:#fff;
          border:1px solid rgba(255,255,255,0.18);
        }
        .ab-spot-icon  { font-size:1.3rem; flex-shrink:0; }
        .ab-spot-info  { flex:1; min-width:0; text-align:left; }
        .ab-spot-name  {
          font-size:0.88rem; font-weight:700;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .ab-spot-addr  {
          font-size:0.72rem; color:rgba(255,255,255,0.7);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .ab-spot-dist  {
          font-size:0.78rem; font-weight:700;
          color:rgba(255,255,255,0.9); flex-shrink:0;
        }
        .ab-spots-loading {
          font-size:0.78rem; color:rgba(255,255,255,0.6); text-align:center;
        }
      `}</style>

      {isWarning && (
        <div className="ab-warning" role="alert" aria-live="assertive">
          <span className="ab-icon-wrap">⚠️</span>
          <h1 className="ab-warn-headline">DROWSY ALERT</h1>
          <p className="ab-warn-sub">Eyes closing detected</p>
          <div className="ab-strip">Find a safe place to stop now</div>
          <SpotsList spots={spots} loading={spotsLoading} />
        </div>
      )}

      {isDanger && (
        <div className="ab-danger" role="alert" aria-live="assertive">
          <span className="ab-icon-wrap">🚨</span>
          <h1 className="ab-headline">WAKE UP!</h1>
          <p className="ab-sub">PULL OVER NOW</p>
          <div className="ab-danger-bars" aria-hidden>
            <div className="ab-bar" /><div className="ab-bar" /><div className="ab-bar" />
            <div className="ab-bar" /><div className="ab-bar" />
          </div>
          <div className="ab-strip">DO NOT DRIVE WHILE DROWSY</div>
          <SpotsList spots={spots} loading={spotsLoading} />
        </div>
      )}
    </>
  );
}
