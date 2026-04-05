'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import type { DrowsinessState } from '@/lib/drowsiness';

const libraries: ('geometry')[] = ['geometry'];

const containerStyle: CSSProperties = { width: '100%', height: '100%' };

const defaultCenter = { lat: 37.7749, lng: -122.4194 };

/** Meters — advance to next maneuver when GPS is within this radius of the step end point. */
const STEP_COMPLETE_RADIUS_M = 42;

export type RouteMeta = { destinationLabel: string; originLabel?: string };

type Props = {
  drowsinessState: DrowsinessState;
  onRouteMetaChange?: (meta: RouteMeta | null) => void;
};

export type RouteStep = {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  distanceText: string;
  durationText: string;
  endLat: number | null;
  endLng: number | null;
};

type RouteInfo = {
  durationText: string;
  distanceText: string;
  firstInstruction: string;
  steps: RouteStep[];
};

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function googleMapsDirectionsUrl(
  origin: { lat: number; lng: number },
  destination: string,
): string {
  const o = `${origin.lat},${origin.lng}`;
  const params = new URLSearchParams({
    api: '1',
    origin: o,
    destination,
    travelmode: 'driving',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export default function GoogleNavigationMap(props: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  if (!apiKey.trim()) {
    return (
      <div className="gnw-missing">
        <p className="gnw-missing-title">Maps not configured</p>
        <p className="gnw-missing-text">
          Add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to <code>.env.local</code>. Enable <strong>Maps JavaScript API</strong>{' '}
          and <strong>Routes API</strong> on that key. Restart the dev server.
        </p>
      </div>
    );
  }
  return <GoogleNavigationInner {...props} apiKey={apiKey.trim()} />;
}

function GoogleNavigationInner({ drowsinessState, onRouteMetaChange, apiKey }: Props & { apiKey: string }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'blinkguard-google-maps',
    googleMapsApiKey: apiKey,
    libraries,
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [encodedPolyline, setEncodedPolyline] = useState<string | null>(null);
  const [routePath, setRoutePath] = useState<google.maps.LatLngLiteral[] | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [userPos, setUserPos] = useState<google.maps.LatLngLiteral | null>(null);
  const [destText, setDestText] = useState('');
  const [navError, setNavError] = useState<string | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const currentStepRowRef = useRef<HTMLDivElement | null>(null);
  const didFitRouteRef = useRef(false);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const center = userPos ?? defaultCenter;

  useEffect(() => {
    if (!isLoaded || !encodedPolyline || !window.google?.maps?.geometry?.encoding) return;
    try {
      const path = google.maps.geometry.encoding.decodePath(encodedPolyline);
      setRoutePath(path.map((p) => ({ lat: p.lat(), lng: p.lng() })));
    } catch {
      setNavError('Could not decode route polyline.');
      setEncodedPolyline(null);
      setRouteInfo(null);
    }
  }, [isLoaded, encodedPolyline]);

  useEffect(() => {
    if (!map || !routePath?.length) return;
    if (didFitRouteRef.current) return;
    const bounds = new google.maps.LatLngBounds();
    routePath.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 48);
    didFitRouteRef.current = true;
  }, [map, routePath]);

  /** Keep the map centered on your position (before and during navigation). */
  useEffect(() => {
    if (!map || !userPos) return;
    map.panTo(userPos);
  }, [map, userPos]);

  /** Advance step when GPS nears each maneuver end (same idea as in-car nav). */
  useEffect(() => {
    if (!userPos || !routeInfo?.steps.length) return;
    const steps = routeInfo.steps;
    const idx = currentStepIndex;
    const step = steps[idx];
    if (!step || step.endLat == null || step.endLng == null) return;

    const d = haversineMeters(userPos, { lat: step.endLat, lng: step.endLng });
    const last = idx >= steps.length - 1;
    if (last && d < STEP_COMPLETE_RADIUS_M * 1.2) {
      setArrived(true);
      return;
    }
    if (!last && d < STEP_COMPLETE_RADIUS_M) {
      setCurrentStepIndex((i) => Math.min(i + 1, steps.length - 1));
    }
  }, [userPos, routeInfo, currentStepIndex]);

  useEffect(() => {
    currentStepRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentStepIndex]);

  useEffect(() => {
    setArrived(false);
    setCurrentStepIndex(0);
    didFitRouteRef.current = false;
  }, [encodedPolyline]);

  const clearRoute = useCallback(() => {
    setEncodedPolyline(null);
    setRoutePath(null);
    setRouteInfo(null);
    setCurrentStepIndex(0);
    setArrived(false);
    didFitRouteRef.current = false;
    setDestText('');
    setNavError(null);
    onRouteMetaChange?.(null);
  }, [onRouteMetaChange]);

  const computeRoute = useCallback(async () => {
    const destination = destText.trim();
    if (!userPos) {
      setNavError('Waiting for GPS… Allow location access for turn-by-turn.');
      return;
    }
    if (!destination) {
      setNavError('Enter a destination address or place name.');
      return;
    }
    setIsRouting(true);
    setNavError(null);
    setRoutePath(null);
    setRouteInfo(null);
    setEncodedPolyline(null);

    try {
      const res = await fetch('/api/maps/compute-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: userPos, destination }),
      });
      const data = (await res.json()) as {
        error?: string;
        hint?: string;
        encodedPolyline?: string;
        durationText?: string;
        distanceText?: string;
        firstInstruction?: string;
        steps?: RouteStep[];
        originLabel?: string;
        destinationLabel?: string;
      };

      if (!res.ok) {
        const msg = [data.error, data.hint].filter(Boolean).join(' — ');
        setNavError(
          msg ||
            'Could not compute route. Enable Routes API and use a server key (see .env.example).',
        );
        onRouteMetaChange?.(null);
        return;
      }

      if (!data.encodedPolyline) {
        setNavError('No route returned.');
        onRouteMetaChange?.(null);
        return;
      }

      const steps = Array.isArray(data.steps) ? data.steps : [];
      setEncodedPolyline(data.encodedPolyline);
      setRouteInfo({
        durationText: data.durationText ?? '—',
        distanceText: data.distanceText ?? '—',
        firstInstruction: data.firstInstruction ?? '',
        steps,
      });
      setCurrentStepIndex(0);
      setArrived(false);
      onRouteMetaChange?.({
        destinationLabel: data.destinationLabel ?? destination,
        originLabel: data.originLabel,
      });
    } catch {
      setNavError('Network error while computing route.');
      onRouteMetaChange?.(null);
    } finally {
      setIsRouting(false);
    }
  }, [userPos, destText, onRouteMetaChange]);

  const ring =
    drowsinessState === 'danger'
      ? 'gnw-shell gnw-ring-danger'
      : drowsinessState === 'warning'
        ? 'gnw-shell gnw-ring-warn'
        : 'gnw-shell';

  if (loadError) {
    return (
      <div className="gnw-missing">
        <p className="gnw-missing-title">Map failed to load</p>
        <p className="gnw-missing-text">Check the browser console and your API key restrictions.</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="gnw-loading">
        <span className="gnw-loading-dot" />
        Loading navigation…
      </div>
    );
  }

  const start = routePath?.[0];
  const end = routePath?.length ? routePath[routePath.length - 1] : null;

  const steps = routeInfo?.steps ?? [];
  const currentStep = steps[currentStepIndex];
  const destTrim = destText.trim();
  const gmapsUrl =
    userPos && destTrim ? googleMapsDirectionsUrl(userPos, destTrim) : null;

  return (
    <>
      <style>{`
        .gnw-shell { position: relative; width: 100%; height: 100%; min-height: 280px; min-height: max(42dvh, 260px); border-radius: var(--radius, 12px); overflow: hidden; transition: box-shadow 0.35s; touch-action: pan-x pan-y pinch-zoom; }
        .gnw-ring-warn { box-shadow: 0 0 0 2px rgba(180, 160, 220, 0.5); }
        .gnw-ring-danger { box-shadow: 0 0 0 2px rgba(200, 120, 180, 0.65); }
        .gnw-missing { height: 100%; min-height: 420px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; text-align: center; background: var(--surface, #1a1a2e); border: 1px dashed var(--border, #333); border-radius: var(--radius, 12px); }
        .gnw-missing-title { font-size: 0.85rem; font-weight: 600; color: var(--text, #eee); margin: 0; }
        .gnw-missing-text { font-size: 0.72rem; color: var(--text-faint, #888); max-width: 340px; line-height: 1.55; margin: 0; }
        .gnw-missing-text code { font-size: 0.65rem; background: var(--surface2, #252540); padding: 2px 6px; border-radius: 4px; }
        .gnw-loading { height: 100%; min-height: 420px; display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 0.8rem; color: var(--text-muted, #aaa); background: var(--surface, #1a1a2e); border-radius: var(--radius, 12px); }
        .gnw-loading-dot { width: 8px; height: 8px; border-radius: 99px; background: var(--blue-soft, #8b8bd4); animation: gnw-pulse 1s ease-in-out infinite; }
        @keyframes gnw-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .gnw-bar {
          position: absolute; top: 10px; left: 10px; right: 10px;
          z-index: 1000;
          pointer-events: none;
        }
        .gnw-bar-inner {
          pointer-events: auto;
          background: rgba(15, 14, 71, 0.98);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 10px;
          padding: 10px 12px;
          box-shadow: 0 6px 28px rgba(0, 0, 0, 0.45);
          max-width: 100%;
        }
        .gnw-ac-wrap { width: 100%; }
        .gnw-ac-wrap input {
          width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(8, 8, 40, 0.85); color: #f0f0f5;
          font-size: 0.78rem;
        }
        .gnw-ac-wrap input::placeholder { color: #9ca3af; }
        .gnw-hint { font-size: 0.58rem; color: #a1a1b8; margin-top: 6px; line-height: 1.35; }
        .gnw-actions {
          display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
          margin-top: 10px;
        }
        /* Explicit colors — some mobile WebViews ignore theme vars on buttons and overlap map controls */
        button.gnw-btn {
          -webkit-appearance: none; appearance: none;
          padding: 10px 16px; border-radius: 8px; font-size: 0.78rem; font-weight: 600;
          cursor: pointer; border: 1px solid rgba(255, 255, 255, 0.22);
          background: #3d3d68; color: #f4f4f8; white-space: nowrap; font-family: inherit;
          line-height: 1.2; min-height: 40px; box-sizing: border-box;
        }
        button.gnw-btn:hover { border-color: #a5a6e8; background: #4a4a78; }
        button.gnw-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        button.gnw-btn-primary { background: #8b8bd4; color: #0f0e47; border-color: transparent; }
        button.gnw-btn-primary:hover:not(:disabled) { background: #9d9de0; }
        .gnw-panel {
          position: absolute; bottom: 10px; left: 10px; right: 10px; z-index: 999; max-width: min(100%, 560px);
          margin: 0 auto; border-radius: var(--radius-sm, 10px);
          background: rgba(12, 11, 40, 0.96); border: 1px solid var(--border, #444);
          backdrop-filter: blur(12px);
          display: flex; flex-direction: column; max-height: min(52dvh, 420px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.35);
        }
        .gnw-current {
          flex-shrink: 0; padding: 14px 16px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .gnw-turn-label { font-size: 0.52rem; letter-spacing: 0.14em; color: var(--text-faint, #888); margin-bottom: 6px; font-weight: 600; }
        .gnw-turn-text { font-size: 0.95rem; font-weight: 600; color: var(--text, #eee); line-height: 1.4; margin: 0; }
        .gnw-turn-meta { font-size: 0.68rem; color: var(--text-muted, #aaa); margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
        .gnw-arrived { font-size: 0.75rem; font-weight: 600; color: #86efac; margin-top: 6px; }
        .gnw-step-nav { display: inline-flex; gap: 6px; margin-left: auto; }
        .gnw-step-nav button {
          padding: 4px 10px; font-size: 0.62rem; font-weight: 600; border-radius: 6px;
          border: 1px solid var(--border, #555); background: rgba(255,255,255,0.06); color: var(--text-muted, #aaa);
          cursor: pointer; font-family: inherit;
        }
        .gnw-step-nav button:disabled { opacity: 0.35; cursor: not-allowed; }
        .gnw-step-nav button:not(:disabled):hover { border-color: var(--blue-soft, #8b8bd4); color: var(--text, #eee); }
        .gnw-steps-head { font-size: 0.58rem; letter-spacing: 0.1em; color: var(--text-faint, #888); padding: 8px 16px 4px; font-weight: 600; }
        .gnw-steps {
          overflow-y: auto; padding: 0 8px 10px 12px; flex: 1; min-height: 0;
          -webkit-overflow-scrolling: touch;
        }
        .gnw-step-row {
          display: grid; grid-template-columns: 28px 1fr; gap: 10px; padding: 8px 8px 8px 4px;
          border-radius: 8px; margin-bottom: 2px; border: 1px solid transparent;
        }
        .gnw-step-row.on { background: rgba(139, 139, 212, 0.12); border-color: rgba(139, 139, 212, 0.35); }
        .gnw-step-num { font-size: 0.65rem; font-weight: 700; color: var(--text-faint, #888); text-align: right; padding-top: 2px; }
        .gnw-step-body { min-width: 0; }
        .gnw-step-inst { font-size: 0.72rem; color: var(--text, #ddd); line-height: 1.4; margin: 0; }
        .gnw-step-sub { font-size: 0.58rem; color: var(--text-faint, #777); margin-top: 4px; }
        .gnw-gmaps {
          flex-shrink: 0; padding: 10px 14px 12px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .gnw-gmaps a {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 10px 12px; border-radius: var(--radius-sm, 8px);
          font-size: 0.72rem; font-weight: 600; text-decoration: none;
          background: rgba(255,255,255,0.08); color: var(--blue-soft, #a5b4fc); border: 1px solid rgba(139, 139, 212, 0.35);
        }
        .gnw-gmaps a:hover { background: rgba(139, 139, 212, 0.15); }
        .gnw-err { position: absolute; bottom: min(58dvh, 460px); left: 12px; right: 12px; z-index: 998; text-align: center; font-size: 0.72rem; color: #fca5a5; pointer-events: none; }
      `}</style>
      <div className={ring}>
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={center}
          zoom={userPos ? 14 : 11}
          onLoad={setMap}
          options={{
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            fullscreenControlOptions: {
              position: google.maps.ControlPosition.RIGHT_BOTTOM,
            },
            zoomControl: true,
            zoomControlOptions: {
              position: google.maps.ControlPosition.RIGHT_BOTTOM,
            },
            gestureHandling: 'greedy',
          }}
        >
          {userPos && (
            <Marker
              position={userPos}
              title="You"
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeColor: '#fff',
                strokeWeight: 2,
              }}
            />
          )}
          {routePath && routePath.length > 1 && (
            <Polyline
              path={routePath}
              options={{
                strokeColor: '#6b8cff',
                strokeWeight: 5,
                strokeOpacity: 0.95,
              }}
            />
          )}
          {start && end && routePath && routePath.length > 1 && (
            <>
              <Marker position={start} label="A" />
              <Marker position={end} label="B" />
            </>
          )}
        </GoogleMap>

        <div className="gnw-bar">
          <div className="gnw-bar-inner">
            <div className="gnw-ac-wrap">
              <input
                type="text"
                value={destText}
                onChange={(e) => setDestText(e.target.value)}
                placeholder="Destination address or place (e.g. 1600 Amphitheatre Pkwy, Mountain View)"
                autoComplete="street-address"
              />
              <p className="gnw-hint">
                Routing uses Google <strong>Routes API</strong> on the server (not legacy browser Directions). Enable Routes API on your key.
              </p>
            </div>
            <div className="gnw-actions">
              <button type="button" className="gnw-btn gnw-btn-primary" onClick={() => void computeRoute()} disabled={isRouting}>
                {isRouting ? 'Routing…' : 'Navigate'}
              </button>
              <button type="button" className="gnw-btn" onClick={clearRoute}>
                Clear
              </button>
            </div>
          </div>
        </div>

        {navError && <div className="gnw-err">{navError}</div>}

        {routeInfo && (steps.length > 0 || routeInfo.firstInstruction) && (
          <div className="gnw-panel">
            <div className="gnw-current">
              {steps.length === 0 ? (
                <>
                  <div className="gnw-turn-label">ROUTE</div>
                  {routeInfo.firstInstruction && (
                    <p className="gnw-turn-text">{routeInfo.firstInstruction}</p>
                  )}
                  <div className="gnw-turn-meta">
                    <span>
                      {routeInfo.durationText} · {routeInfo.distanceText}
                    </span>
                  </div>
                  <p className="gnw-step-sub" style={{ marginTop: 10 }}>
                    Detailed turn list unavailable. Use Open in Google Maps for full turn-by-turn in the Maps app.
                  </p>
                </>
              ) : (
                <>
                  <div className="gnw-turn-label">
                    {arrived ? 'DESTINATION' : `STEP ${currentStepIndex + 1} OF ${steps.length}`}
                  </div>
                  {arrived ? (
                    <p className="gnw-turn-text">You’ve arrived</p>
                  ) : (
                    currentStep && <p className="gnw-turn-text">{currentStep.instruction}</p>
                  )}
                  {!arrived && currentStep && (
                    <div className="gnw-turn-meta">
                      <span>
                        This segment: {currentStep.distanceText} · {currentStep.durationText}
                      </span>
                      <span>
                        Trip: {routeInfo.durationText} · {routeInfo.distanceText}
                      </span>
                      <div className="gnw-step-nav" role="group" aria-label="Step">
                        <button
                          type="button"
                          onClick={() => {
                            setArrived(false);
                            setCurrentStepIndex((i) => Math.max(0, i - 1));
                          }}
                          disabled={currentStepIndex === 0}
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCurrentStepIndex((i) => Math.min(steps.length - 1, i + 1))
                          }
                          disabled={currentStepIndex >= steps.length - 1}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                  {arrived && (
                    <p className="gnw-arrived">Route complete. Safe parking — rest if you need to.</p>
                  )}
                </>
              )}
            </div>

            {steps.length > 0 && !arrived && (
              <>
                <div className="gnw-steps-head">ALL TURNS</div>
                <div className="gnw-steps">
                  {steps.map((step, i) => (
                    <div
                      key={i}
                      className={`gnw-step-row ${i === currentStepIndex ? 'on' : ''}`}
                      ref={i === currentStepIndex ? currentStepRowRef : undefined}
                    >
                      <div className="gnw-step-num">{i + 1}</div>
                      <div className="gnw-step-body">
                        <p className="gnw-step-inst">{step.instruction}</p>
                        <div className="gnw-step-sub">
                          {step.distanceText} · {step.durationText}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {gmapsUrl && (
              <div className="gnw-gmaps">
                <a href={gmapsUrl} target="_blank" rel="noopener noreferrer">
                  Open in Google Maps
                  <span aria-hidden> ↗</span>
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
