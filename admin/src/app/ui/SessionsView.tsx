'use client';

import { useEffect, useState } from 'react';
import { SessionStats, getSessionStats } from '../lib/api/sessions.api';
import { formatDate } from '../lib/dateUtils';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, '0')}`;
  return `${m}min`;
}

export default function SessionsView() {
  const [stats, setStats] = useState<SessionStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const load = () => {
    setLoading(true);
    getSessionStats(from, to)
      .then(setStats)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const totalSeconds = stats.reduce((s, r) => s + r.total_seconds, 0);

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Heures de travail (4.9)</h2>

      <div className="flex items-end gap-4">
        <label className="block text-sm font-medium text-gray-700">
          Du
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Au
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <button
          onClick={load}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          Actualiser
        </button>
      </div>

      {stats.length > 0 && (
        <div className="text-sm text-gray-500">
          Total équipe sur la période :{' '}
          <strong>{formatDuration(totalSeconds)}</strong>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Chargement…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Commercial</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Sessions</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Temps total</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Moy. / session</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Dernière connexion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.map((s) => (
                <tr key={s.commercial_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {s.commercial_name ?? s.commercial_id}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{s.total_sessions}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatDuration(s.total_seconds)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {formatDuration(s.avg_session_seconds)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {s.last_connected_at ? formatDate(new Date(s.last_connected_at)) : '-'}
                  </td>
                </tr>
              ))}
              {stats.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Aucune session enregistrée sur cette période.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
