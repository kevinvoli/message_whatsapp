'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BarChart2, ChevronLeft, ChevronRight, Loader2, AlertTriangle } from 'lucide-react';
import { getAbsenceSummary } from '@/app/lib/api/commercial-groups.api';
import { AbsenceSummaryItem } from '@/app/lib/definitions';

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export default function AbsenceSummaryTable() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows]   = useState<AbsenceSummaryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await getAbsenceSummary(year, month));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { void load(); }, [load]);

  const prevMonth = () => { if (month === 1) { setYear((y) => y - 1); setMonth(12); } else setMonth((m) => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear((y) => y + 1); setMonth(1); } else setMonth((m) => m + 1); };

  const maxDays = rows.reduce((m, r) => Math.max(m, r.totalDays), 1);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-indigo-600" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Tableau de bord absences</p>
            <p className="text-xs text-gray-500">
              {rows.length} commercial{rows.length > 1 ? 'x' : ''} concerné{rows.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <span className="px-3 py-1.5 text-sm font-medium text-gray-800 min-w-[130px] text-center">
            {MONTHS_FR[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
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
      ) : rows.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-400">
          <BarChart2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucune absence enregistrée pour {MONTHS_FR[month - 1]} {year}.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-medium text-gray-400 bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3">Commercial</th>
                <th className="text-left px-4 py-3">Groupe</th>
                <th className="text-left px-4 py-3 w-48">Jours d'absence</th>
                <th className="text-right px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.commercialId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.commercialName}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{row.groupName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-400 rounded-full"
                          style={{ width: `${Math.round((row.totalDays / maxDays) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-orange-700">
                    {row.totalDays} j.
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-xs text-gray-500 font-medium">Total mois</td>
                <td className="px-4 py-2 text-right text-sm font-bold text-gray-800">
                  {rows.reduce((s, r) => s + r.totalDays, 0)} j.
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
