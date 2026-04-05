/**
 * GET /api/pullover?lat=X&lng=Y
 *
 * Returns up to 3 nearby safe pullover locations for the driver.
 * Flow:
 *   1. Try the Fetch.ai SafetyOrchestratorAgent /pullover endpoint first.
 *   2. Fall back to a direct Google Places Nearby Search call from this
 *      server (key stays private) if the agent is unreachable.
 *   3. If no API key is configured either, return plausible mock spots
 *      so the UI always has something useful to show during demos.
 */
import { NextResponse } from 'next/server';
import type { PulloverSpot, PulloverResponse } from '@/lib/safety-types';

export const runtime = 'nodejs';

const AGENT_BASE =
  (process.env.SAFETY_AGENT_URL ?? 'http://127.0.0.1:8100/telemetry')
    .replace(/\/telemetry$/, '');

const MAPS_KEY = process.env.GOOGLE_ROUTES_API_KEY ?? '';
const SEARCH_RADIUS = 5000;

// ── Geometry ──────────────────────────────────────────────────────────────────

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Places API fallback (runs server-side, key never exposed to client) ───────

async function fetchFromPlaces(lat: number, lng: number): Promise<PulloverSpot[]> {
  if (!MAPS_KEY) return mockSpots(lat, lng);

  const types = ['gas_station', 'parking', 'rest_stop'];
  const seen = new Set<string>();
  const all: PulloverSpot[] = [];

  await Promise.allSettled(
    types.map(async (type) => {
      const url =
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
        `?location=${lat},${lng}&radius=${SEARCH_RADIUS}&type=${type}&key=${MAPS_KEY}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as { results: any[] };
      for (const p of (data.results ?? []).slice(0, 4)) {
        if (seen.has(p.place_id)) continue;
        seen.add(p.place_id);
        const { lat: pLat, lng: pLng } = p.geometry.location;
        all.push({
          name: p.name as string,
          address: (p.vicinity ?? '') as string,
          type,
          distanceMeters: Math.round(haversine(lat, lng, pLat, pLng)),
          lat: pLat as number,
          lng: pLng as number,
        });
      }
    }),
  );

  const sorted = all.sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 3);
  return sorted.length > 0 ? sorted : mockSpots(lat, lng);
}

// ── Mock data (always works, useful when no key / demo offline) ───────────────

function mockSpots(lat: number, lng: number): PulloverSpot[] {
  return [
    { name: 'Highway Rest Area',  address: '0.8 mi ahead', type: 'rest_stop',   distanceMeters: 1300, lat: lat + 0.006, lng: lng + 0.003 },
    { name: 'Shell Gas Station',  address: 'Exit 42',       type: 'gas_station', distanceMeters: 2100, lat: lat + 0.010, lng: lng - 0.002 },
    { name: 'Park & Rest Lot',    address: 'Side pulloff',  type: 'parking',     distanceMeters: 3400, lat: lat - 0.012, lng: lng + 0.008 },
  ];
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');
  const alertLevel = searchParams.get('level') ?? 'warning';

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng query params are required' }, { status: 400 });
  }

  // 1. Try the Fetch.ai uAgent
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${AGENT_BASE}/pullover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, alertLevel }),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as PulloverResponse;
      return NextResponse.json({ ...data, source: 'uagents' } satisfies PulloverResponse);
    }
  } catch { /* fall through to Places API */ }

  // 2. Direct Google Places fallback
  const spots = await fetchFromPlaces(lat, lng);
  return NextResponse.json({ spots, source: 'fallback' } satisfies PulloverResponse);
}
