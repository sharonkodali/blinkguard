'use client';
import { useEffect, useState } from 'react';
import { fetchNearbyStops, getCurrentPosition } from '@/lib/nearby-stops';
import type { NearbyPlace } from '@/lib/nearby-stops';

interface GoogleMapsEmbedProps {
  compact?: boolean;
}

export default function GoogleMapsEmbed({ compact = false }: GoogleMapsEmbedProps) {
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLocation = async () => {
      try {
        setLoading(true);
        const position = await getCurrentPosition();
        const { latitude: lat, longitude: lng } = position.coords;
        setCoordinates({ lat, lng });

        // Fetch nearby places
        const result = await fetchNearbyStops(lat, lng);
        setPlaces(result.places);
        setError(result.message || null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to get your location. Enable location permissions.',
        );
      } finally {
        setLoading(false);
      }
    };

    fetchLocation();
  }, []);

  if (loading) {
    return (
      <div className="gmap-container">
        <div className="gmap-loading">
          <div className="gmap-spinner" />
          <p>Loading map and nearby stops...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="gmap-container">
        <div className="gmap-error">{error}</div>
      </div>
    );
  }

  if (!coordinates) {
    return (
      <div className="gmap-container">
        <div className="gmap-error">Unable to determine your location</div>
      </div>
    );
  }

  const embedUrl = `https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}&q=${coordinates.lat},${coordinates.lng}&zoom=14`;

  return (
    <>
      <style>{`
        .gmap-container { background: var(--surface); border-radius: var(--radius); padding: 20px; margin: 20px 0; border: 1px solid var(--border); }
        .gmap-header { font-size: 1rem; font-weight: 700; color: var(--text); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .gmap-embed-wrapper { position: relative; width: 100%; padding-bottom: ${compact ? '60%' : '75%'}; height: 0; overflow: hidden; border-radius: 8px; }
        .gmap-embed-wrapper iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; }
        .gmap-places { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-top: 16px; }
        .gmap-place { background: rgba(0, 0, 0, 0.2); padding: 12px; border-radius: 8px; border: 1px solid var(--border); }
        .gmap-place-name { font-size: 0.85rem; font-weight: 600; color: var(--text); margin-bottom: 4px; }
        .gmap-place-addr { font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; }
        .gmap-place-link { display: inline-block; margin-top: 8px; font-size: 0.65rem; color: var(--blue-soft); text-decoration: none; font-weight: 600; }
        .gmap-place-link:hover { text-decoration: underline; }
        .gmap-loading { text-align: center; padding: 40px 20px; color: var(--text-muted); }
        .gmap-spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid var(--surface3); border-top-color: var(--blue-soft); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 10px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .gmap-error { background: rgba(248, 113, 113, 0.1); border: 1px solid var(--red); border-radius: 8px; padding: 16px; color: var(--red); font-size: 0.85rem; }
      `}</style>

      <div className="gmap-container">
        <div className="gmap-header">📍 Nearby Rest Stops & Gas Stations</div>

        {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? (
          <div className="gmap-embed-wrapper">
            <iframe
              src={embedUrl}
              allowFullScreen={true}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        ) : (
          <div className="gmap-error">
            Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local to see map (get key from Google Cloud Console)
          </div>
        )}

        {places.length > 0 && (
          <div className="gmap-places">
            {places.slice(0, 6).map((place, idx) => (
              <a
                key={idx}
                href={place.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="gmap-place"
              >
                <div className="gmap-place-name">{place.name}</div>
                <div className="gmap-place-addr">{place.address}</div>
                <div className="gmap-place-link">→ Open in Maps</div>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
