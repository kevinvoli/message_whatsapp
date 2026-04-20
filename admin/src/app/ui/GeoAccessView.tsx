'use client';

import { useEffect, useState } from 'react';
import {
  AllowedLocation,
  CreateLocationPayload,
  getLocations,
  createLocation,
  updateLocation,
  deleteLocation,
} from '../lib/api/geo-access.api';

const EMPTY_FORM: CreateLocationPayload = {
  label: '',
  latitude: 0,
  longitude: 0,
  radius_km: 200,
};

export default function GeoAccessView() {
  const [locations, setLocations] = useState<AllowedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AllowedLocation | null>(null);
  const [form, setForm] = useState<CreateLocationPayload>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getLocations()
      .then(setLocations)
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowModal(true);
  };

  const openEdit = (loc: AllowedLocation) => {
    setEditing(loc);
    setForm({
      label: loc.label,
      latitude: loc.latitude,
      longitude: loc.longitude,
      radius_km: loc.radius_km,
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) {
      setError('Le libellé est obligatoire.');
      return;
    }
    if (form.latitude < -90 || form.latitude > 90) {
      setError('Latitude invalide (entre -90 et 90).');
      return;
    }
    if (form.longitude < -180 || form.longitude > 180) {
      setError('Longitude invalide (entre -180 et 180).');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const updated = await updateLocation(editing.id, form);
        setLocations((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      } else {
        const created = await createLocation(form);
        setLocations((prev) => [...prev, created]);
      }
      setShowModal(false);
    } catch (e: any) {
      setError(e.message ?? 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette zone autorisée ?')) return;
    await deleteLocation(id);
    setLocations((prev) => prev.filter((l) => l.id !== id));
  };

  if (loading) return <div className="p-6 text-gray-500">Chargement…</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Restriction géographique (4.10)</h2>
          <p className="text-sm text-gray-500 mt-1">
            Définissez les zones depuis lesquelles les commerciaux peuvent se connecter.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          + Ajouter une zone
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-medium">Comment ça fonctionne</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700">
          <li>Si aucune zone n&apos;est définie, tous les commerciaux peuvent se connecter depuis n&apos;importe où.</li>
          <li>Dès qu&apos;une zone est ajoutée, la position GPS du commercial est vérifiée à chaque connexion.</li>
          <li>Le commercial doit se trouver dans le rayon d&apos;au moins une des zones pour se connecter.</li>
          <li>Le rayon par défaut est 200 km. Vous pouvez l&apos;ajuster par zone.</li>
        </ul>
      </div>

      {locations.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
          Aucune restriction active — tous les commerciaux peuvent se connecter depuis n&apos;importe quelle position.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Libellé</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Latitude</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Longitude</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Rayon (km)</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {locations.map((loc) => (
                <tr key={loc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{loc.label}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-600">
                    {Number(loc.latitude).toFixed(5)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-600">
                    {Number(loc.longitude).toFixed(5)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">{loc.radius_km} km</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => openEdit(loc)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(loc.id)}
                      className="text-red-500 hover:underline text-xs"
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold">
              {editing ? 'Modifier la zone' : 'Nouvelle zone autorisée'}
            </h3>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Libellé
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="Ex : Siège Abidjan"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-gray-700">
                  Latitude
                  <input
                    type="number"
                    step="0.00001"
                    min={-90}
                    max={90}
                    value={form.latitude}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, latitude: parseFloat(e.target.value) || 0 }))
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Longitude
                  <input
                    type="number"
                    step="0.00001"
                    min={-180}
                    max={180}
                    value={form.longitude}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, longitude: parseFloat(e.target.value) || 0 }))
                    }
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </label>
              </div>

              <label className="block text-sm font-medium text-gray-700">
                Rayon autorisé (km)
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={form.radius_km}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, radius_km: parseInt(e.target.value) || 200 }))
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </label>

              <p className="text-xs text-gray-400">
                Astuce : trouvez les coordonnées sur{' '}
                <span className="font-medium text-gray-500">maps.google.com</span> en faisant
                un clic droit sur la carte.
              </p>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Sauvegarde…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
