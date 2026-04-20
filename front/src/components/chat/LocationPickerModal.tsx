import React, { useCallback, useEffect, useState } from 'react';
import { MapPin, Navigation, X, Send, AlertCircle } from 'lucide-react';

interface LocationPickerModalProps {
  onClose: () => void;
  onConfirm: (lat: number, lng: number) => void;
}

function buildTileUrl(lat: number, lng: number): string {
  const zoom = 15;
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );
  return `https://a.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${x}/${y}.png`;
}

export default function LocationPickerModal({ onClose, onConfirm }: LocationPickerModalProps) {
  const [lat, setLat] = useState<string>('');
  const [lng, setLng] = useState<string>('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [tileUrl, setTileUrl] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);

  const hasCoords =
    lat.trim() !== '' &&
    lng.trim() !== '' &&
    !isNaN(Number(lat)) &&
    !isNaN(Number(lng));

  useEffect(() => {
    if (hasCoords) {
      setTileUrl(buildTileUrl(Number(lat), Number(lng)));
      setTileError(false);
    } else {
      setTileUrl(null);
    }
  }, [lat, lng, hasCoords]);

  const handleGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('Géolocalisation non supportée par votre navigateur.');
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(
          err.code === 1
            ? 'Accès refusé. Autorisez la géolocalisation dans votre navigateur.'
            : 'Impossible de détecter votre position.',
        );
        setGpsLoading(false);
      },
      { timeout: 10000 },
    );
  }, []);

  const handleConfirm = () => {
    if (!hasCoords) return;
    onConfirm(Number(lat), Number(lng));
    onClose();
  };

  const mapsUrl = hasCoords
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-green-600" />
            <span className="font-semibold text-gray-800">Partager une localisation</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* GPS button */}
        <div className="px-5 py-4 space-y-4">
          <button
            type="button"
            onClick={handleGps}
            disabled={gpsLoading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 font-medium hover:bg-green-100 transition-colors disabled:opacity-60"
          >
            {gpsLoading ? (
              <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Navigation className="w-4 h-4" />
            )}
            {gpsLoading ? 'Détection en cours...' : 'Utiliser ma position actuelle'}
          </button>

          {gpsError && (
            <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{gpsError}</span>
            </div>
          )}

          {/* Manual input */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Latitude</label>
              <input
                type="number"
                step="any"
                placeholder="48.8534"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Longitude</label>
              <input
                type="number"
                step="any"
                placeholder="2.3488"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          </div>

          {/* Map preview */}
          {hasCoords && (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <div className="relative h-36 bg-gray-100">
                {tileUrl && !tileError ? (
                  <img
                    src={tileUrl}
                    alt="Aperçu carte"
                    className="w-full h-full object-cover"
                    onError={() => setTileError(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <MapPin className="w-8 h-8 text-gray-400" />
                  </div>
                )}
                {/* Pin overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-white rounded-full p-1.5 shadow-lg">
                    <MapPin className="w-5 h-5 text-red-500" />
                  </div>
                </div>
              </div>
              <div className="px-3 py-2 bg-gray-50 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
                </p>
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 underline"
                  >
                    Voir sur Google Maps
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!hasCoords}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}
