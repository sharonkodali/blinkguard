'use client';
import { useEffect, useState } from 'react';
import type { DrowsinessState } from '@/lib/drowsiness';

interface Props { drowsinessState: DrowsinessState; }

export default function AlertBanner({ drowsinessState }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (drowsinessState === 'danger') {
      setShow(true);
    } else {
      const t = setTimeout(() => setShow(false), 800);
      return () => clearTimeout(t);
    }
  }, [drowsinessState]);

  if (!show) return null;

  return (
    <>
      <style>{`
        .ab-overlay {
          position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column;
          align-items: center; justify-content: center; pointer-events: none;
          background: rgba(15, 14, 71, 0.88); backdrop-filter: blur(6px);
          border: 1px solid rgba(134, 134, 172, 0.25); animation: ab-pulse 0.6s ease-in-out;
        }
        @keyframes ab-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.82; } }
        .ab-emoji { font-size: 3rem; opacity: 0.9; }
        .ab-title { font-size: clamp(1.5rem, 5vw, 2rem); font-weight: 700; color: var(--text); margin-top: 1rem; text-align: center; letter-spacing: 0.04em; }
        .ab-subtitle { font-size: 0.95rem; color: var(--text-muted); margin-top: 0.6rem; text-align: center; max-width: 280px; line-height: 1.5; }
        .ab-siren { font-size: 1.75rem; margin-top: 1.25rem; opacity: 0.85; }
      `}</style>
      <div className="ab-overlay">
        <span className="ab-emoji">😴</span>
        <h1 className="ab-title">WAKE UP!</h1>
        <p className="ab-subtitle">PULL OVER SAFELY</p>
        <span className="ab-siren">🚨</span>
      </div>
    </>
  );
}