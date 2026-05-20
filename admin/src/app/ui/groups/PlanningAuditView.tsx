'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Loader2, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { getPlanningAudit } from '@/app/lib/api/commercial-groups.api';
import { PlanningAuditEntry } from '@/app/lib/definitions';

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const TIME_SLOT_LABELS: Record<string, string> = {
  full:      'Journée entière',
  morning:   'Matin',
  afternoon: 'Après-midi',
};

export default function PlanningAuditView() {
  const now = new Date();
  const [from, setFrom]   = useState(toDateString(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo]       = useState(toDateString(now));
  const [entries, setEntries] = useState<PlanningAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await getPlanningAudit({ from, to }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-indigo-600" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Historique des modifications</p>
            <p className="text-xs text-gray-500">{entries.length} entrée{entries.length > 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <label className="text-xs text-gray-500">Du</label>
            <input
              type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs text-gray-500">Au</label>
            <input
              type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Chargement…
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-400">
          <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucune modification enregistrée sur cette période.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-medium text-gray-400 bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-left px-4 py-3">Commercial</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Date planifiée</th>
                <th className="text-left px-4 py-3">Raison</th>
                <th className="text-left px-4 py-3">Déclaré par</th>
                <th className="text-left px-4 py-3">Horodatage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {e.action === 'created' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <Plus className="w-3 h-3" /> Créé
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        <Trash2 className="w-3 h-3" /> Supprimé
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 text-xs">{e.commercialId.slice(-8)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      e.type === 'absence' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {e.type === 'absence' ? 'Absence' : 'Exceptionnel'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{e.date}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[120px]">{e.reason ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.declaredBy ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {new Date(e.performedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
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
