'use client';

const sessions = [
  { id: 1, date: 'Today',      duration: '45 min',    alerts: 0, status: 'awake' },
  { id: 2, date: 'Yesterday',  duration: '1h 22 min', alerts: 2, status: 'warning' },
  { id: 3, date: '2 days ago', duration: '2h 15 min', alerts: 5, status: 'danger' },
];

const statusLabel: Record<string, string> = {
  awake: 'Awake', warning: 'Alert', danger: 'Drowsy',
};

export default function History() {
  return (
    <>
      <style>{`
        .hist { background:var(--bg); min-height:100%; padding:36px 32px; }
        .hist-header { margin-bottom:28px; }
        .hist-title { font-size:1.5rem; font-weight:700; color:var(--text); margin-bottom:4px; }
        .hist-sub   { font-size:0.8rem; color:var(--text-muted); }

        .hist-list  { display:flex; flex-direction:column; gap:8px; max-width:700px; }
        .hist-row {
          background:var(--surface); border:1px solid var(--border); border-radius:var(--radius);
          padding:16px 18px; display:flex; align-items:center; justify-content:space-between;
          transition:border-color 0.2s, transform 0.15s;
        }
        .hist-row:hover { border-color:var(--accent-border); transform:translateX(3px); }
        .hist-date { font-size:0.85rem; font-weight:600; color:var(--text); margin-bottom:4px; }
        .hist-meta { font-size:0.72rem; color:var(--text-muted); }

        .hist-badge { font-size:0.68rem; font-weight:700; padding:5px 14px; border-radius:99px; border:1px solid; letter-spacing:0.06em; }
        .hist-badge-awake   { color:var(--blue-soft); background:rgba(134,134,172,0.1); border-color:rgba(134,134,172,0.28); }
        .hist-badge-warning { color:var(--amber);  background:rgba(251,191,36,0.1); border-color:rgba(251,191,36,0.3); }
        .hist-badge-danger  { color:var(--red);    background:rgba(248,113,113,0.1); border-color:rgba(248,113,113,0.3); }

        .hist-empty { text-align:center; padding:60px 0; font-size:0.88rem; color:var(--text-faint); }
      `}</style>

      <div className="hist">
        <div className="hist-header">
          <div className="hist-title">Session History</div>
          <div className="hist-sub">Your past monitoring sessions and drowsiness patterns</div>
        </div>

        {sessions.length === 0 ? (
          <div className="hist-empty">No sessions yet. Start monitoring to begin tracking.</div>
        ) : (
          <div className="hist-list">
            {sessions.map(s => (
              <div key={s.id} className="hist-row">
                <div>
                  <div className="hist-date">{s.date}</div>
                  <div className="hist-meta">{s.duration} · {s.alerts} alert{s.alerts !== 1 ? 's' : ''}</div>
                </div>
                <div className={`hist-badge hist-badge-${s.status}`}>
                  {statusLabel[s.status]}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
