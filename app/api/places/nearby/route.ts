import { NextResponse } from 'next/server';

/** Google Places API (New) — enable "Places API (New)" on the key in Google Cloud Console. */
const PLACES_NEARBY = 'https://places.googleapis.com/v1/places:searchNearby';

/** Prefer server-only GOOGLE_PLACES_API_KEY; other names supported for older setups. */
function googlePlacesKey(): string | undefined {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
  );
}

export async function POST(request: Request) {
  let body: { lat?: number; lng?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const lat = body.lat;
  const lng = body.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng must be numbers' }, { status: 400 });
  }

  const key = googlePlacesKey();
  if (!key) {
    return NextResponse.json({
      places: [],
      message:
        'Set GOOGLE_PLACES_API_KEY in .env.local (see .env.example), then restart the dev server.',
    });
  }

  try {
    const res = await fetch(PLACES_NEARBY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.googleMapsUri,places.location',
      },
      body: JSON.stringify({
        includedTypes: ['gas_station', 'lodging', 'convenience_store', 'cafe'],
        maxResultCount: 8,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 10000,
          },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Places nearby error', res.status, errText);
      return NextResponse.json({
        places: [],
        message: 'Could not load nearby places. Check API billing and Places API enablement.',
      });
    }

    const data = (await res.json()) as {
      places?: Array<{
        displayName?: { text?: string };
        formattedAddress?: string;
        googleMapsUri?: string;
        location?: { latitude?: number; longitude?: number };
      }>;
    };

    const places = (data.places ?? []).map(p => ({
      name: p.displayName?.text ?? 'Place',
      address: p.formattedAddress ?? '',
      mapsUrl: p.googleMapsUri ?? '',
      lat: p.location?.latitude,
      lng: p.location?.longitude,
    }));

    return NextResponse.json({ places });
  } catch (e) {
    console.error('Places route exception', e);
    return NextResponse.json({ places: [], message: 'Nearby search failed.' });
  }
}
