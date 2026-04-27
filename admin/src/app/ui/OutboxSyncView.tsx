'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  Loader2,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { formatDate } from '@/app/lib/dateUtils';
import {
  getOutboxStats,
  getOutboxFailed,
  retryOutboxEntry,
  OutboxStats,
  OutboxEntry,
} from '@/app/lib/api/outbox.api';

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ${color}`}>
      <div className="flex-shrink-0">{icon}</div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm opacity-80">{label}</p>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function OutboxSyncView() {
  const [stats, setStats]               = useState<OutboxStats | null>(null);
  const [stalePending, setStalePending] = useState(0);
  const [entries, setEntries]           = useState<OutboxEntry[]>([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(false);
  const [retrying, setRetrying]         = useState<Record<string, boolean>>({});
  const [retryResults, setRetryResults] = useState<Record<string, 'ok' | 'error'>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, failedRes] = await Promise.all([
        getOutboxStats(),
        getOutboxFailed(50, 0),
      ]);
      setStats(statsRes.stats);
      setStalePending(statsRes.stalePendingCount);
      setEntries(failedRes.data);
      setTotal(failedRes.total);
    } catch { /* silencieux */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRetry = async (id: string) => {
    setRetrying((prev) => ({ ...prev, [id]: true }));
    setRetryResults((prev) => { const n = { ...prev }; delete n[id]; return n; });
    try {
      const res = await retryOutboxEntry(id);
      setRetryResults((prev) => ({ ...prev, [id]: res.success ? 'ok' : 'error' }));
      if (res.success) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        setTotal((t) => Math.max(0, t - 1));
        if (stats) setStats({ ...stats, failed: Math.max(0, stats.failed - 1), pending: stats.pending + 1 });
      }
    } catch {
      setRetryResults((prev) => ({ ...prev, [id]: 'error' }));
    } finally {
      setRetrying((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const hasIssue = stalePending > 0 || (stats?.failed ?? 0) >= 5;

  return (
    <div className="space-y-6 p-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Synchronisation DB2</h1>
            <p className="text-sm text-gray-400">File d&apos;attente outbox · Rapports GICOP → ERP</p>
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          title="Rafraîchir"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      {/* Alerte globale si problème */}
      {hasIssue && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-red-50 border-red-200 text-red-800 text-sm font-medium">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>
            {stalePending > 0
              ? `${stalePending} entrée(s) bloquée(s) en attente depuis plus de 10 min — vérifier la connexion DB2.`
              : `${stats?.failed ?? 0} rapport(s) en échec de synchronisation.`}
          </span>
        </div>
      )}

      {/* Compteurs statut */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="En attente"
            value={stats.pending}
            color="bg-yellow-50 border-yellow-200 text-yellow-800"
            icon={<Clock className="w-5 h-5 text-yellow-500" />}
          />
          <StatCard
            label="En cours"
            value={stats.processing}
            color="bg-blue-50 border-blue-200 text-blue-800"
            icon={<Loader2 className="w-5 h-5 text-blue-500" />}
          />
          <StatCard
            label="Réussis"
            value={stats.success}
            color="bg-green-50 border-green-200 text-green-800"
            icon={<CheckCircle className="w-5 h-5 text-green-500" />}
          />
          <StatCard
            label="Échecs"
            value={stats.failed}
            color={stats.failed > 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-gray-50 border-gray-200 text-gray-800'}
            icon={<XCircle className={`w-5 h-5 ${stats.failed > 0 ? 'text-red-500' : 'text-gray-400'}`} />}
          />
        </div>
      )}

      {/* Tableau des entrées en échec */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          Entrées en échec ({total})
        </h2>

        {entries.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
            Aucune entrée en échec — synchronisation DB2 opérationnelle.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Chat ID</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-right font-medium">Tentatives</th>
                  <th className="px-4 py-3 text-left font-medium">Erreur</th>
                  <th className="px-4 py-3 text-left font-medium">Créé le</th>
                  <th className="px-4 py-3 text-left font-medium">Prochain essai</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((entry) => {
                  const isRetrying = retrying[entry.id];
                  const result     = retryResults[entry.id];
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 max-w-[140px] truncate" title={entry.entityId}>
                        {entry.entityId}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{entry.eventType}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{entry.attemptCount}</td>
                      <td className="px-4 py-3 text-red-700 text-xs max-w-[220px] truncate" title={entry.lastError ?? ''}>
                        {entry.lastError ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {formatDate(entry.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {entry.nextRetryAt ? formatDate(entry.nextRetryAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {result === 'ok' && (
                          <span className="text-green-600 text-xs font-medium">Repris</span>
                        )}
                        {result === 'error' && (
                          <span className="text-red-500 text-xs font-medium">Erreur</span>
                        )}
                        {!result && (
                          <button
                            onClick={() => void handleRetry(entry.id)}
                            disabled={isRetrying}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-50"
                          >
                            {isRetrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                            Relancer
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
