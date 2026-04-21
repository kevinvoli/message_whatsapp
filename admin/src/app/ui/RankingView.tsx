'use client';

import { useEffect, useState, useCallback } from 'react';
import { Trophy, RefreshCw, Medal, MessageSquare, Phone, Bell, ShoppingCart, Zap } from 'lucide-react';
import { CommercialRankingEntry, RankingPeriod, getRanking } from '../lib/api/ranking.api';

const PERIOD_LABELS: Record<RankingPeriod, string> = {
  today: "Aujourd'hui",
  week: '7 derniers jours',
  month: 'Ce mois',
};

const MEDAL_COLORS = ['text-yellow-500', 'text-gray-400', 'text-amber-600'];
const RANK_BG = ['bg-yellow-50 border-yellow-200', 'bg-gray-50 border-gray-200', 'bg-amber-50 border-amber-200'];

function MedalIcon({ rank }: { rank: number }) {
  if (rank > 3) return <span className="text-gray-400 font-bold text-sm w-6 text-center">{rank}</span>;
  return <Medal className={`w-5 h-5 ${MEDAL_COLORS[rank - 1]}`} />;
}

function StatPill({ icon: Icon, value, color }: { icon: React.ElementType; value: number; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {value}
    </span>
  );
}

export default function RankingView() {
  const [entries, setEntries] = useState<CommercialRankingEntry[]>([]);
  const [period, setPeriod] = useState<RankingPeriod>('month');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await getRanking(period));
    } catch {
      setError('Impossible de charger le classement.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-6 h-6 text-yellow-500" />
          <h1 className="text-2xl font-bold text-gray-900">Classement commerciaux</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(Object.keys(PERIOD_LABELS) as RankingPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  period === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      )}

      {loading && entries.length === 0 ? (
        <div className="text-center py-20 text-gray-400">Chargement…</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucune activité sur cette période.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <div
              key={e.commercial_id}
              className={`flex items-center gap-4 p-4 rounded-xl border ${
                e.rank <= 3 ? RANK_BG[e.rank - 1] : 'bg-white border-gray-100'
              }`}
            >
              <div className="flex items-center justify-center w-8">
                <MedalIcon rank={e.rank} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{e.commercial_name}</p>
                <p className="text-xs text-gray-500 truncate">{e.commercial_email}</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                <StatPill icon={MessageSquare} value={e.conversations} color="bg-blue-100 text-blue-700" />
                <StatPill icon={Phone} value={e.calls} color="bg-green-100 text-green-700" />
                <StatPill icon={Bell} value={e.follow_ups} color="bg-orange-100 text-orange-700" />
                <StatPill icon={ShoppingCart} value={e.orders} color="bg-purple-100 text-purple-700" />
              </div>

              <div className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3 py-1.5 rounded-lg min-w-[80px] justify-center">
                <Zap className="w-3.5 h-3.5" />
                <span className="font-bold text-sm">{e.score} pts</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Formule de score</h3>
        <div className="flex flex-wrap gap-3 text-xs text-gray-600">
          <span className="flex items-center gap-1"><ShoppingCart className="w-3 h-3 text-purple-500" /> Commandes × 5</span>
          <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3 text-blue-500" /> Conversations × 3</span>
          <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-green-500" /> Appels × 2</span>
          <span className="flex items-center gap-1"><Bell className="w-3 h-3 text-orange-500" /> Relances × 2</span>
          <span className="text-gray-400">+ Messages envoyés × 0.1</span>
        </div>
      </div>
    </div>
  );
}
