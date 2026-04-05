'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import type { DrowsinessState } from '@/lib/drowsiness';

const libraries: ('geometry')[] = ['geometry'];
const containerStyle: CSSProperties = { width: '100%', height: '100%' };
const defaultCenter = { lat: 37.7749, lng: -122.4194 };
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
  durationSeconds: number;
  distanceText: string;
  firstInstruction: string;
  steps: RouteStep[];
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}


function arrivalTime(durationSeconds: number): string {
  const d = new Date(Date.now() + durationSeconds * 1000);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ── Turn direction parsing ───────────────────────────────────────────────────

type TurnDir = 'straight' | 'right' | 'left' | 'slight-right' | 'slight-left' | 'u-turn' | 'arrived' | 'merge' | 'roundabout';

function getTurnDir(instruction: string): TurnDir {
  const t = instruction.toLowerCase();
  if (t.includes('arriv') || t.includes('destination')) return 'arrived';
  if (t.includes('u-turn') || t.includes('uturn')) return 'u-turn';
  if (t.includes('roundabout') || t.includes('rotary')) return 'roundabout';
  if (t.includes('merge') || t.includes('keep right') || t.includes('keep left')) return 'merge';
  if (t.includes('slight right') || t.includes('bear right')) return 'slight-right';
  if (t.includes('slight left') || t.includes('bear left')) return 'slight-left';
  if ((t.includes('turn right') || t.includes('right on') || t.includes('right onto') || t.includes('right at')) && !t.includes('left')) return 'right';
  if ((t.includes('turn left') || t.includes('left on') || t.includes('left onto') || t.includes('left at')) && !t.includes('right')) return 'left';
  return 'straight';
}

function TurnIcon({ dir, size = 44 }: { dir: TurnDir; size?: number }) {
  const S = size;
  const strokeColor = '#fff';
  const sw = Math.round(S / 13);
  const c = S / 2;

  const icons: Record<TurnDir, React.ReactNode> = {
    straight: (
      <g>
        <line x1={c} y1={S * 0.75} x2={c} y2={S * 0.18} stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" />
        <polyline points={`${c - S * 0.22},${S * 0.35} ${c},${S * 0.14} ${c + S * 0.22},${S * 0.35}`} fill="none" stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
    right: (
      <g>
        <path d={`M${c - S * 0.16} ${S * 0.75} L${c - S * 0.16} ${c - S * 0.04} Q${c - S * 0.16} ${S * 0.22} ${c + S * 0.04} ${S * 0.22} L${c + S * 0.24} ${S * 0.22}`} fill="none" stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={`${c + S * 0.06},${S * 0.35} ${c + S * 0.26},${S * 0.22} ${c + S * 0.06},${S * 0.09}`} fill="none" stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
    left: (
      <g>
        <path d={`M${c + S * 0.16} ${S * 0.75} L${c + S * 0.16} ${c - S * 0.04} Q${c + S * 0.16} ${S * 0.22} ${c - S * 0.04} ${S * 0.22} L${c - S * 0.24} ${S * 0.22}`} fill="none" stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={`${c - S * 0.06},${S * 0.35} ${c - S * 0.26},${S * 0.22} ${c - S * 0.06},${S * 0.09}`} fill="none" stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
    'slight-right': (
      <g>
        <path d={`M${c - S * 0.1} ${S * 0.76} L${c - S * 0.1} ${c + S * 0.05} Q${c - S * 0.04} ${S * 0.25} ${c + S * 0.22} ${S * 0.2}`} fill="none" stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" />
        <polyline points={`${c + S * 0.04},${S * 0.33} ${c + S * 0.24},${S * 0.19} ${c + S * 0.12},${S * 0.06}`} fill="none" stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
    'slight-left': (
      <g>
        <path d={`M${c + S * 0.1} ${S * 0.76} L${c + S * 0.1} ${c + S * 0.05} Q${c + S * 0.04} ${S * 0.25} ${c - S * 0.22} ${S * 0.2}`} fill="none" stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" />
        <polyline points={`${c - S * 0.04},${S * 0.33} ${c - S * 0.24},${S * 0.19} ${c - S * 0.12},${S * 0.06}`} fill="none" stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
    'u-turn': (
      <g>
        <path d={`M${c - S * 0.14} ${S * 0.76} L${c - S * 0.14} ${c - S * 0.1} A${S * 0.14} ${S * 0.14} 0 0 1 ${c + S * 0.14} ${c - S * 0.1} L${c + S * 0.14} ${S * 0.44}`} fill="none" stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" />
        <polyline points={`${c + S * 0.01},${S * 0.32} ${c + S * 0.15},${S * 0.44} ${c + S * 0.28},${S * 0.32}`} fill="none" stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
    arrived: (
      <g>
        <circle cx={c} cy={c - S * 0.1} r={S * 0.22} fill={strokeColor} />
        <line x1={c} y1={c + S * 0.12} x2={c} y2={S * 0.76} stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" />
      </g>
    ),
    merge: (
      <g>
        <line x1={c} y1={S * 0.8} x2={c} y2={S * 0.18} stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" />
        <path d={`M${c + S * 0.28} ${S * 0.7} Q${c + S * 0.28} ${S * 0.4} ${c} ${S * 0.38}`} fill="none" stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" />
        <polyline points={`${c - S * 0.2},${S * 0.26} ${c},${S * 0.14} ${c + S * 0.2},${S * 0.26}`} fill="none" stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
    roundabout: (
      <g>
        <circle cx={c} cy={c} r={S * 0.22} fill="none" stroke={strokeColor} strokeWidth={sw} />
        <polyline points={`${c + S * 0.22},${c - S * 0.16} ${c + S * 0.22},${c + S * 0.16}`} stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" />
        <polyline points={`${c + S * 0.08},${c - S * 0.3} ${c + S * 0.22},${c - S * 0.16} ${c + S * 0.36},${c - S * 0.3}`} fill="none" stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
  };

  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-hidden>
      {icons[dir]}
    </svg>
  );
}

// ── Voice announcement ───────────────────────────────────────────────────────

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.98;
  u.pitch = 1.0;
  u.volume = 1.0;
  window.speechSynthesis.speak(u);
}

// ── Main export ──────────────────────────────────────────────────────────────

export default function GoogleNavigationMap(props: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  if (!apiKey.trim()) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, padding: 24, background: '#0f172a', color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center' }}>
        <p style={{ fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Maps not configured</p>
        <p style={{ margin: 0, maxWidth: 320, lineHeight: 1.55 }}>Add <code style={{ background: '#1e293b', padding: '2px 6px', borderRadius: 4 }}>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to <code style={{ background: '#1e293b', padding: '2px 6px', borderRadius: 4 }}>.env.local</code> and restart.</p>
      </div>
    );
  }
  return <GoogleNavigationInner {...props} apiKey={apiKey.trim()} />;
}

function GoogleNavigationInner({ drowsinessState, onRouteMetaChange, apiKey }: Props & { apiKey: string }) {
  const { isLoaded, loadError } = useJsApiLoader({ id: 'blinkguard-google-maps', googleMapsApiKey: apiKey, libraries });

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
  const [searchFocused, setSearchFocused] = useState(false);
  const [showList, setShowList] = useState(false);
  const didFitRouteRef = useRef(false);
  const prevStepRef = useRef(-1);

  // GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Decode polyline
  useEffect(() => {
    if (!isLoaded || !encodedPolyline || !window.google?.maps?.geometry?.encoding) return;
    try {
      const path = google.maps.geometry.encoding.decodePath(encodedPolyline);
      setRoutePath(path.map((p) => ({ lat: p.lat(), lng: p.lng() })));
    } catch {
      setNavError('Could not decode route.');
      setEncodedPolyline(null);
      setRouteInfo(null);
    }
  }, [isLoaded, encodedPolyline]);

  // Fit bounds once on new route
  useEffect(() => {
    if (!map || !routePath?.length || didFitRouteRef.current) return;
    const bounds = new google.maps.LatLngBounds();
    routePath.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, { top: 100, bottom: 140, left: 20, right: 20 });
    didFitRouteRef.current = true;
  }, [map, routePath]);

  // Follow user position
  useEffect(() => {
    if (!map || !userPos) return;
    if (routePath?.length) {
      map.panTo(userPos);
      map.setZoom(17);
    } else {
      map.panTo(userPos);
    }
  }, [map, userPos, routePath]);

  // GPS step advance
  useEffect(() => {
    if (!userPos || !routeInfo?.steps.length) return;
    const steps = routeInfo.steps;
    const step = steps[currentStepIndex];
    if (!step || step.endLat == null || step.endLng == null) return;
    const d = haversineMeters(userPos, { lat: step.endLat, lng: step.endLng });
    if (currentStepIndex >= steps.length - 1 && d < STEP_COMPLETE_RADIUS_M * 1.2) {
      setArrived(true);
      speak('You have arrived at your destination.');
    } else if (currentStepIndex < steps.length - 1 && d < STEP_COMPLETE_RADIUS_M) {
      setCurrentStepIndex((i) => Math.min(i + 1, steps.length - 1));
    }
  }, [userPos, routeInfo, currentStepIndex]);

  // Voice announce on step change
  useEffect(() => {
    if (!routeInfo?.steps.length) return;
    if (currentStepIndex === prevStepRef.current) return;
    prevStepRef.current = currentStepIndex;
    const step = routeInfo.steps[currentStepIndex];
    if (step) speak(step.instruction);
  }, [currentStepIndex, routeInfo]);

  // Reset on new route
  useEffect(() => {
    setArrived(false);
    setCurrentStepIndex(0);
    prevStepRef.current = -1;
    didFitRouteRef.current = false;
  }, [encodedPolyline]);

  const clearRoute = useCallback(() => {
    setEncodedPolyline(null);
    setRoutePath(null);
    setRouteInfo(null);
    setCurrentStepIndex(0);
    setArrived(false);
    prevStepRef.current = -1;
    didFitRouteRef.current = false;
    setDestText('');
    setNavError(null);
    onRouteMetaChange?.(null);
  }, [onRouteMetaChange]);

  const computeRoute = useCallback(async () => {
    const destination = destText.trim();
    if (!userPos) { setNavError('Waiting for GPS location…'); return; }
    if (!destination) { setNavError('Enter a destination.'); return; }
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
        error?: string; hint?: string;
        encodedPolyline?: string; durationText?: string; durationSeconds?: number;
        distanceText?: string; firstInstruction?: string; steps?: RouteStep[];
        originLabel?: string; destinationLabel?: string;
      };
      if (!res.ok) {
        setNavError([data.error, data.hint].filter(Boolean).join(' — ') || 'Route failed.');
        onRouteMetaChange?.(null);
        return;
      }
      if (!data.encodedPolyline) { setNavError('No route returned.'); onRouteMetaChange?.(null); return; }
      const steps = Array.isArray(data.steps) ? data.steps : [];
      setEncodedPolyline(data.encodedPolyline);
      setRouteInfo({ durationText: data.durationText ?? '—', durationSeconds: data.durationSeconds ?? 0, distanceText: data.distanceText ?? '—', firstInstruction: data.firstInstruction ?? '', steps });
      setCurrentStepIndex(0);
      setArrived(false);
      onRouteMetaChange?.({ destinationLabel: data.destinationLabel ?? destination, originLabel: data.originLabel });
      if (steps[0]) speak(steps[0].instruction);
    } catch { setNavError('Network error.'); onRouteMetaChange?.(null); }
    finally { setIsRouting(false); }
  }, [userPos, destText, onRouteMetaChange]);

  if (loadError) {
    return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.8rem', background: '#0f172a' }}>Map failed to load. Check your API key.</div>;
  }
  if (!isLoaded) {
    return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.8rem', background: '#0f172a', gap: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', animation: 'gnw-pulse 1s ease-in-out infinite', display: 'inline-block' }} />
      Loading map…
    </div>;
  }

  const steps = routeInfo?.steps ?? [];
  const currentStep = steps[currentStepIndex];
  const isNavigating = !!routeInfo;
  const turnDir = currentStep ? getTurnDir(currentStep.instruction) : 'straight';
  const nextStep = steps[currentStepIndex + 1];
  const dangerBg = drowsinessState === 'danger' ? '#7f1d1d' : drowsinessState === 'warning' ? '#78350f' : '#1a3a2d';

  const css = `
    @keyframes gnw-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
    @keyframes gnw-fadein { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }

    .gnw-root { position:relative; width:100%; height:100%; background:#e8eaed; }

    /* ── Search bar (pre-navigation) ─────────────────────────────── */
    .gnw-search {
      position:absolute; top:0; left:0; right:0; z-index:1000;
      padding:10px 10px 0;
    }
    .gnw-search-inner {
      background:#fff; border-radius:24px;
      box-shadow:0 2px 12px rgba(0,0,0,0.18);
      overflow:hidden;
    }
    .gnw-search-row {
      display:flex; align-items:center; gap:0; padding:0 4px 0 16px;
    }
    .gnw-search-input {
      flex:1; border:none; outline:none; font-size:0.9rem; line-height:1.2;
      padding:14px 4px; background:transparent; color:#202124;
      font-family:inherit;
    }
    .gnw-search-input::placeholder { color:#9aa0a6; }
    .gnw-search-nav-btn {
      -webkit-appearance:none; appearance:none;
      background:#1a73e8; color:#fff; border:none; border-radius:20px;
      padding:10px 18px; font-size:0.82rem; font-weight:600;
      cursor:pointer; font-family:inherit; white-space:nowrap;
      margin:6px 4px 6px 0;
    }
    .gnw-search-nav-btn:disabled { opacity:0.55; }
    .gnw-search-clear {
      -webkit-appearance:none; appearance:none;
      background:transparent; border:none; color:#5f6368;
      font-size:1.1rem; cursor:pointer; padding:10px 8px; line-height:1;
    }
    .gnw-search-dest-row {
      padding:0 16px 4px; font-size:0.72rem; color:#5f6368;
      display:flex; align-items:center; gap:6px;
    }
    .gnw-search-dest-dot { width:8px; height:8px; border-radius:50%; background:#ea4335; flex-shrink:0; }
    .gnw-search-dest-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    /* ── Top navigation banner (active route) ────────────────────── */
    .gnw-top-banner {
      position:absolute; top:0; left:0; right:0; z-index:1000;
      display:flex; align-items:stretch; gap:0; min-height:80px;
      animation:gnw-fadein 0.25s ease;
      box-shadow:0 3px 14px rgba(0,0,0,0.25);
    }
    .gnw-banner-icon {
      display:flex; align-items:center; justify-content:center;
      min-width:80px; padding:12px 14px; flex-shrink:0;
    }
    .gnw-banner-text {
      flex:1; display:flex; flex-direction:column; justify-content:center;
      padding:12px 14px 12px 0; min-width:0;
    }
    .gnw-banner-distance {
      font-size:0.78rem; font-weight:500; margin-bottom:3px; opacity:0.9;
      letter-spacing:0.02em;
    }
    .gnw-banner-street {
      font-size:1.15rem; font-weight:700; line-height:1.25;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    .gnw-banner-next {
      font-size:0.68rem; margin-top:5px; opacity:0.78; line-height:1.3;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }

    /* ── Bottom ETA strip ────────────────────────────────────────── */
    .gnw-eta {
      position:absolute; bottom:0; left:0; right:0; z-index:1000;
      background:#fff; border-radius:18px 18px 0 0;
      box-shadow:0 -2px 16px rgba(0,0,0,0.13);
      padding:14px 16px calc(14px + env(safe-area-inset-bottom,0px));
      animation:gnw-fadein 0.25s ease;
    }
    .gnw-eta-row {
      display:flex; align-items:center; gap:0;
    }
    .gnw-eta-stat {
      flex:1; text-align:center;
    }
    .gnw-eta-val {
      font-size:1.05rem; font-weight:700; color:#202124; line-height:1.1;
      display:block;
    }
    .gnw-eta-lbl {
      font-size:0.62rem; color:#5f6368; margin-top:2px; display:block;
    }
    .gnw-eta-divider {
      width:1px; height:32px; background:#e0e0e0; flex-shrink:0; margin:0 2px;
    }
    .gnw-eta-exit {
      -webkit-appearance:none; appearance:none;
      background:#ea4335; color:#fff; border:none; border-radius:22px;
      padding:11px 20px; font-size:0.85rem; font-weight:700;
      cursor:pointer; font-family:inherit; margin-left:10px;
      box-shadow:0 2px 8px rgba(234,67,53,0.35);
    }
    .gnw-eta-gmaps {
      display:block; text-align:center; margin-top:10px;
      font-size:0.72rem; color:#1a73e8; text-decoration:none; font-weight:600;
    }

    /* ── Arrived card ─────────────────────────────────────────────── */
    .gnw-arrived {
      position:absolute; bottom:0; left:0; right:0; z-index:1000;
      background:#fff; border-radius:18px 18px 0 0;
      box-shadow:0 -2px 16px rgba(0,0,0,0.13);
      padding:22px 20px calc(20px + env(safe-area-inset-bottom,0px));
      text-align:center; animation:gnw-fadein 0.25s ease;
    }
    .gnw-arrived-pin { font-size:2.2rem; margin-bottom:8px; }
    .gnw-arrived-title { font-size:1.15rem; font-weight:700; color:#202124; margin:0 0 4px; }
    .gnw-arrived-sub { font-size:0.78rem; color:#5f6368; margin:0 0 14px; }
    .gnw-arrived-done {
      -webkit-appearance:none; appearance:none;
      background:#1a73e8; color:#fff; border:none; border-radius:22px;
      padding:11px 28px; font-size:0.88rem; font-weight:700; cursor:pointer; font-family:inherit;
    }

    /* ── Error toast ─────────────────────────────────────────────── */
    .gnw-err {
      position:absolute; bottom:80px; left:12px; right:12px; z-index:1001;
      background:rgba(234,67,53,0.95); color:#fff; border-radius:10px;
      padding:10px 14px; font-size:0.75rem; text-align:center;
      box-shadow:0 4px 14px rgba(234,67,53,0.35); pointer-events:none;
    }

    /* ── Search mode step list (hidden for now, expandable later) ── */
    .gnw-steps-sheet {
      position:absolute; bottom:0; left:0; right:0; z-index:900;
      background:#fff; border-radius:18px 18px 0 0;
      box-shadow:0 -2px 16px rgba(0,0,0,0.1);
      max-height:50vh; overflow-y:auto;
      -webkit-overflow-scrolling:touch;
      padding:8px 0 calc(8px + env(safe-area-inset-bottom,0px));
    }
    .gnw-steps-title {
      font-size:0.62rem; font-weight:700; letter-spacing:0.12em; color:#5f6368;
      padding:8px 16px 4px; text-transform:uppercase;
    }
    .gnw-step-item {
      display:flex; align-items:flex-start; gap:12px;
      padding:10px 16px; border-bottom:1px solid #f1f3f4;
    }
    .gnw-step-item.active { background:#e8f0fe; }
    .gnw-step-num-badge {
      width:24px; height:24px; border-radius:50%; background:#dadce0;
      display:flex; align-items:center; justify-content:center;
      font-size:0.65rem; font-weight:700; color:#3c4043; flex-shrink:0;
      margin-top:2px;
    }
    .gnw-step-item.active .gnw-step-num-badge { background:#1a73e8; color:#fff; }
    .gnw-step-inst-text { font-size:0.82rem; color:#202124; line-height:1.4; margin:0; }
    .gnw-step-dist-text { font-size:0.68rem; color:#5f6368; margin-top:3px; }

    /* ── List toggle ─────────────────────────────────────────────── */
    .gnw-list-toggle {
      position:absolute; right:12px; z-index:999;
      width:44px; height:44px; border-radius:50%;
      background:#fff; border:none; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 2px 8px rgba(0,0,0,0.18);
      font-size:1.1rem; color:#5f6368;
    }
  `;

  return (
    <>
      <style>{css}</style>
      <div className="gnw-root">
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={userPos ?? defaultCenter}
          zoom={userPos ? 14 : 11}
          onLoad={setMap}
          options={{
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            zoomControl: false,
            gestureHandling: 'greedy',
            clickableIcons: false,
            styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
          }}
        >
          {userPos && (
            <Marker
              position={userPos}
              title="You"
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 9,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeColor: '#fff',
                strokeWeight: 2.5,
              }}
              zIndex={10}
            />
          )}
          {routePath && routePath.length > 1 && (
            <>
              {/* Route shadow */}
              <Polyline path={routePath} options={{ strokeColor: '#1557b0', strokeWeight: 9, strokeOpacity: 0.25, zIndex: 1 }} />
              {/* Route line */}
              <Polyline path={routePath} options={{ strokeColor: '#4285F4', strokeWeight: 6, strokeOpacity: 1, zIndex: 2 }} />
            </>
          )}
          {routePath && routePath.length > 1 && (
            <Marker
              position={routePath[routePath.length - 1]}
              title="Destination"
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: '#ea4335',
                fillOpacity: 1,
                strokeColor: '#fff',
                strokeWeight: 2,
              }}
              zIndex={9}
            />
          )}
        </GoogleMap>

        {/* ── Search bar / destination input (when no active route or not arrived) ── */}
        {!isNavigating && (
          <div className="gnw-search">
            <div className="gnw-search-inner">
              <div className="gnw-search-row">
                <input
                  className="gnw-search-input"
                  type="text"
                  value={destText}
                  onChange={(e) => setDestText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void computeRoute()}
                  placeholder="Where to?"
                  autoComplete="street-address"
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
                {destText && (
                  <button type="button" className="gnw-search-clear" onClick={() => { setDestText(''); setNavError(null); }} aria-label="Clear">✕</button>
                )}
                <button
                  type="button"
                  className="gnw-search-nav-btn"
                  onClick={() => void computeRoute()}
                  disabled={isRouting || !destText.trim()}
                >
                  {isRouting ? '…' : 'Go'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Top turn banner (navigating) ── */}
        {isNavigating && !arrived && currentStep && (
          <div className="gnw-top-banner" style={{ background: dangerBg }}>
            <div className="gnw-banner-icon">
              <TurnIcon dir={turnDir} size={48} />
            </div>
            <div className="gnw-banner-text">
              <div className="gnw-banner-distance" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {currentStep.distanceText}
              </div>
              <div className="gnw-banner-street" style={{ color: '#fff' }}>
                {currentStep.instruction.replace(/Turn (right|left) onto /i, '').replace(/Head \w+ on /i, '').replace(/Continue onto /i, '') || currentStep.instruction}
              </div>
              {nextStep && (
                <div className="gnw-banner-next" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  Then: {nextStep.instruction}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ETA bottom strip (navigating, not arrived) ── */}
        {isNavigating && !arrived && routeInfo && (
          <>
            <button
              type="button"
              className="gnw-list-toggle"
              style={{ bottom: arrived ? 210 : 170 }}
              onClick={() => setShowList(v => !v)}
              aria-label="Toggle step list"
            >
              {showList ? '▾' : '☰'}
            </button>

            <div className="gnw-eta">
              <div className="gnw-eta-row">
                <div className="gnw-eta-stat">
                  <span className="gnw-eta-val">{arrivalTime(routeInfo.durationSeconds)}</span>
                  <span className="gnw-eta-lbl">arrival</span>
                </div>
                <div className="gnw-eta-divider" />
                <div className="gnw-eta-stat">
                  <span className="gnw-eta-val">{routeInfo.durationText}</span>
                  <span className="gnw-eta-lbl">remaining</span>
                </div>
                <div className="gnw-eta-divider" />
                <div className="gnw-eta-stat">
                  <span className="gnw-eta-val">{routeInfo.distanceText}</span>
                  <span className="gnw-eta-lbl">distance</span>
                </div>
                <button type="button" className="gnw-eta-exit" onClick={clearRoute}>Exit</button>
              </div>
            </div>

            {showList && (
              <div className="gnw-steps-sheet" style={{ bottom: 140 }}>
                <div className="gnw-steps-title">All turns</div>
                {steps.map((step, i) => (
                  <div
                    key={i}
                    className={`gnw-step-item ${i === currentStepIndex ? 'active' : ''}`}
                    onClick={() => { setCurrentStepIndex(i); setShowList(false); }}
                  >
                    <div className="gnw-step-num-badge">{i + 1}</div>
                    <div>
                      <p className="gnw-step-inst-text">{step.instruction}</p>
                      <div className="gnw-step-dist-text">{step.distanceText} · {step.durationText}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Arrived card ── */}
        {arrived && (
          <div className="gnw-arrived">
            <div className="gnw-arrived-pin">📍</div>
            <h2 className="gnw-arrived-title">You've arrived</h2>
            <p className="gnw-arrived-sub">You have reached your destination. Drive safely.</p>
            <button type="button" className="gnw-arrived-done" onClick={clearRoute}>Done</button>
          </div>
        )}

        {/* ── Error toast ── */}
        {navError && <div className="gnw-err">{navError}</div>}
      </div>
    </>
  );
}
