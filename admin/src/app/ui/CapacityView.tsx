'use client';

import { useEffect, useState } from 'react';
import {
  CapacitySummaryEntry,
  CapacityConfig,
  getCapacitySummary,
  getCapacityConfig,
  setCapacityConfig,
} from '../lib/api/capacity.api';

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-14 text-right">
        {value}/{max}
      </span>
    </div>
  );
}

export default function CapacityView() {
  const [summary, setSummary] = useState<CapacitySummaryEntry[]>([]);
  const [config, setConfig] = useState<CapacityConfig>({ quotaActive: 10, quotaTotal: 50 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([getCapacitySummary(), getCapacityConfig()])
      .then(([s, c]) => {
        setSummary(s);
        setConfig(c);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await setCapacityConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-gray-500">Chargement…</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Capacité conversationnelle (4.15)</h2>
        <p className="text-sm text-gray-500 mt-1">
          Gestion des quotas de conversations actives et verrouillées par poste.
        </p>
      </div>

      {/* Config quotas */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="font-medium text-gray-800">Configuration des quotas</h3>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium text-gray-700">
            Conversations actives max (par poste)
            <input
              type="number"
              min={1}
              max={200}
              value={config.quotaActive}
              onChange={(e) =>
                setConfig((c) => ({ ...c, quotaActive: parseInt(e.target.value) || 10 }))
              }
              className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Conversations totales max (par poste)
            <input
              type="number"
              min={1}
              max={500}
              value={config.quotaTotal}
              onChange={(e) =>
                setConfig((c) => ({ ...c, quotaTotal: parseInt(e.target.value) || 50 }))
              }
              className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Sauvegarde…' : 'Enregistrer'}
          </button>
          {saved && <span className="text-sm text-green-600">Sauvegardé</span>}
        </div>
      </div>

      {/* Résumé par poste */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-medium">Comment fonctionne la capacité</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700">
          <li>
            Au-delà du quota actif ({config.quotaActive}), les nouvelles conversations sont
            verrouillées (données masquées pour le commercial).
          </li>
          <li>
            Lorsqu&apos;un commercial qualifie une conversation, la plus ancienne conversation
            verrouillée est automatiquement déverrouillée.
          </li>
          <li>Vous pouvez forcer le déverrouillage depuis l&apos;interface admin.</li>
        </ul>
      </div>

      {summary.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
          Aucune conversation active pour le moment.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Poste</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Actives</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Verrouillées</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.map((entry) => (
                <tr key={entry.posteId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{entry.posteName}</td>
                  <td className="px-4 py-3 w-48">
                    <ProgressBar
                      value={entry.activeCount}
                      max={entry.quotaActive}
                      color={
                        entry.activeCount >= entry.quotaActive
                          ? 'bg-red-500'
                          : entry.activeCount >= entry.quotaActive * 0.8
                            ? 'bg-orange-400'
                            : 'bg-green-500'
                      }
                    />
                  </td>
                  <td className="px-4 py-3 w-48">
                    <ProgressBar
                      value={entry.lockedCount}
                      max={Math.max(entry.quotaTotal - entry.quotaActive, 1)}
                      color="bg-gray-400"
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">
                    {entry.totalCount}/{entry.quotaTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
