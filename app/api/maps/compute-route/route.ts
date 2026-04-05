import { NextResponse } from 'next/server';

/** Routes API v2 — enable "Routes API" in Google Cloud (not the legacy browser DirectionsService). */
const COMPUTE_ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/**
 * Server-side Routes API calls must use a key that is NOT restricted to HTTP referrers only
 * (Next.js API routes have no browser referrer). Prefer GOOGLE_ROUTES_API_KEY or GOOGLE_MAPS_API_KEY.
 */
function routesApiKey(): string | undefined {
  return (
    process.env.GOOGLE_ROUTES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
  );
}

function routesBlockedHint(): string {
  return (
    'Routes API is blocked or denied. Fix: (1) Enable "Routes API" for your Google Cloud project. ' +
    '(2) On the API key, under API restrictions, include "Routes API". ' +
    '(3) If the key uses "HTTP referrers" (website) restriction, create a second key for the server with ' +
    'Application restrictions = None (dev) or IP addresses (production), set GOOGLE_ROUTES_API_KEY in .env.local, ' +
    'and keep NEXT_PUBLIC_GOOGLE_MAPS_API_KEY for the map in the browser only.'
  );
}

function parseGoogleError(raw: string): { message: string; code?: number } {
  try {
    const j = JSON.parse(raw) as { error?: { message?: string; code?: number; status?: string } };
    const msg = j.error?.message ?? raw.slice(0, 500);
    return { message: msg, code: j.error?.code };
  } catch {
    return { message: raw.slice(0, 500) };
  }
}

function parseDurationSeconds(duration: unknown): number {
  if (duration == null) return 0;
  if (typeof duration === 'string') {
    const m = duration.match(/^(\d+)s$/);
    if (m) return parseInt(m[1], 10);
    const n = parseInt(duration, 10);
    return Number.isNaN(n) ? 0 : n;
  }
  if (typeof duration === 'object' && duration !== null && 'seconds' in duration) {
    const s = (duration as { seconds: string }).seconds;
    return parseInt(s, 10) || 0;
  }
  return 0;
}

function formatEta(seconds: number): string {
  if (seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  return `${m} min`;
}

function formatDistance(meters: number): string {
  if (meters <= 0) return '—';
  const mi = meters / 1609.34;
  if (mi >= 10) return `${mi.toFixed(0)} mi`;
  if (mi >= 1) return `${mi.toFixed(1)} mi`;
  return `${Math.round(meters * 3.28084)} ft`;
}

export async function POST(request: Request) {
  let body: { origin?: { lat: number; lng: number }; destination?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { origin, destination } = body;
  if (
    !origin ||
    typeof origin.lat !== 'number' ||
    typeof origin.lng !== 'number' ||
    Number.isNaN(origin.lat) ||
    Number.isNaN(origin.lng)
  ) {
    return NextResponse.json({ error: 'origin.lat and origin.lng are required' }, { status: 400 });
  }
  const dest = typeof destination === 'string' ? destination.trim() : '';
  if (!dest) {
    return NextResponse.json({ error: 'destination is required' }, { status: 400 });
  }

  const key = routesApiKey();
  if (!key) {
    return NextResponse.json(
      {
        error: 'No Google API key for Routes. Set GOOGLE_ROUTES_API_KEY (recommended) or GOOGLE_MAPS_API_KEY in .env.local.',
        hint: routesBlockedHint(),
      },
      { status: 500 },
    );
  }

  const fieldMask =
    'routes.duration,routes.distanceMeters,routes.polyline,routes.legs.steps';

  const baseBody = {
    origin: {
      location: {
        latLng: { latitude: origin.lat, longitude: origin.lng },
      },
    },
    destination: { address: dest },
    travelMode: 'DRIVE',
    regionCode: 'US',
    languageCode: 'en-US',
  };

  try {
    let res = await fetch(COMPUTE_ROUTES, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify({
        ...baseBody,
        routingPreference: 'TRAFFIC_AWARE',
      }),
    });

    let raw = await res.text();

    if (!res.ok) {
      console.warn('Routes API TRAFFIC_AWARE failed, retrying without traffic preference', res.status, raw.slice(0, 300));
      res = await fetch(COMPUTE_ROUTES, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(baseBody),
      });
      raw = await res.text();
    }
    let data: unknown;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: 'Invalid response from Routes API', detail: raw.slice(0, 200) },
        { status: 502 },
      );
    }

    if (!res.ok) {
      const parsed = parseGoogleError(raw);
      const blocked =
        res.status === 403 ||
        res.status === 400 ||
        /blocked|PERMISSION_DENIED|API key not valid|denied/i.test(parsed.message);
      console.error('Routes API error', res.status, parsed.message);
      return NextResponse.json(
        {
          error: parsed.message || 'Routes API request failed',
          ...(blocked ? { hint: routesBlockedHint() } : {}),
        },
        { status: 502 },
      );
    }

    const routes = (data as { routes?: unknown[] }).routes;
    const route = routes?.[0] as
      | {
          duration?: unknown;
          distanceMeters?: number;
          polyline?: { encodedPolyline?: string };
          legs?: Array<{
            steps?: Array<{ navigationInstruction?: { instructions?: string } }>;
          }>;
        }
      | undefined;

    const poly = route?.polyline as { encodedPolyline?: string } | undefined;
    const encoded = poly?.encodedPolyline;
    if (!encoded) {
      return NextResponse.json({ error: 'No route returned for this origin and destination.' }, { status: 404 });
    }

    const durationSeconds = parseDurationSeconds(route?.duration);
    const distanceMeters = typeof route?.distanceMeters === 'number' ? route.distanceMeters : 0;
    const firstStep = route?.legs?.[0]?.steps?.[0];
    const firstInstruction =
      firstStep?.navigationInstruction?.instructions?.replace(/<[^>]+>/g, '') ?? '';

    const originLabel = `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`;
    const destinationLabel = dest;

    return NextResponse.json({
      encodedPolyline: encoded,
      durationSeconds,
      durationText: formatEta(durationSeconds),
      distanceMeters,
      distanceText: formatDistance(distanceMeters),
      firstInstruction,
      originLabel,
      destinationLabel,
    });
  } catch (e) {
    console.error('compute-route exception', e);
    return NextResponse.json({ error: 'Failed to compute route' }, { status: 500 });
  }
}
