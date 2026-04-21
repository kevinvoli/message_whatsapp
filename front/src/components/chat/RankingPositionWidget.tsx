'use client';

import { useEffect, useState, useCallback } from 'react';
import { Trophy, Medal, RefreshCw, MessageSquare, Phone, Bell, ShoppingCart, Zap } from 'lucide-react';
import { getRanking, CommercialRankingEntry } from '@/lib/targetsApi';
import { useAuth } from '@/contexts/AuthProvider';

type Period = 'today' | 'week' | 'month';

const PERIOD_LABELS: Record<Period, string> = {
  today: "Auj.",
  week: '7j',
  month: 'Mois',
};

const MEDAL_COLORS = ['text-yellow-400', 'text-gray-400', 'text-amber-500'];
const TOP3_BG = ['bg-yellow-50', 'bg-gray-50', 'bg-amber-50'];

export default function RankingPositionWidget() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<CommercialRankingEntry[]>([]);
  const [period, setPeriod] = useState<Period>('month');
  const [loading, setLoading] = useState(false);

  const myEntry = entries.find((e) => e.commercial_id === user?.id);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await getRanking(period));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  const top3 = entries.slice(0, 3);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <span className="font-semibold text-gray-900 text-sm">Classement</span>
          </div>
          <button onClick={() => void load()} disabled={loading} className="p-1 rounded hover:bg-gray-100 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {/* Period tabs */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-1 text-xs font-medium transition-colors ${
                period === p ? 'bg-green-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* My position card */}
      {myEntry ? (
        <div className="p-4 border-b border-gray-100">
          <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Ma position</p>
          <div className={`rounded-xl p-3 ${myEntry.rank <= 3 ? TOP3_BG[myEntry.rank - 1] : 'bg-blue-50'} border border-blue-100`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {myEntry.rank <= 3
                  ? <Medal className={`w-5 h-5 ${MEDAL_COLORS[myEntry.rank - 1]}`} />
                  : <span className="text-xl font-black text-blue-700">#{myEntry.rank}</span>}
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{myEntry.commercial_name}</p>
                  {myEntry.rank <= 3 && (
                    <span className="text-xs text-gray-500">#{myEntry.rank} au classement</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-2.5 py-1 rounded-lg">
                <Zap className="w-3 h-3" />
                <span className="font-bold text-sm">{myEntry.score}</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1">
              <StatCell icon={MessageSquare} value={myEntry.conversations} label="Conv." color="text-blue-600" />
              <StatCell icon={Phone} value={myEntry.calls} label="Appels" color="text-green-600" />
              <StatCell icon={Bell} value={myEntry.follow_ups} label="Relances" color="text-orange-500" />
              <StatCell icon={ShoppingCart} value={myEntry.orders} label="Cmd." color="text-purple-600" />
            </div>
          </div>
        </div>
      ) : !loading && entries.length > 0 ? (
        <div className="p-4 border-b border-gray-100">
          <div className="bg-gray-50 rounded-xl p-3 text-center text-xs text-gray-500">
            Aucune activité sur cette période.
          </div>
        </div>
      ) : null}

      {/* Top 3 */}
      {top3.length > 0 && (
        <div className="p-4">
          <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Top 3</p>
          <div className="space-y-2">
            {top3.map((e) => (
              <div
                key={e.commercial_id}
                className={`flex items-center gap-2 p-2.5 rounded-lg ${
                  e.commercial_id === user?.id ? 'ring-2 ring-green-400' : ''
                } ${TOP3_BG[e.rank - 1]} border border-gray-100`}
              >
                <Medal className={`w-4 h-4 flex-shrink-0 ${MEDAL_COLORS[e.rank - 1]}`} />
                <span className="flex-1 text-sm font-medium text-gray-800 truncate">{e.commercial_name}</span>
                <div className="flex items-center gap-0.5 text-indigo-600">
                  <Zap className="w-3 h-3" />
                  <span className="text-xs font-bold">{e.score}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && entries.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Chargement…</div>
      )}
    </div>
  );
}

function StatCell({ icon: Icon, value, label, color }: { icon: React.ElementType; value: number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center bg-white rounded-lg py-1.5 px-1">
      <Icon className={`w-3 h-3 ${color} mb-0.5`} />
      <span className="text-sm font-bold text-gray-800">{value}</span>
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  );
}
