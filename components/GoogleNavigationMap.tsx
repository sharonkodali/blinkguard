'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { DirectionsRenderer, GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import type { DrowsinessState } from '@/lib/drowsiness';

/** Do not load `places` in the browser — legacy Places Autocomplete requires APIs many projects no longer enable. */
const libraries: [] = [];

const containerStyle: CSSProperties = { width: '100%', height: '100%' };

const defaultCenter = { lat: 37.7749, lng: -122.4194 };

export type RouteMeta = { destinationLabel: string; originLabel?: string };

type Props = {
  drowsinessState: DrowsinessState;
  onRouteMetaChange?: (meta: RouteMeta | null) => void;
};

export default function GoogleNavigationMap(props: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  if (!apiKey.trim()) {
    return (
      <div className="gnw-missing">
        <p className="gnw-missing-title">Maps not configured</p>
        <p className="gnw-missing-text">
          Add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to <code>.env.local</code>. Enable <strong>Maps JavaScript API</strong>{' '}
          and <strong>Directions API</strong> on that key (Geocoding is included for address search). Restart the dev server.
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
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [userPos, setUserPos] = useState<google.maps.LatLngLiteral | null>(null);
  const [destText, setDestText] = useState('');
  const [navError, setNavError] = useState<string | null>(null);
  const [isRouting, setIsRouting] = useState(false);

  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    directionsServiceRef.current = new google.maps.DirectionsService();
  }, [isLoaded]);

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
    if (!map || !userPos || directions) return;
    map.panTo(userPos);
  }, [map, userPos, directions]);

  const clearRoute = useCallback(() => {
    setDirections(null);
    setDestText('');
    setNavError(null);
    onRouteMetaChange?.(null);
  }, [onRouteMetaChange]);

  const computeRoute = useCallback(() => {
    if (!isLoaded || !directionsServiceRef.current) return;
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
    directionsServiceRef.current.route(
      {
        origin: userPos,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: false,
      },
      (result, status) => {
        setIsRouting(false);
        if (status !== 'OK' || !result) {
          setNavError('Could not build a driving route. Check the address and your Directions API billing.');
          setDirections(null);
          onRouteMetaChange?.(null);
          return;
        }
        setDirections(result);
        const leg = result.routes[0]?.legs[0];
        onRouteMetaChange?.({
          destinationLabel: leg?.end_address ?? destination,
          originLabel: leg?.start_address,
        });
      },
    );
  }, [isLoaded, userPos, destText, onRouteMetaChange]);

  useEffect(() => {
    if (!map || !directions) return;
    const b = directions.routes[0]?.bounds;
    if (b) map.fitBounds(b);
  }, [map, directions]);

  const nextInstruction =
    directions?.routes[0]?.legs[0]?.steps[0]?.instructions?.replace(/<[^>]+>/g, '') ?? null;
  const eta = directions?.routes[0]?.legs[0]?.duration?.text;
  const dist = directions?.routes[0]?.legs[0]?.distance?.text;

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

  return (
    <>
      <style>{`
        .gnw-shell { position: relative; width: 100%; height: 100%; min-height: 420px; border-radius: var(--radius, 12px); overflow: hidden; transition: box-shadow 0.35s; }
        .gnw-ring-warn { box-shadow: 0 0 0 2px rgba(180, 160, 220, 0.5); }
        .gnw-ring-danger { box-shadow: 0 0 0 2px rgba(200, 120, 180, 0.65); }
        .gnw-missing { height: 100%; min-height: 420px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; text-align: center; background: var(--surface, #1a1a2e); border: 1px dashed var(--border, #333); border-radius: var(--radius, 12px); }
        .gnw-missing-title { font-size: 0.85rem; font-weight: 600; color: var(--text, #eee); margin: 0; }
        .gnw-missing-text { font-size: 0.72rem; color: var(--text-faint, #888); max-width: 340px; line-height: 1.55; margin: 0; }
        .gnw-missing-text code { font-size: 0.65rem; background: var(--surface2, #252540); padding: 2px 6px; border-radius: 4px; }
        .gnw-loading { height: 100%; min-height: 420px; display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 0.8rem; color: var(--text-muted, #aaa); background: var(--surface, #1a1a2e); border-radius: var(--radius, 12px); }
        .gnw-loading-dot { width: 8px; height: 8px; border-radius: 99px; background: var(--blue-soft, #8b8bd4); animation: gnw-pulse 1s ease-in-out infinite; }
        @keyframes gnw-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .gnw-bar { position: absolute; top: 12px; left: 12px; right: 12px; z-index: 2; display: flex; flex-wrap: wrap; gap: 8px; align-items: stretch; }
        .gnw-ac-wrap { flex: 1; min-width: 160px; }
        .gnw-ac-wrap input {
          width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: var(--radius-sm, 8px);
          border: 1px solid var(--border, #444); background: rgba(15, 14, 71, 0.92); color: var(--text, #eee);
          font-size: 0.78rem; backdrop-filter: blur(8px);
        }
        .gnw-ac-wrap input::placeholder { color: var(--text-faint, #888); }
        .gnw-hint { font-size: 0.58rem; color: var(--text-faint, #888); margin-top: 4px; line-height: 1.35; }
        .gnw-btn {
          padding: 10px 14px; border-radius: var(--radius-sm, 8px); font-size: 0.72rem; font-weight: 600;
          cursor: pointer; border: 1px solid var(--border-strong, #555); background: var(--slate, #3a3a6a);
          color: var(--text, #eee); white-space: nowrap; font-family: inherit;
        }
        .gnw-btn:hover { border-color: var(--blue-soft, #8b8bd4); }
        .gnw-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .gnw-btn-primary { background: var(--blue-soft, #8b8bd4); color: var(--bg, #0f0e47); border-color: transparent; }
        .gnw-turn {
          position: absolute; bottom: 12px; left: 12px; right: 12px; z-index: 2; max-width: min(100%, 520px);
          margin: 0 auto; padding: 12px 14px; border-radius: var(--radius-sm, 8px);
          background: rgba(15, 14, 71, 0.94); border: 1px solid var(--border, #444);
          backdrop-filter: blur(10px);
        }
        .gnw-turn-label { font-size: 0.52rem; letter-spacing: 0.12em; color: var(--text-faint, #888); margin-bottom: 6px; font-weight: 600; }
        .gnw-turn-text { font-size: 0.82rem; color: var(--text, #eee); line-height: 1.35; margin: 0; }
        .gnw-turn-meta { font-size: 0.65rem; color: var(--text-muted, #aaa); margin-top: 8px; }
        .gnw-err { position: absolute; bottom: 100px; left: 12px; right: 12px; z-index: 2; text-align: center; font-size: 0.72rem; color: #fca5a5; }
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
            zoomControl: true,
          }}
        >
          {directions && (
            <DirectionsRenderer
              directions={directions}
              options={{
                suppressMarkers: false,
                polylineOptions: { strokeColor: '#6b8cff', strokeWeight: 5, strokeOpacity: 0.95 },
              }}
            />
          )}
        </GoogleMap>

        <div className="gnw-bar">
          <div className="gnw-ac-wrap">
            <input
              type="text"
              value={destText}
              onChange={(e) => setDestText(e.target.value)}
              placeholder="Destination address or place (e.g. 1600 Amphitheatre Pkwy, Mountain View)"
              autoComplete="street-address"
            />
            <p className="gnw-hint">Uses Directions API only — no legacy Places Autocomplete. Type a full address or well-known place name.</p>
          </div>
          <button type="button" className="gnw-btn gnw-btn-primary" onClick={computeRoute} disabled={isRouting}>
            {isRouting ? 'Routing…' : 'Navigate'}
          </button>
          <button type="button" className="gnw-btn" onClick={clearRoute}>
            Clear
          </button>
        </div>

        {navError && <div className="gnw-err">{navError}</div>}

        {directions && (nextInstruction || eta) && (
          <div className="gnw-turn">
            <div className="gnw-turn-label">NEXT STEP</div>
            {nextInstruction && <p className="gnw-turn-text">{nextInstruction}</p>}
            <div className="gnw-turn-meta">
              {eta && <span>{eta}</span>}
              {eta && dist && ' · '}
              {dist && <span>{dist}</span>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
