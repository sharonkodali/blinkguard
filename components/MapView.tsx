'use client';
import { useEffect, useRef, useState } from 'react';
import type { DrowsinessState } from '@/lib/drowsiness';

interface Props {
  drowsinessState: DrowsinessState;
}

export default function MapView({ drowsinessState }: Props) {
  const mapRef     = useRef<any>(null);
  const mapDivRef  = useRef<HTMLDivElement>(null);
  const markerRef  = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // Dynamic import — Leaflet is browser-only
    let L: any;
    let map: any;

    const init = async () => {
      try {
        L = (await import('leaflet')).default;
        // CSS already loaded in layout.tsx
        // Fix Leaflet default icon missing in Next.js
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });

        if (!mapDivRef.current) {
          setError('Map container not found');
          return;
        }

        if (mapRef.current) return; // Already initialized

        // Create map — dark theme tiles for night driving look
        map = L.map(mapDivRef.current, { zoomControl: false }).setView([32.7157, -117.1611], 15);
        mapRef.current = map;

        // Dark OpenStreetMap tiles (free, no key)
        L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          { attribution: '© OpenStreetMap © CartoDB', maxZoom: 19 }
        ).addTo(map);

        // Custom blue "you are here" marker
        const youIcon = L.divIcon({
          className: '',
          html: `<div style="
            width:20px; height:20px; background:#3b82f6;
            border:3px solid white; border-radius:50%;
            box-shadow: 0 0 10px rgba(59,130,246,0.8);">
          </div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        // Watch GPS position
        if ('geolocation' in navigator) {
          navigator.geolocation.watchPosition(
            (pos) => {
              const { latitude: lat, longitude: lng } = pos.coords;

              // Move or place marker
              if (markerRef.current) {
                markerRef.current.setLatLng([lat, lng]);
              } else {
                markerRef.current = L.marker([lat, lng], { icon: youIcon })
                  .addTo(map)
                  .bindPopup('📍 You are here');
              }
              // Pan map to follow user
              map.panTo([lat, lng]);
            },
            (err) => console.warn('GPS error:', err),
            { enableHighAccuracy: true, maximumAge: 2000 }
          );
        }

        // Add zoom controls (bottom right, away from camera widget)
        L.control.zoom({ position: 'bottomleft' }).addTo(map);
        
        setMapReady(true);
      } catch (err) {
        console.error('Map init error:', err);
        setError(String(err));
      }
    };

    init();

    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
          mapRef.current = null;
        } catch (e) {
          console.error('Error removing map:', e);
        }
      }
    };
  }, []);

  // ─── Ring map border red when drowsy ────────────────────────────────────────
  const border =
    drowsinessState === 'danger'  ? 'ring-4 ring-red-500 ring-inset'    :
    drowsinessState === 'warning' ? 'ring-4 ring-yellow-400 ring-inset'  : '';

  return (
    <div
      ref={mapDivRef}
      className={`w-full h-full ${border} transition-all duration-300`}
      style={{ minHeight: '100vh' }}
    >
      {error && (
        <div className="absolute top-20 left-0 right-0 z-50 bg-red-900 text-white p-4 text-center">
          Map Error: {error}
        </div>
      )}
      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-40">
          <p className="text-white">Loading map...</p>
        </div>
      )}
    </div>
  );
}