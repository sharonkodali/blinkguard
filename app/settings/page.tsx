'use client';
import { useState } from 'react';

const settingsList = [
  { key: 'notifications', icon: '🔔', title: 'Notifications',  desc: 'Receive alerts when drowsiness is detected' },
  { key: 'vibration',     icon: '📳', title: 'Vibration',      desc: 'Haptic feedback on alerts' },
  { key: 'voice',         icon: '🔊', title: 'Voice Alerts',   desc: 'Spoken warnings via device speaker' },
];

export default function Settings() {
  const [on, setOn] = useState<Record<string, boolean>>({ notifications: true, vibration: true, voice: true });

  return (
    <>
      <style>{`
        .set { background:var(--bg); min-height:100%; padding:36px 32px; }
        .set-header { margin-bottom:28px; }
        .set-title { font-size:1.5rem; font-weight:700; color:var(--text); margin-bottom:4px; }
        .set-sub   { font-size:0.8rem; color:var(--text-muted); }

        .set-list  { display:flex; flex-direction:column; gap:8px; max-width:600px; }
        .set-row {
          background:var(--surface); border:1px solid var(--border); border-radius:var(--radius);
          padding:16px 18px; display:flex; align-items:center; justify-content:space-between;
          transition:border-color 0.2s;
        }
        .set-row:hover { border-color:var(--accent-border); }
        .set-left { display:flex; align-items:center; gap:14px; }
        .set-icon  { font-size:1.2rem; }
        .set-name  { font-size:0.85rem; font-weight:600; color:var(--text); margin-bottom:2px; }
        .set-desc  { font-size:0.72rem; color:var(--text-muted); }

        /* Toggle */
        .toggle { position:relative; width:44px; height:24px; flex-shrink:0; }
        .toggle input { opacity:0; width:0; height:0; position:absolute; }
        .toggle-track {
          position:absolute; inset:0; border-radius:99px; cursor:pointer;
          background:var(--surface2); border:1px solid var(--border);
          transition:background 0.2s, border-color 0.2s;
        }
        .toggle-track.on { background:rgba(134,134,172,0.2); border-color:var(--accent-border); }
        .toggle-thumb {
          position:absolute; top:3px; left:3px;
          width:16px; height:16px; border-radius:99px;
          background:var(--text-faint); transition:transform 0.2s, background 0.2s;
        }
        .toggle-thumb.on { transform:translateX(20px); background:var(--blue-soft); }

        .set-note {
          max-width:600px; margin-top:20px;
          background:var(--yellow-muted); border:1px solid var(--yellow-border); border-radius:var(--radius);
          padding:14px 18px; font-size:0.75rem; color:var(--text-muted); line-height:1.6;
        }
        .set-note strong { color:var(--yellow); }
      `}</style>

      <div className="set">
        <div className="set-header">
          <div className="set-title">Settings</div>
          <div className="set-sub">Customize your BlinkGuard experience</div>
        </div>

        <div className="set-list">
          {settingsList.map(s => (
            <div key={s.key} className="set-row">
              <div className="set-left">
                <span className="set-icon">{s.icon}</span>
                <div>
                  <div className="set-name">{s.title}</div>
                  <div className="set-desc">{s.desc}</div>
                </div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  aria-label={s.title}
                  checked={on[s.key]}
                  onChange={e => setOn(prev => ({ ...prev, [s.key]: e.target.checked }))}
                />
                <div className={`toggle-track ${on[s.key] ? 'on' : ''}`} />
                <div className={`toggle-thumb ${on[s.key] ? 'on' : ''}`} />
              </label>
            </div>
          ))}
        </div>

        <div className="set-note">
          <strong>Privacy:</strong> All processing happens locally on your device. No data is sent to external servers.
        </div>
      </div>
    </>
  );
}
