"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, ClipboardList, Database, Loader2, RefreshCw, RotateCcw, Trash2, Play, Wrench, XCircle } from 'lucide-react';
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

interface SyncDiagnostics {
  callStatusDistribution: Array<{ status: string; count: number }>;
  deviceStats: { withDeviceId: number; withoutDeviceId: number; withPoste: number };
  activeBatchPosteIds: string[];
  obligationServiceWired: boolean;
  featureFlagEnabled: boolean;
  dbAvailable: boolean;
  eligibleForRetry: number;
}

interface FailedReport {
  chatId: string;
  clientName: string | null;
  submissionError: string | null;
  updatedAt: string;
}

// ─── Labels ────────────────────────────────────────────────────────────────────

const BLOCKER_LABELS: Record<string, string> = {
  RAPPORT_INCOMPLET: 'Rapport de conversation incomplet',
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

  const [syncAction, setSyncAction]       = useState<Record<string, 'idle' | 'running' | 'ok' | 'error'>>({});
  const [syncActionMsg, setSyncActionMsg] = useState<Record<string, string>>({});
  const [diagnostics, setDiagnostics]    = useState<SyncDiagnostics | null>(null);
  const [diagLoading, setDiagLoading]    = useState(false);

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

  const loadDiagnostics = async () => {
    setDiagLoading(true);
    try {
      const d = await fetchJson<SyncDiagnostics>(`${API_URL}/admin/order-sync/diagnostics`);
      setDiagnostics(d);
    } catch { /* silencieux */ }
    finally { setDiagLoading(false); }
  };

  const runSyncAction = async (key: string, path: string, method = 'POST') => {
    setSyncAction((p) => ({ ...p, [key]: 'running' }));
    setSyncActionMsg((p) => ({ ...p, [key]: '' }));
    try {
      const res = await fetch(`${API_URL}${path}`, { method, credentials: 'include' });
      const data = res.ok ? await res.json().catch(() => null) as Record<string, unknown> | null : null;
      const msg  = data ? Object.entries(data).map(([k, v]) => `${k}: ${String(v)}`).join(' · ') : '';
      setSyncAction((p) => ({ ...p, [key]: res.ok ? 'ok' : 'error' }));
      setSyncActionMsg((p) => ({ ...p, [key]: msg || (res.ok ? 'OK' : `Erreur ${res.status}`) }));
      if (res.ok) { void load(); void loadDiagnostics(); }
    } catch {
      setSyncAction((p) => ({ ...p, [key]: 'error' }));
      setSyncActionMsg((p) => ({ ...p, [key]: 'Erreur réseau' }));
    }
  };

  const handleRetry = async (chatId: string) => {
    setRetrying((prev) => ({ ...prev, [chatId]: true }));
    setRetryResults((prev) => { const n = { ...prev }; delete n[chatId]; return n; });
    try {
      const res = await fetch(`${API_URL}/gicop-report/admin/${chatId}/retry`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = res.ok
        ? await res.json().catch(() => null) as { status?: string } | null
        : null;
      const ok = res.ok && data?.status === 'sent';
      setRetryResults((prev) => ({ ...prev, [chatId]: ok ? 'ok' : 'error' }));
      if (ok) {
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

      {/* ── Bandeau DB2 — affiché en permanence, rouge si non connectée ── */}
      {syncStatus !== null && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium
          ${syncStatus.db2.dbAvailable
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50  border-red-300  text-red-800'
          }`}>
          <Database className={`w-4 h-4 flex-shrink-0 ${syncStatus.db2.dbAvailable ? 'text-green-600' : 'text-red-600'}`} />
          <span>
            DB2 (base commandes) :&nbsp;
            <strong>{syncStatus.db2.dbAvailable ? 'Connectée' : 'Non disponible'}</strong>
          </span>
          {syncStatus.db2.dbAvailable && syncStatus.db2.lastSyncAt && (
            <span className="ml-auto text-xs text-green-600">
              Dernière sync : {formatDate(syncStatus.db2.lastSyncAt)}
            </span>
          )}
          {!syncStatus.db2.dbAvailable && (
            <span className="ml-auto text-xs text-red-600">
              Les rapports ne peuvent pas être copiés. Vérifier ORDER_DB_HOST / ORDER_DB_USER / ORDER_DB_PASSWORD dans .env
            </span>
          )}
        </div>
      )}
      {syncStatus === null && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-orange-50 border-orange-200 text-orange-800 text-sm font-medium">
          <AlertTriangle className="w-4 h-4 text-orange-600 flex-shrink-0" />
          <span>Statut DB2 non disponible — impossible de joindre le backend</span>
        </div>
      )}

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

          {/* Diagnostics */}
          {syncStatus && (
            <div className="mt-5 border-t border-gray-100 pt-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Diagnostics</p>
                <button
                  onClick={() => void loadDiagnostics()}
                  disabled={diagLoading}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  {diagLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Charger
                </button>
              </div>

              {diagnostics && (
                <div className="space-y-2 text-xs">
                  {/* call_status distribution */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="font-semibold text-gray-600 mb-2">Distribution call_status</p>
                    {diagnostics.callStatusDistribution.length === 0
                      ? <p className="text-gray-400">Aucun appel dans call_event</p>
                      : diagnostics.callStatusDistribution.map(({ status, count }) => (
                          <div key={status} className="flex justify-between py-0.5">
                            <span className={`font-mono ${status === 'outgoing' ? 'text-green-700' : status.toUpperCase() === 'OUTGOING' ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                              {status}
                            </span>
                            <span className="font-semibold text-gray-700">{count}</span>
                          </div>
                        ))
                    }
                    {diagnostics.callStatusDistribution.some(({ status }) => status !== status.toLowerCase()) && (
                      <p className="mt-2 text-red-600 font-semibold">⚠ Des valeurs en majuscules sont présentes — cliquer sur "Normaliser call_status" ci-dessous</p>
                    )}
                  </div>

                  {/* Device stats */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="font-semibold text-gray-600 mb-2">Appels dans call_event</p>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Avec device_id</span>
                        <span className="font-semibold text-gray-700">{diagnostics.deviceStats.withDeviceId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Sans device_id</span>
                        <span className={diagnostics.deviceStats.withoutDeviceId > 0 ? 'text-orange-600 font-semibold' : 'text-gray-700 font-semibold'}>
                          {diagnostics.deviceStats.withoutDeviceId}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Device → poste associé</span>
                        <span className={diagnostics.deviceStats.withPoste > 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>
                          {diagnostics.deviceStats.withPoste}
                        </span>
                      </div>
                      {diagnostics.deviceStats.withPoste === 0 && (
                        <p className="text-red-600 font-semibold mt-1">⚠ Aucun device n&apos;est associé à un poste — associer dans la gestion des devices</p>
                      )}
                    </div>
                  </div>

                  {/* Batches + service + feature flag */}
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Feature flag obligations</span>
                      <span className={diagnostics.featureFlagEnabled ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>
                        {diagnostics.featureFlagEnabled ? 'Activé' : 'DÉSACTIVÉ'}
                      </span>
                    </div>
                    {!diagnostics.featureFlagEnabled && (
                      <p className="text-red-600 font-semibold">⚠ FF_CALL_OBLIGATIONS_ENABLED doit être &quot;true&quot; dans system_config</p>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">Service obligations câblé</span>
                      <span className={diagnostics.obligationServiceWired ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>
                        {diagnostics.obligationServiceWired ? 'Oui' : 'Non'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Batches actifs (postes)</span>
                      <span className={diagnostics.activeBatchPosteIds.length > 0 ? 'text-green-700 font-semibold' : 'text-orange-600 font-semibold'}>
                        {diagnostics.activeBatchPosteIds.length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Éligibles au retry</span>
                      <span className={diagnostics.eligibleForRetry > 0 ? 'text-blue-600 font-semibold' : 'text-gray-500 font-semibold'}>
                        {diagnostics.eligibleForRetry}
                      </span>
                    </div>
                    {diagnostics.activeBatchPosteIds.length === 0 && (
                      <p className="text-orange-600 font-semibold">⚠ Aucun batch actif — cliquer sur &quot;Initialiser les batches&quot;</p>
                    )}
                    {diagnostics.eligibleForRetry === 0 && diagnostics.callStatusDistribution.some(d => d.status !== d.status.toLowerCase()) && (
                      <p className="text-red-600 font-semibold">⚠ Normaliser call_status d&apos;abord (étape 1)</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions de maintenance */}
          {syncStatus && (
            <div className="mt-5 border-t border-gray-100 pt-5 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Actions maintenance</p>

              {([
                { key: 'normalize', label: 'Normaliser call_status',    icon: <Wrench className="w-3.5 h-3.5" />, path: '/admin/order-sync/normalize-call-status', desc: 'Convertit OUTGOING → outgoing dans call_event (étape 1)' },
                { key: 'purge',     label: 'Purger pending en doublon',  icon: <Trash2 className="w-3.5 h-3.5" />, path: '/admin/order-sync/purge-stuck-pending',   desc: 'Supprime les entrées pending dupliquées dans le journal sync (étape 2)' },
                { key: 'batches',   label: 'Initialiser les batches',    icon: <Play   className="w-3.5 h-3.5" />, path: '/admin/order-sync/init-batches',           desc: 'Crée les batches pour les postes sans batch actif (étape 3)' },
                { key: 'retry',     label: 'Retry obligations',          icon: <RotateCcw className="w-3.5 h-3.5" />, path: '/admin/order-sync/retry-obligations',   desc: 'Relance le matching pour les appels outgoing éligibles (étape 4)' },
              ] as const).map(({ key, label, icon, path, desc }) => (
                <div key={key} className="flex items-start gap-3">
                  <button
                    onClick={() => void runSyncAction(key, path)}
                    disabled={syncAction[key] === 'running'}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    {syncAction[key] === 'running'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : icon
                    }
                    {label}
                  </button>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs text-gray-400">{desc}</span>
                    {syncAction[key] === 'ok' && (
                      <span className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                        <CheckCircle className="w-3 h-3 flex-shrink-0" /> {syncActionMsg[key]}
                      </span>
                    )}
                    {syncAction[key] === 'error' && (
                      <span className="text-xs text-red-600 mt-0.5">{syncActionMsg[key]}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
