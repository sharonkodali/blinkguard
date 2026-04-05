export interface NearbyPlace {
  name: string;
  address: string;
  mapsUrl: string;
  lat?: number;
  lng?: number;
}

export interface NearbyStopsResult {
  places: NearbyPlace[];
  message?: string;
}

export async function fetchNearbyStops(lat: number, lng: number): Promise<NearbyStopsResult> {
  const res = await fetch('/api/places/nearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng }),
  });
  const data = (await res.json()) as NearbyStopsResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Nearby places request failed (${res.status})`);
  }
  return data;
}

/** Browser geolocation wrapped in a promise (call from user gesture or after monitoring starts). */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation not available'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 0,
    });
  });
}

/** User-facing copy for GeolocationPositionError.code (1 / 2 / 3). */
export function geolocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case 1:
      return 'Location permission denied. Check site settings for this origin and try again.';
    case 2:
      return 'Location unavailable. Turn on device location services or try another browser.';
    case 3:
      return 'Location request timed out. Retry or move to a spot with better GPS.';
    default:
      return 'Could not read your location.';
  }
}
