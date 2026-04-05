'use client';
/**
 * Landing — the app's welcome screen.
 *
 * This is what users see first: the BlinkGuard logo, a short pitch, navigation
 * into the rest of the app, and a scrollable gallery of drowsy-driving stats
 * that frames *why* the product exists. No camera, no map — just context.
 */
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';

// ── Icons ─────────────────────────────────────────────────────────────────
const EyeIcon = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const NavArrowIcon = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 11 22 2 13 21 11 13 3 11" />
  </svg>
);
const VideoIcon = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 8-6 4 6 4V8Z" />
    <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
  </svg>
);
const ChartIcon = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" /><path d="M7 16V9" /><path d="M11 16v-5" /><path d="M15 16v-3" /><path d="M19 16V7" />
  </svg>
);
const TargetIcon = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
  </svg>
);

// ── Stats gallery data ────────────────────────────────────────────────────
// Sources: NHTSA (USA), AAA Foundation for Traffic Safety, CDC, WHO.
const STATS: { value: string; label: string; source: string }[] = [
  {
    value: '~91,000',
    label: 'police-reported crashes involving drowsy driving each year in the U.S.',
    source: 'NHTSA',
  },
  {
    value: '~50,000',
    label: 'injuries annually linked to drowsy driving crashes',
    source: 'NHTSA',
  },
  {
    value: '~800',
    label: 'deaths per year attributed to drowsy driving — likely undercounted',
    source: 'NHTSA',
  },
  {
    value: '1 in 25',
    label: 'adult drivers report falling asleep at the wheel in the past 30 days',
    source: 'CDC',
  },
  {
    value: '4×',
    label: 'higher crash risk after less than 5 hours of sleep',
    source: 'AAA Foundation',
  },
  {
    value: '≥ 24h',
    label: 'awake impairs driving comparably to a 0.10% blood alcohol level',
    source: 'WHO',
  },
];

const FEATURES: { title: string; desc: string; icon: React.ReactNode; href: string }[] = [
  {
    title: 'Navigate + Monitor',
    desc: 'Real-time Google Maps navigation with drowsiness detection running in the background.',
    icon: <NavArrowIcon className="lp-feature-icon" />,
    href: '/drive',
  },
  {
    title: 'Live face mesh',
    desc: 'Full-screen camera view with MediaPipe face-mesh overlay for dedicated fatigue tracking.',
    icon: <VideoIcon className="lp-feature-icon" />,
    href: '/monitor',
  },
  {
    title: 'Trip metrics',
    desc: 'Per-drive analytics, Fetch.ai safety score, incident timeline, and AI coaching tips.',
    icon: <ChartIcon className="lp-feature-icon" />,
    href: '/metrics',
  },
  {
    title: 'Calibration',
    desc: 'A quick eyes-open / eyes-closed / yawn baseline so detection fits your face.',
    icon: <TargetIcon className="lp-feature-icon" />,
    href: '/calibrate',
  },
];

