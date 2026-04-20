'use client';

import { useEffect, useState } from 'react';
import { getMyProgress, TargetProgress } from '@/lib/targetsApi';

const METRIC_LABELS: Record<string, string> = {
  conversations: 'Conversations',
  calls: 'Appels',
  follow_ups: 'Relances',
  orders: 'Commandes',
  relances: 'Relances (alt)',
};

function colorForPct(pct: number) {
  if (pct >= 100) return 'bg-green-500';
  if (pct >= 70) return 'bg-blue-500';
  if (pct >= 40) return 'bg-yellow-400';
  return 'bg-red-400';
}

export default function ObjectifsPanel() {
  const [progress, setProgress] = useState<TargetProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getMyProgress()
      .then(setProgress)
      .catch(() => setError('Impossible de charger les objectifs.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Chargement…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400 text-sm p-4 text-center">
        {error}
      </div>
    );
  }

  if (progress.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-4 text-center">
        Aucun objectif défini pour cette période.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">Mes objectifs</h3>
      {progress.map((p) => (
        <div key={p.target.id} className="bg-gray-50 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-800">
              {METRIC_LABELS[p.target.metric] ?? p.target.metric}
            </span>
            <span
              className={`text-xs font-bold ${
                p.progress_pct >= 100 ? 'text-green-600' : 'text-gray-600'
              }`}
            >
              {p.current_value}/{p.target.target_value} ({p.progress_pct}%)
            </span>
          </div>
          <div className="text-xs text-gray-400">{p.period_label}</div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${colorForPct(p.progress_pct)}`}
              style={{ width: `${Math.min(p.progress_pct, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
