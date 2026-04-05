'use client';
import { useEffect, useState } from 'react';

export default function GoogleMapView({ showNavigation = true }: { showNavigation?: boolean }) {
  const [location, setLocation] = useState<{ lat: number; lng: number }>({ lat: 40.7128, lng: -74.006 });
  const [destination, setDestination] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setApiKey(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '');
    setReady(true);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          // Keep default if geolocation fails
        }
      );
    }
  }, []);

  if (!ready || !apiKey) {
    return <div className="w-full h-full bg-gray-900" />;
  }

  const handleSetDestination = () => {
    const addr = prompt('Enter destination address:');
    if (addr) setDestination(addr);
  };

  const embedUrl = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${location.lat},${location.lng}&zoom=14`;

  return (
    <div className="relative w-full h-full bg-gray-900">
      {/* Google Maps Embed */}
      <iframe
        width="100%"
        height="100%"
        style={{ border: 0 }}
        loading="lazy"
        src={embedUrl}
        allowFullScreen={true}
      />

      {/* Destination Button */}
      {showNavigation && (
        <div className="absolute bottom-6 left-6 z-20 bg-white rounded-lg shadow-xl overflow-hidden">
          <button
            onClick={handleSetDestination}
            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors"
          >
            🧭 Set Destination
          </button>
          {destination && (
            <div className="px-4 py-2 bg-blue-50 text-gray-800 text-sm border-t border-blue-200">
              📍 To: {destination}
            </div>
          )}
        </div>
      )}

      {/* Location Info */}
      <div className="absolute top-6 right-6 z-20 bg-white rounded-lg shadow-xl px-4 py-2">
        <p className="text-sm font-semibold text-gray-800">
          📍 {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
        </p>
      </div>
    </div>
  );
}
