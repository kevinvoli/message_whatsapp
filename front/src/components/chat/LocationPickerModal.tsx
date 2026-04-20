'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, X, Send, AlertCircle, MapPin } from 'lucide-react';

// Custom SVG pin icon — avoids webpack image import issues
const pinIcon = L.divIcon({
  className: '',
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="40" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))"><path fill="#ef4444" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
  iconSize: [32, 40],
  iconAnchor: [16, 40],
});

interface ClickHandlerProps {
  onMapClick: (lat: number, lng: number) => void;
}
function ClickHandler({ onMapClick }: ClickHandlerProps) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface LocationPickerModalProps {
  onClose: () => void;
  onConfirm: (lat: number, lng: number) => void;
}

export default function LocationPickerModal({ onClose, onConfirm }: LocationPickerModalProps) {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setPosition([lat, lng]);
  }, []);

  const handleGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('Géolocalisation non supportée par votre navigateur.');
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setPosition([latitude, longitude]);
        mapRef.current?.flyTo([latitude, longitude], 16, { animate: true, duration: 1 });
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
    if (!position) return;
    onConfirm(position[0], position[1]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-green-600" />
            <span className="font-semibold text-gray-800">Choisir une localisation</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* GPS button */}
        <div className="px-5 pt-4 pb-2 flex-shrink-0 space-y-2">
          <button
            type="button"
            onClick={handleGps}
            disabled={gpsLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 font-medium text-sm hover:bg-green-100 transition-colors disabled:opacity-60"
          >
            {gpsLoading ? (
              <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Navigation className="w-4 h-4" />
            )}
            {gpsLoading ? 'Détection en cours...' : 'Utiliser ma position actuelle'}
          </button>
          {gpsError && (
            <div className="flex items-start gap-2 text-red-600 text-xs bg-red-50 rounded-lg p-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{gpsError}</span>
            </div>
          )}
          <p className="text-xs text-gray-400 text-center">
            ou cliquez sur la carte pour sélectionner un point
          </p>
        </div>

        {/* Map */}
        <div className="mx-5 mb-4 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0" style={{ height: 300 }}>
          <MapContainer
            center={[48.8566, 2.3522]}
            zoom={5}
            style={{ width: '100%', height: '100%' }}
            ref={mapRef}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <ClickHandler onMapClick={handleMapClick} />
            {position && <Marker position={position} icon={pinIcon} />}
          </MapContainer>
        </div>

        {/* Selected coords */}
        {position && (
          <div className="mx-5 mb-3 px-3 py-2 bg-gray-50 rounded-lg flex-shrink-0">
            <p className="text-xs text-gray-500">
              Position sélectionnée :{' '}
              <span className="font-medium text-gray-700">
                {position[0].toFixed(5)}, {position[1].toFixed(5)}
              </span>
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0">
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
            disabled={!position}
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
