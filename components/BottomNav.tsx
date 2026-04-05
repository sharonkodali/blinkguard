'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = { id: string; href: string; label: string; icon: React.ReactNode };

// Lucide-style inline SVGs (stroke inherits currentColor)
const HomeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const NavIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 11 22 2 13 21 11 13 3 11" />
  </svg>
);
const VideoIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 8-6 4 6 4V8Z" />
    <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
  </svg>
);
const ChartIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <path d="M7 16V9" />
    <path d="M11 16v-5" />
    <path d="M15 16v-3" />
    <path d="M19 16V7" />
  </svg>
);
const UserIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const TABS: Tab[] = [
  { id: 'home',    href: '/',        label: 'Home',    icon: HomeIcon },
  { id: 'drive',   href: '/drive',   label: 'Drive',   icon: NavIcon },
  { id: 'monitor', href: '/monitor', label: 'Monitor', icon: VideoIcon },
  { id: 'metrics', href: '/metrics', label: 'Metrics', icon: ChartIcon },
  { id: 'profile', href: '/profile', label: 'Profile', icon: UserIcon },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="ios-nav" aria-label="Primary">
      <div className="ios-nav-inner">
        {TABS.map((t) => {
          const active = t.href === '/' ? pathname === '/' : pathname?.startsWith(t.href);
          return (
            <Link
              key={t.id}
              href={t.href}
              className={`ios-nav-btn ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {t.icon}
              <span>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
