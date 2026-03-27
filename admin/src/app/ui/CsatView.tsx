'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Star, RefreshCw, Users } from 'lucide-react';
import { getCsatStats } from '@/app/lib/api';
import { CsatStats } from '@/app/lib/definitions';

const SCORE_LABELS: Record<number, string> = {
  1: '⭐ Insuffisant',
  2: '⭐⭐ Médiocre',
  3: '⭐⭐⭐ Bien',
  4: '⭐⭐⭐⭐ Très bien',
  5: '⭐⭐⭐⭐⭐ Excellent',
};

function ScoreBar({ score, count, total }: { score: number; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const colors: Record<number, string> = {
    1: 'bg-red-500',
    2: 'bg-orange-400',
    3: 'bg-yellow-400',
    4: 'bg-lime-500',
    5: 'bg-green-500',
  };
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-36 text-gray-600 text-xs">{SCORE_LABELS[score]}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full ${colors[score] ?? 'bg-gray-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 text-right text-gray-600 text-xs">{count} ({pct}%)</span>
    </div>
  );
}

function AverageStars({ average }: { average: number }) {
  const full = Math.floor(average);
  const hasHalf = average - full >= 0.5;
  return (
    <span className="text-yellow-500 text-lg">
      {'★'.repeat(full)}
      {hasHalf ? '½' : ''}
      {'☆'.repeat(5 - full - (hasHalf ? 1 : 0))}
    </span>
  );
}

export default function CsatView() {
  const [stats, setStats] = useState<CsatStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCsatStats();
      setStats(data);
    } catch {
      setError('Impossible de charger les statistiques CSAT.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500" />
          Satisfaction client (CSAT)
        </h2>
        <button
          onClick={() => void load()}
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 text-sm">{error}</div>
      )}

      {loading && !stats && (
        <div className="flex justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      )}

      {stats && (
        <>
          {/* Global stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Réponses totales</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalResponses}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Score moyen</p>
              {stats.averageScore !== null ? (
                <div className="mt-1">
                  <p className="text-3xl font-bold text-gray-900">{stats.averageScore.toFixed(1)}<span className="text-base text-gray-400">/5</span></p>
                  <AverageStars average={stats.averageScore} />
                </div>
              ) : (
                <p className="text-gray-400 mt-1">—</p>
              )}
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Agents évalués</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.byCommercial.length}</p>
            </div>
          </div>

          {/* Distribution */}
          <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Distribution des scores</h3>
            {stats.totalResponses === 0 ? (
              <p className="text-sm text-gray-400">Aucune réponse enregistrée.</p>
            ) : (
              [5, 4, 3, 2, 1].map((s) => (
                <ScoreBar
                  key={s}
                  score={s}
                  count={stats.distribution[s] ?? 0}
                  total={stats.totalResponses}
                />
              ))
            )}
          </div>

          {/* Par agent */}
          {stats.byCommercial.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-700">Score par agent</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-5 py-3">Agent (Poste ID)</th>
                    <th className="px-5 py-3 text-center">Réponses</th>
                    <th className="px-5 py-3 text-center">Score moyen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.byCommercial
                    .sort((a, b) => b.average - a.average)
                    .map((row) => (
                      <tr key={row.commercial_id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-mono text-xs text-gray-700">{row.commercial_id}</td>
                        <td className="px-5 py-3 text-center text-gray-600">{row.count}</td>
                        <td className="px-5 py-3 text-center">
                          <span className="font-semibold text-gray-800">{row.average.toFixed(1)}</span>
                          <AverageStars average={row.average} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