export default function Landing() {
  return (
    <>
      <style>{`
        .lp-screen {
          flex: 1; min-height: 0; overflow-y: auto;
          background: linear-gradient(180deg, var(--ios-midnight) 0%, var(--ios-midnight-light) 100%);
          color: #fff;
          padding-bottom: calc(5rem + env(safe-area-inset-bottom));
        }

        /* Hero */
        .lp-hero {
          padding: calc(2.5rem + env(safe-area-inset-top)) 1.25rem 2rem;
          text-align: center;
          display: flex; flex-direction: column; align-items: center; gap: 1rem;
        }
        .lp-logo {
          width: 5.5rem; height: 5.5rem; border-radius: 1.75rem;
          background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 20px 40px -12px rgba(6,182,212,0.55),
                      inset 0 1px 0 rgba(255,255,255,0.35);
          position: relative;
        }
        .lp-logo::after {
          content: ''; position: absolute; inset: -6px; border-radius: 2rem;
          border: 1px solid rgba(6,182,212,0.35);
          animation: lpRing 2.4s ease-in-out infinite;
        }
        @keyframes lpRing { 0%,100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 0.9; transform: scale(1.04); } }
        .lp-logo svg { width: 2.75rem; height: 2.75rem; color: #fff; }
        .lp-brand {
          font-size: 2rem; font-weight: 700; letter-spacing: -0.02em;
          background: linear-gradient(90deg, #e0f2fe 0%, #93c5fd 100%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .lp-tag {
          font-size: 0.9rem; color: rgba(255,255,255,0.7);
          max-width: 22rem; line-height: 1.5;
        }
        .lp-cta-row {
          display: flex; gap: 0.625rem; margin-top: 0.5rem;
          flex-wrap: wrap; justify-content: center;
        }
        .lp-cta {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.75rem 1.25rem; border-radius: 9999px;
          font-weight: 600; font-size: 0.82rem; text-decoration: none;
          box-shadow: 0 10px 20px -8px rgba(0,0,0,0.4);
        }
        .lp-cta.primary { background: #fff; color: var(--ios-midnight); }
        .lp-cta.ghost {
          background: rgba(255,255,255,0.1); color: #fff;
          border: 1px solid rgba(255,255,255,0.25); backdrop-filter: blur(8px);
        }
        .lp-cta svg { width: 0.95rem; height: 0.95rem; }

        /* Section headings */
        .lp-section {
          padding: 1.5rem 1.25rem 0.5rem;
        }
        .lp-section-title {
          font-size: 0.72rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.12em;
          color: rgba(147,197,253,0.9);
          margin-bottom: 0.75rem;
        }
        .lp-section-lead {
          font-size: 1.15rem; font-weight: 600; line-height: 1.35;
          color: #fff; margin-bottom: 0.35rem;
        }
        .lp-section-sub {
          font-size: 0.82rem; color: rgba(255,255,255,0.65);
          line-height: 1.5;
        }

        /* Stats gallery — horizontal snap scroller */
        .lp-gallery {
          display: flex; gap: 0.75rem;
          overflow-x: auto; scroll-snap-type: x mandatory;
          padding: 1rem 1.25rem 0.5rem;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .lp-gallery::-webkit-scrollbar { display: none; }
        .lp-stat-card {
          flex: 0 0 78%; max-width: 20rem;
          scroll-snap-align: start;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 1.25rem;
          padding: 1.25rem 1.1rem;
          backdrop-filter: blur(12px);
          display: flex; flex-direction: column; gap: 0.6rem;
        }
        .lp-stat-value {
          font-size: 2.1rem; font-weight: 800; line-height: 1;
          background: linear-gradient(90deg, #06b6d4 0%, #a78bfa 100%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .lp-stat-label {
          font-size: 0.82rem; line-height: 1.45;
          color: rgba(255,255,255,0.85);
        }
        .lp-stat-source {
          font-size: 0.65rem; letter-spacing: 0.06em; text-transform: uppercase;
          color: rgba(147,197,253,0.75); margin-top: auto;
        }

        /* Features grid — 2 col */
        .lp-feature-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 0.75rem; padding: 1rem 1.25rem 0;
        }
        .lp-feature-card {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 1rem; padding: 1rem;
          text-decoration: none; color: #fff;
          display: flex; flex-direction: column; gap: 0.5rem;
          backdrop-filter: blur(8px);
          transition: transform 0.15s ease, background 0.15s ease;
        }
        .lp-feature-card:active { transform: scale(0.98); background: rgba(255,255,255,0.1); }
        .lp-feature-icon {
          width: 1.25rem; height: 1.25rem; color: #67e8f9;
        }
        .lp-feature-title {
          font-weight: 600; font-size: 0.88rem; line-height: 1.2;
        }
        .lp-feature-desc {
          font-size: 0.72rem; color: rgba(255,255,255,0.65); line-height: 1.4;
        }

        /* How it works */
        .lp-how {
          padding: 1.25rem 1.25rem 0;
          display: flex; flex-direction: column; gap: 0.6rem;
        }
        .lp-how-row {
          display: flex; gap: 0.85rem; align-items: flex-start;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 0.9rem; padding: 0.85rem 1rem;
        }
        .lp-how-num {
          flex-shrink: 0;
          width: 1.75rem; height: 1.75rem; border-radius: 50%;
          background: linear-gradient(135deg, #06b6d4, #3b82f6);
          color: #fff; font-weight: 700; font-size: 0.82rem;
          display: flex; align-items: center; justify-content: center;
        }
        .lp-how-title { font-weight: 600; font-size: 0.85rem; margin-bottom: 0.15rem; }
        .lp-how-desc { font-size: 0.72rem; color: rgba(255,255,255,0.65); line-height: 1.45; }

        .lp-footer {
          padding: 1.75rem 1.25rem 0.5rem;
          text-align: center;
          font-size: 0.65rem; color: rgba(255,255,255,0.4);
          letter-spacing: 0.04em;
        }
      `}</style>

      <div className="ios-app">
        <div className="lp-screen">
          {/* Hero */}
          <header className="lp-hero">
            <div className="lp-logo">
              <EyeIcon />
            </div>
            <h1 className="lp-brand">BlinkGuard</h1>
            <p className="lp-tag">
              AI-powered drowsy-driving detection that runs alongside your navigation.
              See fatigue before it sees you.
            </p>
            <div className="lp-cta-row">
              <Link href="/drive" className="lp-cta primary">
                <NavArrowIcon /> Start driving
              </Link>
              <Link href="/calibrate" className="lp-cta ghost">
                <TargetIcon /> Calibrate
              </Link>
            </div>
          </header>

          {/* Why it matters — stats gallery */}
          <section className="lp-section">
            <div className="lp-section-title">Why it matters</div>
            <h2 className="lp-section-lead">Drowsy driving is a quiet epidemic.</h2>
            <p className="lp-section-sub">
              Fatigue impairs reaction time and judgment as severely as alcohol — but
              nobody gets pulled over for it. BlinkGuard turns your phone's camera
              into an always-on fatigue monitor.
            </p>
          </section>
          <div className="lp-gallery" role="list">
            {STATS.map((s) => (
              <article key={s.value + s.source} className="lp-stat-card" role="listitem">
                <div className="lp-stat-value">{s.value}</div>
                <div className="lp-stat-label">{s.label}</div>
                <div className="lp-stat-source">Source · {s.source}</div>
              </article>
            ))}
          </div>

          {/* Features */}
          <section className="lp-section">
            <div className="lp-section-title">What's inside</div>
            <h2 className="lp-section-lead">Four surfaces, one safety loop.</h2>
          </section>
          <div className="lp-feature-grid">
            {FEATURES.map((f) => (
              <Link key={f.href} href={f.href} className="lp-feature-card">
                {f.icon}
                <div className="lp-feature-title">{f.title}</div>
                <div className="lp-feature-desc">{f.desc}</div>
              </Link>
            ))}
          </div>

          {/* How it works */}
          <section className="lp-section">
            <div className="lp-section-title">How it works</div>
            <h2 className="lp-section-lead">Blink by blink, frame by frame.</h2>
          </section>
          <div className="lp-how">
            <div className="lp-how-row">
              <div className="lp-how-num">1</div>
              <div>
                <div className="lp-how-title">Calibrate</div>
                <div className="lp-how-desc">A 30-second baseline of your eye and jaw geometry so detection fits you.</div>
              </div>
            </div>
            <div className="lp-how-row">
              <div className="lp-how-num">2</div>
              <div>
                <div className="lp-how-title">Drive</div>
                <div className="lp-how-desc">MediaPipe face-mesh runs on-device while Google Maps handles navigation.</div>
              </div>
            </div>
            <div className="lp-how-row">
              <div className="lp-how-num">3</div>
              <div>
                <div className="lp-how-title">Alert</div>
                <div className="lp-how-desc">Audio + haptic wake-up the moment EAR/MAR thresholds cross danger.</div>
              </div>
            </div>
            <div className="lp-how-row">
              <div className="lp-how-num">4</div>
              <div>
                <div className="lp-how-title">Review</div>
                <div className="lp-how-desc">Fetch.ai scores every trip and coaches you with post-drive insights.</div>
              </div>
            </div>
          </div>

          <div className="lp-footer">BlinkGuard · Eyes on the road, always.</div>
        </div>

        <BottomNav />
      </div>
    </>
  );
}
