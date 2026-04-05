'use client';

const cards = [
  { icon: '🎯', title: 'Our Mission',   body: 'Prevent drowsy driving accidents through AI-powered real-time detection. Every driver deserves a safety companion on every journey.' },
  { icon: '⚡', title: 'Technology',    body: 'MediaPipe maps 468 face landmarks at 30+ fps. Eye Aspect Ratio (EAR) and Mouth Aspect Ratio (MAR) detect closure and yawning in under 100ms.' },
  { icon: '🔒', title: 'Privacy First', body: 'Everything runs locally in your browser. No video leaves your device, no account required, no tracking.' },
  { icon: '🤖', title: 'AI Agents',     body: 'Claude-powered agents escalate alerts, suggest nearby rest stops, and give traffic-aware guidance — all triggered by real drowsiness events.' },
];

const steps = ['Camera Feed', 'Face Detection', 'EAR / MAR Analysis', 'Escalating Alerts'];

export default function About() {
  return (
    <>
      <style>{`
        .abt { background:var(--bg); min-height:100%; padding:36px 32px 60px; }
        .abt-hero { margin-bottom:40px; }
        .abt-title { font-size:1.5rem; font-weight:700; color:var(--text); margin-bottom:4px; }
        .abt-sub   { font-size:0.8rem; color:var(--text-muted); }

        .abt-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:10px; max-width:860px; margin-bottom:36px; }
        .abt-card {
          background:var(--surface); border:1px solid var(--border); border-radius:var(--radius);
          padding:18px 16px; transition:border-color 0.2s, transform 0.15s;
        }
        .abt-card:hover { border-color:var(--accent-border); transform:translateY(-2px); }
        .abt-card-icon  { font-size:1.3rem; margin-bottom:10px; }
        .abt-card-title { font-size:0.85rem; font-weight:600; color:var(--amber); margin-bottom:6px; }
        .abt-card-body  { font-size:0.75rem; color:var(--text-muted); line-height:1.7; }

        .abt-steps-title { font-size:0.6rem; letter-spacing:0.18em; text-transform:uppercase; color:var(--text-faint); margin-bottom:14px; }
        .abt-steps { display:flex; gap:0; max-width:680px; margin-bottom:36px; }
        .abt-step { flex:1; display:flex; align-items:flex-start; gap:10px; position:relative; }
        .abt-step:not(:last-child)::after {
          content:''; position:absolute; top:14px; left:calc(28px + 10px); right:0;
          height:1px; background:var(--border);
        }
        .abt-step-num {
          width:28px; height:28px; border-radius:99px; flex-shrink:0;
          background:linear-gradient(135deg,var(--amber),var(--blue-soft));
          display:flex; align-items:center; justify-content:center;
          font-size:0.7rem; font-weight:700; color:#0f0e17;
        }
        .abt-step-label { font-size:0.75rem; color:var(--text-muted); padding-top:5px; line-height:1.4; }

        .abt-footer { font-size:0.72rem; color:var(--text-faint); }
        .abt-footer strong { color:var(--blue-soft); }
      `}</style>

      <div className="abt">
        <div className="abt-hero">
          <div className="abt-title">About BlinkGuard</div>
          <div className="abt-sub">Safer roads. Smarter drivers.</div>
        </div>

        <div className="abt-grid">
          {cards.map((c, i) => (
            <div key={i} className="abt-card">
              <div className="abt-card-icon">{c.icon}</div>
              <div className="abt-card-title">{c.title}</div>
              <div className="abt-card-body">{c.body}</div>
            </div>
          ))}
        </div>

        <div className="abt-steps-title">How it works</div>
        <div className="abt-steps">
          {steps.map((label, i) => (
            <div key={i} className="abt-step">
              <div className="abt-step-num">{i + 1}</div>
              <div className="abt-step-label">{label}</div>
            </div>
          ))}
        </div>

        <div className="abt-footer">
          <strong>Version 1.0.0</strong> · Built for safer roads · © 2026 BlinkGuard
        </div>
      </div>
    </>
  );
}
