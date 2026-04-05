'use client';
import { useMemo, useSyncExternalStore } from 'react';
import BottomNav from '@/components/BottomNav';
import {
  getSessionsSnapshot,
  subscribeSessions,
  formatDuration,
  type SessionData,
} from '@/lib/sessions';
import {
  subscribeCalibration,
  getCalibrationSnapshot,
  getCalibrationServerSnapshot,
} from '@/lib/drowsiness';

const EMPTY: SessionData[] = [];

// ── Icons ────────────────────────────────────────────────────────────────
const User = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const Bell = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.268 21a2 2 0 0 0 3.464 0" />
    <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
  </svg>
);
const Settings = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const Shield = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </svg>
);
const Help = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
  </svg>
);
const LogOut = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />
  </svg>
);
const Target = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
  </svg>
);
const Chevron = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 5 7 7-7 7" />
  </svg>
);

type MenuItem = {
  icon: React.FC<{ className?: string }>;
  label: string;
  description: string;
  color: 'warning' | 'midnight' | 'safe';
  href?: string;
};

const MENU: MenuItem[] = [
  { icon: Bell,     label: 'Notifications',  description: 'Manage alerts & sounds', color: 'warning' },
  { icon: Settings, label: 'Settings',       description: 'App preferences',        color: 'midnight', href: '/settings' },
  { icon: Shield,   label: 'Privacy',        description: 'Data & security',        color: 'safe' },
  { icon: Help,     label: 'Help & Support', description: 'Get assistance',         color: 'midnight', href: '/about' },
];

export default function ProfilePage() {
  const calibrated = useSyncExternalStore(
    subscribeCalibration,
    getCalibrationSnapshot,
    getCalibrationServerSnapshot,
  );

  const sessions = useSyncExternalStore(
    subscribeSessions,
    getSessionsSnapshot,
    () => EMPTY,
  );
  const stats = useMemo(() => {
    if (sessions.length === 0) {
      return { avg: '—', trips: 0, alerts: 0, drive: '0m' };
    }
    const scored = sessions.filter((s) => typeof s.safetyScore === 'number');
    const avg = scored.length
      ? Math.round(scored.reduce((a, x) => a + (x.safetyScore as number), 0) / scored.length)
      : 0;
    const alerts = sessions.reduce((a, x) => a + x.alerts, 0);
    const totalSec = sessions.reduce((a, x) => a + x.duration, 0);
    return {
      avg: avg ? String(avg) : '—',
      trips: sessions.length,
      alerts,
      drive: formatDuration(totalSec),
    };
  }, [sessions]);

  return (
    <>
      <style>{`
        .p-wrap { flex: 1; overflow-y: auto; padding-bottom: 5rem; background: var(--ios-background); }

        .p-hero { padding: 2rem 1rem 1.5rem; background: linear-gradient(180deg, var(--ios-midnight) 0%, var(--ios-midnight-light) 100%); color: #fff; }
        .p-hero-row { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
        .p-avatar { width: 5rem; height: 5rem; border-radius: 9999px; background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .p-avatar svg { width: 2.5rem; height: 2.5rem; color: #fff; }
        .p-hero h2 { color: #fff; }
        .p-hero-email { font-size: 0.875rem; color: rgba(255,255,255,0.7); }

        .p-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
        .p-stat { background: rgba(255,255,255,0.1); backdrop-filter: blur(4px); border-radius: 1rem; padding: 0.75rem; text-align: center; }
        .p-stat-v { font-size: 1.5rem; color: #fff; }
        .p-stat-l { font-size: 0.75rem; color: rgba(255,255,255,0.7); }

        .p-menu { padding: 0 1rem; margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .p-row { width: 100%; background: #fff; border: 1px solid var(--ios-border); border-radius: 1rem; padding: 1rem; display: flex; align-items: center; gap: 1rem; box-shadow: 0 1px 2px rgba(0,0,0,.04); text-align: left; text-decoration: none; color: inherit; transition: background .15s; }
        .p-row:hover { background: var(--ios-background); }
        .p-row-icon { width: 2.75rem; height: 2.75rem; border-radius: 0.75rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .p-row-icon svg { width: 1.25rem; height: 1.25rem; }
        .p-row-icon.warning  { background: rgba(245,158,11,0.1); color: var(--ios-warning); }
        .p-row-icon.midnight { background: rgba(26,39,68,0.1);    color: var(--ios-midnight); }
        .p-row-icon.safe     { background: rgba(16,185,129,0.1);  color: var(--ios-safe); }
        .p-row-icon.danger   { background: rgba(239,68,68,0.1);   color: var(--ios-danger); }
        .p-row-main { flex: 1; }
        .p-row-title { color: var(--ios-midnight); }
        .p-row-sub   { font-size: 0.875rem; color: var(--ios-muted-foreground); }
        .p-chevron { width: 1.25rem; height: 1.25rem; color: var(--ios-muted-foreground); }
        .p-signout-title { color: var(--ios-danger); }
        .p-footer { text-align: center; padding: 1.5rem 0; font-size: 0.875rem; color: var(--ios-muted-foreground); }
        .p-footer-sub { font-size: 0.75rem; margin-top: 0.25rem; }
      `}</style>

      <div className="ios-app">
        <div className="p-wrap">
          <div className="p-hero">
            <div className="p-hero-row">
              <div className="p-avatar"><User /></div>
              <div style={{ flex: 1 }}>
                <h2>BlinkGuard Driver</h2>
                <p className="p-hero-email">
                  {stats.trips === 0
                    ? 'No trips logged yet'
                    : `${stats.drive} logged across ${stats.trips} trip${stats.trips === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>
            <div className="p-stats">
              <div className="p-stat"><p className="p-stat-v">{stats.avg}</p><p className="p-stat-l">Avg Score</p></div>
              <div className="p-stat"><p className="p-stat-v">{stats.trips}</p><p className="p-stat-l">Total Trips</p></div>
              <div className="p-stat"><p className="p-stat-v">{stats.alerts}</p><p className="p-stat-l">Alerts</p></div>
            </div>
          </div>

          <div className="p-menu">
            <a href="/calibrate" className="p-row">
              <div className={`p-row-icon ${calibrated ? 'safe' : 'warning'}`}><Target /></div>
              <div className="p-row-main">
                <p className="p-row-title">Calibration</p>
                <p className="p-row-sub">
                  {calibrated
                    ? 'Personalized thresholds active · tap to recalibrate'
                    : 'Not calibrated · tap to set your baseline'}
                </p>
              </div>
              <Chevron className="p-chevron" />
            </a>

            {MENU.map((item, i) => {
              const Icon = item.icon;
              const inner = (
                <>
                  <div className={`p-row-icon ${item.color}`}><Icon /></div>
                  <div className="p-row-main">
                    <p className="p-row-title">{item.label}</p>
                    <p className="p-row-sub">{item.description}</p>
                  </div>
                  <Chevron className="p-chevron" />
                </>
              );
              return item.href ? (
                <a key={i} href={item.href} className="p-row">{inner}</a>
              ) : (
                <button key={i} type="button" className="p-row">{inner}</button>
              );
            })}

            <button type="button" className="p-row" style={{ marginTop: '1.5rem' }}>
              <div className="p-row-icon danger"><LogOut /></div>
              <div className="p-row-main">
                <p className="p-signout-title">Sign Out</p>
              </div>
            </button>

            <div className="p-footer">
              <p>BlinkGuard v2.1.0</p>
              <p className="p-footer-sub">© 2026 BlinkGuard Safety Systems</p>
            </div>
          </div>
        </div>

        <BottomNav />
      </div>
    </>
  );
}
