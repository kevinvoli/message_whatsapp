'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart2, Medal, ShoppingCart, Target, RefreshCw, TrendingUp, Trophy,
} from 'lucide-react';
import { getRanking, getMyProgress, CommercialRankingEntry, TargetProgress } from '@/lib/targetsApi';
import { useAuth } from '@/contexts/AuthProvider';
import { useChatStore } from '@/store/chatStore';

const METRIC_LABELS: Record<string, string> = {
  conversations:     'Conversations',
  calls:             'Appels',
  follow_ups:        'Relances',
  orders:            'Commandes',
  reports_submitted: 'Rapports soumis',
};

const MEDAL_COLORS = ['text-yellow-400', 'text-gray-400', 'text-amber-500'];

function colorForPct(pct: number) {
  if (pct >= 100) return 'bg-green-500';
  if (pct >= 70) return 'bg-blue-500';
  if (pct >= 40) return 'bg-yellow-400';
  return 'bg-red-400';
}

export default function DashboardPanel() {
  const { user } = useAuth();
  const targetProgress    = useChatStore((s) => s.targetProgress);
  const setTargetProgress = useChatStore((s) => s.setTargetProgress);

  const [monthRanking, setMonthRanking] = useState<CommercialRankingEntry[]>([]);
  const [todayRanking, setTodayRanking] = useState<CommercialRankingEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [month, today, progress] = await Promise.all([
        getRanking('month'),
        getRanking('today'),
        targetProgress === null ? getMyProgress() : Promise.resolve(null as TargetProgress[] | null),
      ]);
      setMonthRanking(month);
      setTodayRanking(today);
      if (progress !== null) setTargetProgress(progress);
    } catch {
      setError('Impossible de charger le tableau de bord.');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const myMonthEntry = monthRanking.find((e) => e.commercial_id === user?.id);
  const topMonth     = monthRanking[0] ?? null;
  const topTodayOrders = todayRanking.length > 0
    ? [...todayRanking].sort((a, b) => b.orders - a.orders)[0]
    : null;

  const progress: TargetProgress[] = targetProgress ?? [];
  const monthlyProgress = progress.filter((p) => p.target.period_type === 'monthly');

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-gray-800">Tableau de bord</span>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
          title="Rafraîchir"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Chargement…
        </div>
      )}

      {!loading && error && (
        <div className="p-4 text-center text-red-400 text-sm">{error}</div>
      )}

      {!loading && !error && (
        <div className="space-y-3 p-3">

          {/* ── Barre fixe : rang mensuel ─────────────────────────────────── */}
          <div
            className={`rounded-xl p-3 ${
              myMonthEntry && myMonthEntry.rank <= 3
                ? 'bg-yellow-50 border border-yellow-200'
                : 'bg-blue-50 border border-blue-100'
            }`}
          >
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-1.5">
              Mon rang mensuel
            </p>
            {myMonthEntry ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {myMonthEntry.rank <= 3 ? (
                    <Medal className={`w-6 h-6 ${MEDAL_COLORS[myMonthEntry.rank - 1]}`} />
                  ) : (
                    <span className="text-2xl font-black text-blue-700">#{myMonthEntry.rank}</span>
                  )}
                  <div>
                    <p className="text-sm font-bold text-gray-900">#{myMonthEntry.rank}</p>
                    <p className="text-[10px] text-gray-500">Score : {myMonthEntry.score} pts</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label="Cmd." value={myMonthEntry.orders} color="text-purple-600" />
                  <MiniStat label="Conv." value={myMonthEntry.conversations} color="text-blue-600" />
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">Aucune activité ce mois.</p>
            )}
          </div>

          {/* ── Top performers ────────────────────────────────────────────── */}
          {(topMonth || topTodayOrders) && (
            <div className="space-y-2">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">
                Top performers
              </p>

              {topMonth && (
                <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                  <Trophy className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">
                      {topMonth.commercial_name}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {topMonth.score} pts · {topMonth.orders} cmd.
                    </p>
                  </div>
                  <span className="text-[10px] text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                    #1 mois
                  </span>
                </div>
              )}

              {topTodayOrders && topTodayOrders.orders > 0 && (
                <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                  <ShoppingCart className="w-4 h-4 text-purple-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">
                      {topTodayOrders.commercial_name}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {topTodayOrders.orders} commande{topTodayOrders.orders > 1 ? 's' : ''} aujourd'hui
                    </p>
                  </div>
                  <span className="text-[10px] text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                    #1 cmd/j
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Objectifs personnels ─────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Target className="w-3.5 h-3.5 text-gray-500" />
              <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">
                Mes objectifs
              </p>
            </div>
            {progress.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">
                Aucun objectif défini pour cette période.
              </p>
            ) : (
              <div className="space-y-2.5">
                {progress.map((p) => (
                  <div key={p.target.id} className="bg-gray-50 rounded-lg p-2.5">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-medium text-gray-700">
                        {METRIC_LABELS[p.target.metric] ?? p.target.metric}
                      </span>
                      <span
                        className={`text-xs font-bold ${
                          p.progress_pct >= 100 ? 'text-green-600' : 'text-gray-600'
                        }`}
                      >
                        {p.current_value}/{p.target.target_value}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${colorForPct(p.progress_pct)}`}
                        style={{ width: `${Math.min(p.progress_pct, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[10px] text-gray-400">{p.period_label}</span>
                      <span
                        className={`text-[10px] font-semibold ${
                          p.progress_pct >= 100 ? 'text-green-600' : 'text-gray-500'
                        }`}
                      >
                        {p.progress_pct}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Progression mensuelle agrégée ────────────────────────────── */}
          {monthlyProgress.length > 0 && (
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-white" />
                <span className="text-xs font-semibold text-white">Progression mensuelle</span>
              </div>
              <div className="space-y-1.5">
                {monthlyProgress.map((p) => (
                  <div key={p.target.id} className="flex items-center gap-2">
                    <span className="text-[10px] text-blue-200 w-20 truncate flex-shrink-0">
                      {METRIC_LABELS[p.target.metric] ?? p.target.metric}
                    </span>
                    <div className="flex-1 h-1.5 bg-blue-800 bg-opacity-50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full transition-all"
                        style={{ width: `${Math.min(p.progress_pct, 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-white font-bold w-7 text-right flex-shrink-0">
                      {p.progress_pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label, value, color,
}: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className={`text-sm font-bold ${color}`}>{value}</span>
      <span className="text-[10px] text-gray-400">{label}</span>
    </div>
  );
}
