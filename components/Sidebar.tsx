'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const navItems = [
  { icon: '⌂',  label: 'Home',         href: '/' },
  { icon: '◉',  label: 'Live Monitor', href: '/monitor' },
  { icon: '◈',  label: 'History',      href: '/history' },
  { icon: '◎',  label: 'Settings',     href: '/settings' },
  { icon: '○',  label: 'About',        href: '/about' },
];

export default function Sidebar() {
  const pathname  = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <style>{`
        .sb {
          display: flex; flex-direction: column; flex-shrink: 0;
          transition: width 0.25s cubic-bezier(0.4,0,0.2,1);
          background: var(--surface); border-right: 1px solid var(--border);
          overflow: hidden;
        }
        .sb.open   { width: 210px; }
        .sb.closed { width: 58px; }

        .sb-top {
          display: flex; align-items: center; gap: 10px;
          padding: 18px 14px 16px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .sb-logo-glyph {
          width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
          background: linear-gradient(135deg, var(--blue-slate) 0%, var(--blue-soft) 100%);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
        }
        .sb-logo-name {
          font-size: 0.88rem; font-weight: 700; letter-spacing: 0.02em;
          color: var(--text); white-space: nowrap; overflow: hidden;
        }
        .sb-logo-sub {
          font-size: 0.58rem; color: var(--text-faint);
          letter-spacing: 0.1em; text-transform: uppercase; margin-top: 1px;
          white-space: nowrap;
        }

        .sb-nav { flex: 1; padding: 10px 8px; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }

        .sb-item {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 10px; border-radius: var(--radius-sm);
          text-decoration: none; transition: background 0.15s, color 0.15s;
          color: var(--text-muted); white-space: nowrap; overflow: hidden;
          border: 1px solid transparent;
          cursor: pointer;
        }
        .sb-item:hover { background: var(--accent-muted); color: var(--text); border-color: var(--accent-border); }
        .sb-item.active {
          background: var(--surface3);
          color: var(--text);
          border-color: var(--accent-border);
        }
        .sb-icon  { font-size: 1rem; flex-shrink: 0; width: 18px; text-align: center; }
        .sb-label { font-size: 0.8rem; font-weight: 500; }
        .sb-logo-text { overflow: hidden; }

        .sb-bottom { padding: 10px 8px; border-top: 1px solid var(--border); flex-shrink: 0; }
        .sb-toggle {
          width: 100%; background: transparent; border: 1px solid var(--border);
          border-radius: var(--radius-sm); color: var(--text-faint);
          font-size: 0.72rem; padding: 7px 10px; cursor: pointer;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
          text-align: left; white-space: nowrap; overflow: hidden;
        }
        .sb-toggle:hover { background: var(--surface2); color: var(--text-muted); border-color: var(--accent-border); }
      `}</style>

      <aside className={`sb ${collapsed ? 'closed' : 'open'}`}>
        <div className="sb-top">
          <div className="sb-logo-glyph">👁</div>
          {!collapsed && (
            <div className="sb-logo-text">
              <div className="sb-logo-name">BlinkGuard</div>
              <div className="sb-logo-sub">Safety Monitor</div>
            </div>
          )}
        </div>

        <nav className="sb-nav">
          {navItems.map(item => (
            <Link key={item.href} href={item.href} className={`sb-item ${pathname === item.href ? 'active' : ''}`}>
              <span className="sb-icon">{item.icon}</span>
              {!collapsed && <span className="sb-label">{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div className="sb-bottom">
          <button type="button" className="sb-toggle" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? '→' : '← Collapse'}
          </button>
        </div>
      </aside>
    </>
  );
}
