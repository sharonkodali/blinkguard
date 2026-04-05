'use client';
import { useEffect, useState, startTransition } from 'react';
import {
  fetchNearbyStops,
  getCurrentPosition,
  geolocationErrorMessage,
  type NearbyPlace,
} from '@/lib/nearby-stops';

type LoadState = 'idle' | 'locating' | 'loading' | 'done' | 'error';

export default function NearbyStopsCard() {
  const [state, setState] = useState<LoadState>('idle');
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    startTransition(() => {
      setState('locating');
      setHint(null);
    });

    void (async () => {
      try {
        const pos = await getCurrentPosition();
        if (cancelled) return;
        setState('loading');
        const result = await fetchNearbyStops(pos.coords.latitude, pos.coords.longitude);
        if (cancelled) return;
        setPlaces(result.places ?? []);
        setHint(result.message ?? null);
        setState('done');
      } catch (e: unknown) {
        if (cancelled) return;
        setState('error');
        if (e && typeof e === 'object' && 'code' in e && typeof (e as GeolocationPositionError).code === 'number') {
          setHint(geolocationErrorMessage(e as GeolocationPositionError));
          return;
        }
        if (e instanceof Error) {
          setHint(e.message);
          return;
        }
        setHint('Something went wrong loading nearby stops.');
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <style>{`
        .ns { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px; display: flex; flex-direction: column; gap: 8px; }
        .ns-head { display: flex; align-items: flex-start; gap: 10px; }
        .ns-icon { font-size: 1rem; flex-shrink: 0; }
        .ns-label { font-size: 0.55rem; color: var(--text-faint); letter-spacing: 0.1em; margin-bottom: 3px; }
        .ns-sub { font-size: 0.65rem; color: var(--text-faint); line-height: 1.4; }
        .ns-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
        .ns-item { font-size: 0.7rem; line-height: 1.35; }
        .ns-item a { color: var(--blue-soft); text-decoration: none; font-weight: 600; }
        .ns-item a:hover { text-decoration: underline; }
        .ns-addr { display: block; color: var(--text-muted); font-weight: 400; margin-top: 2px; }
      `}</style>
      <div className="ns">
        <div className="ns-head">
          <span className="ns-icon" aria-hidden>📍</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ns-label">NEARBY STOPS</div>
            {state === 'locating' || state === 'loading' ? (
              <div className="ns-sub">Finding places to rest near you…</div>
            ) : state === 'error' ? (
              <div className="ns-sub">{hint}</div>
            ) : places.length === 0 ? (
              <div className="ns-sub">{hint ?? 'No results in this area. Try again after moving or check your API key.'}</div>
            ) : (
              <ul className="ns-list">
                {places.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="ns-item">
                    {p.mapsUrl ? (
                      <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer">
                        {p.name}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text)' }}>{p.name}</span>
                    )}
                    {p.address ? <span className="ns-addr">{p.address}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
