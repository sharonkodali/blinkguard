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
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center animate-pulse pointer-events-none"
      style={{ background: 'rgba(185, 28, 28, 0.88)' }}
    >
      <span className="text-8xl">😴</span>
      <h1 className="text-5xl font-black text-white mt-4 tracking-tight text-center">
        WAKE UP!
      </h1>
      <p className="text-2xl text-white/90 mt-3 text-center">
        PULL OVER SAFELY
      </p>
      <span className="text-5xl mt-6">🚨</span>
    </div>
  );
}