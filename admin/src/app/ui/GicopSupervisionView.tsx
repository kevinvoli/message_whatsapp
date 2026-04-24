"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, ClipboardList, Database, Loader2, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import { formatDate } from '@/app/lib/dateUtils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ClosureStats {
  blockedCount: number;
  blockerSummary: Record<string, number>;
  recentAttempts: Array<{
    chatId: string;
    commercialId: string | null;
    blockers: Array<{ code: string; label: string; severity: string }> | null;
    createdAt: string;
  }>;
}

interface BusinessMetrics {
  period:               string;
  closuresBlocked24h:   number;
  reportsSubmitted24h:  number;
  reportsFailed:        number;
  remindersExecuted24h: number;
  syncLog:              Record<string, number>;
  db2Available:         boolean;
}

interface SyncStatus {
  db2: { dbAvailable: boolean; lastSyncAt: string | null; processedCount: number };
  syncLog: Record<string, number>;
}

interface FailedReport {
  chatId: string;
  clientName: string | null;
  submissionError: string | null;
  updatedAt: string;
}

// ─── Labels ────────────────────────────────────────────────────────────────────

const BLOCKER_LABELS: Record<string, string> = {
  RAPPORT_INCOMPLET:            'Rapport GICOP incomplet',
  RESULTAT_MANQUANT:            'Résultat de conversation manquant',
  PROCHAINE_ACTION_MANQUANTE:   'Prochaine action manquante',
  RELANCE_REQUISE:              'Relance non planifiée',
  DOSSIER_INCOMPLET:            'Dossier client incomplet',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function GicopSupervisionView() {
  const [closureStats, setClosureStats] = useState<ClosureStats | null>(null);
  const [failedReports, setFailedReports] = useState<FailedReport[]>([]);
  const [syncStatus, setSyncStatus]       = useState<SyncStatus | null>(null);
  const [metrics, setMetrics]             = useState<BusinessMetrics | null>(null);
  const [loading, setLoading]             = useState(false);
  const [retrying, setRetrying]           = useState<Record<string, boolean>>({});
  const [retryResults, setRetryResults]   = useState<Record<string, 'ok' | 'error'>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stats, failed, sync, biz] = await Promise.all([
        fetchJson<ClosureStats>(`${API_URL}/conversations/admin/closure-stats`),
        fetchJson<FailedReport[]>(`${API_URL}/gicop-report/admin/failed-submissions`),
        fetchJson<SyncStatus>(`${API_URL}/admin/order-sync/status`).catch(() => null),
        fetchJson<BusinessMetrics>(`${API_URL}/admin/business-metrics`).catch(() => null),
      ]);
      setClosureStats(stats);
      setFailedReports(failed);
      if (sync) setSyncStatus(sync);
      if (biz)  setMetrics(biz);
    } catch { /* silencieux */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRetry = async (chatId: string) => {
    setRetrying((prev) => ({ ...prev, [chatId]: true }));
    setRetryResults((prev) => { const n = { ...prev }; delete n[chatId]; return n; });
    try {
      const res = await fetch(`${API_URL}/gicop-report/admin/${chatId}/retry`, {
        method: 'POST',
        credentials: 'include',
      });
      setRetryResults((prev) => ({ ...prev, [chatId]: res.ok ? 'ok' : 'error' }));
      if (res.ok) {
        setFailedReports((prev) => prev.filter((r) => r.chatId !== chatId));
      }
    } catch {
      setRetryResults((prev) => ({ ...prev, [chatId]: 'error' }));
    } finally {
      setRetrying((prev) => { const n = { ...prev }; delete n[chatId]; return n; });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Supervision GICOP</h1>
            <p className="text-sm text-gray-400">Fermetures bloquées · Rapports en échec</p>
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          title="Rafraîchir"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Section 1 — Fermetures bloquées */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <XCircle className="w-4 h-4 text-red-500" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Fermetures bloquées</h2>
            <p className="text-xs text-gray-400">
              {closureStats ? `${closureStats.blockedCount} tentative(s) bloquée(s) récentes` : 'Chargement…'}
            </p>
          </div>
        </div>
        <div className="p-6">
          {!closureStats && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          )}
          {closureStats && Object.keys(closureStats.blockerSummary).length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">Aucune tentative bloquée récente.</p>
          )}
          {closureStats && Object.keys(closureStats.blockerSummary).length > 0 && (
            <div className="space-y-2 mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Causes principales</p>
              {Object.entries(closureStats.blockerSummary)
                .sort(([, a], [, b]) => b - a)
                .map(([code, count]) => (
                  <div key={code} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-700">{BLOCKER_LABELS[code] ?? code}</span>
                    <span className="text-sm font-semibold text-red-600">{count}</span>
                  </div>
                ))
              }
            </div>
          )}
          {closureStats && closureStats.recentAttempts.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tentatives récentes</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase">Conversation</th>
                      <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Blocages</th>
                      <th className="text-right py-2 pl-2 text-xs font-semibold text-gray-500 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {closureStats.recentAttempts.slice(0, 20).map((attempt, idx) => (
                      <tr key={`${attempt.chatId}-${idx}`} className="hover:bg-gray-50">
                        <td className="py-2.5 pr-4 font-mono text-xs text-gray-600 truncate max-w-[140px]">{attempt.chatId}</td>
                        <td className="py-2.5 px-2">
                          <div className="flex flex-wrap gap-1">
                            {(attempt.blockers ?? []).map((b) => (
                              <span key={b.code} className="text-xs px-1.5 py-0.5 bg-red-50 text-red-700 rounded">
                                {BLOCKER_LABELS[b.code] ?? b.code}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 pl-2 text-right text-xs text-gray-400 whitespace-nowrap">{formatDate(attempt.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Section 2 — Rapports en échec */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <AlertTriangle className="w-4 h-4 text-orange-500" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Rapports en échec de soumission</h2>
            <p className="text-xs text-gray-400">
              {failedReports.length === 0 ? 'Aucun échec' : `${failedReports.length} rapport(s) à relancer`}
            </p>
          </div>
        </div>
        <div className="p-6">
          {!closureStats && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          )}
          {closureStats && failedReports.length === 0 && (
            <div className="flex items-center gap-2 justify-center py-6 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm">Tous les rapports ont été soumis avec succès.</span>
            </div>
          )}
          {failedReports.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase">Client</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Erreur</th>
                    <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Date échec</th>
                    <th className="text-right py-2 pl-2 text-xs font-semibold text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {failedReports.map((r) => (
                    <tr key={r.chatId} className="hover:bg-gray-50">
                      <td className="py-2.5 pr-4">
                        <p className="font-medium text-gray-900">{r.clientName ?? '—'}</p>
                        <p className="text-xs font-mono text-gray-400 truncate max-w-[120px]">{r.chatId}</p>
                      </td>
                      <td className="py-2.5 px-2 text-xs text-red-600 max-w-[200px] truncate" title={r.submissionError ?? ''}>
                        {r.submissionError ?? '—'}
                      </td>
                      <td className="py-2.5 px-2 text-right text-xs text-gray-400 whitespace-nowrap">{formatDate(r.updatedAt)}</td>
                      <td className="py-2.5 pl-2 text-right">
                        {retryResults[r.chatId] === 'ok' && (
                          <span className="flex items-center justify-end gap-1 text-xs text-green-600">
                            <CheckCircle className="w-3.5 h-3.5" /> Soumis
                          </span>
                        )}
                        {retryResults[r.chatId] === 'error' && (
                          <span className="text-xs text-red-600">Échec</span>
                        )}
                        {!retryResults[r.chatId] && (
                          <button
                            onClick={() => void handleRetry(r.chatId)}
                            disabled={retrying[r.chatId]}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            {retrying[r.chatId]
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <RotateCcw className="w-3 h-3" />
                            }
                            Relancer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Section 3 — Métriques flux métier */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <ClipboardList className="w-4 h-4 text-blue-500" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Flux métier — dernières 24h</h2>
            <p className="text-xs text-gray-400">Fermetures · Rapports · Relances · Sync</p>
          </div>
        </div>
        <div className="p-6">
          {!metrics && (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          )}
          {metrics && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Fermetures bloquées (24h)',  value: metrics.closuresBlocked24h,   color: metrics.closuresBlocked24h  > 0 ? 'text-red-600'    : 'text-green-600' },
                { label: 'Rapports soumis (24h)',      value: metrics.reportsSubmitted24h,   color: 'text-blue-600' },
                { label: 'Rapports en échec',          value: metrics.reportsFailed,          color: metrics.reportsFailed       > 0 ? 'text-red-600'    : 'text-green-600' },
                { label: 'Rappels relances (24h)',     value: metrics.remindersExecuted24h,  color: 'text-purple-600' },
                { label: 'Sync DB2 — succès',          value: metrics.syncLog['success'] ?? 0, color: 'text-green-600' },
                { label: 'Sync DB2 — échecs',          value: metrics.syncLog['failed']  ?? 0, color: (metrics.syncLog['failed'] ?? 0) > 0 ? 'text-red-600' : 'text-green-600' },
              ].map((item) => (
                <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                  <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section 4 — Synchronisation DB2 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <Database className="w-4 h-4 text-indigo-500" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Synchronisation DB2 (base commandes)</h2>
            <p className="text-xs text-gray-400">Lecture call_logs + écriture table miroir</p>
          </div>
        </div>
        <div className="p-6">
          {!syncStatus && (
            <p className="text-sm text-gray-400 text-center py-4">Statut non disponible</p>
          )}
          {syncStatus && (
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-gray-50">
                <span className="text-sm text-gray-700">Connexion DB2</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${syncStatus.db2.dbAvailable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {syncStatus.db2.dbAvailable ? 'Connectée' : 'Non disponible'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-50">
                <span className="text-sm text-gray-700">Appels traités</span>
                <span className="text-sm font-semibold text-gray-900">{syncStatus.db2.processedCount.toLocaleString('fr-FR')}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-50">
                <span className="text-sm text-gray-700">Dernière sync appels</span>
                <span className="text-sm text-gray-500">{syncStatus.db2.lastSyncAt ? formatDate(syncStatus.db2.lastSyncAt) : '—'}</span>
              </div>
              {Object.entries(syncStatus.syncLog).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-700">Journal sync — {status}</span>
                  <span className={`text-sm font-semibold ${status === 'failed' ? 'text-red-600' : status === 'pending' ? 'text-orange-600' : 'text-green-600'}`}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
