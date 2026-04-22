"use client";

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock, ListChecks, RefreshCw, History } from 'lucide-react';
import { DispatchSettingsAudit, DispatchSnapshot } from '@/app/lib/definitions';
import {
  getDispatchSettingsAudit,
  getDispatchSnapshot,
  redispatchAllWaiting,
  resetStuckConversations,
} from '@/app/lib/api/dispatch.api';
import { useToast } from '@/app/ui/ToastProvider';
import { formatDate } from '@/app/lib/dateUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'queue' | 'historique';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'queue',      label: 'File d\'attente', icon: ListChecks },
  { id: 'historique', label: 'Historique',      icon: History    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────


// ─── Composant principal ──────────────────────────────────────────────────────

export default function DispatchView({ onRefresh }: { onRefresh?: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('queue');

  const [snapshot, setSnapshot] = useState<DispatchSnapshot | null>(null);
  const [audit, setAudit] = useState<DispatchSettingsAudit[]>([]);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditResetOnly, setAuditResetOnly] = useState(false);
  const [auditQuery, setAuditQuery] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');

  const [loading, setLoading] = useState(false);
  const [redispatching, setRedispatching] = useState(false);
  const [resettingStuck, setResettingStuck] = useState(false);

  const { addToast } = useToast();

  // ── Chargement ─────────────────────────────────────────────────────────────

  const loadAudit = async (params?: {
    resetOnly?: boolean;
    q?: string;
    from?: string;
    to?: string;
    offset?: number;
  }) => {
    const data = await getDispatchSettingsAudit({
      limit: 50,
      offset: params?.offset ?? 0,
      resetOnly: params?.resetOnly ?? auditResetOnly,
      q: params?.q ?? auditQuery,
      from: params?.from ?? auditFrom,
      to: params?.to ?? auditTo,
    });
    return data;
  };

  const refresh = async () => {
    try {
      setLoading(true);
      const [snapshotData, auditData] = await Promise.all([
        getDispatchSnapshot(),
        loadAudit({ offset: 0 }),
      ]);
      setSnapshot(snapshotData);
      setAudit(auditData);
      setAuditOffset(0);
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Erreur chargement dispatch.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Redispatch manuel ──────────────────────────────────────────────────────

  const handleRedispatchAll = async () => {
    try {
      setRedispatching(true);
      const result = await redispatchAllWaiting();
      if (result.dispatched === 0) {
        addToast({ type: 'info', message: 'Aucun orphelin à dispatcher (conversations sans poste).' });
      } else {
        addToast({
          type: 'success',
          message: `${result.dispatched} orphelin(s) assigné(s).${result.still_waiting > 0 ? ` ${result.still_waiting} sans agent disponible.` : ''}`,
        });
      }
      await refresh();
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Erreur redispatch.',
      });
    } finally {
      setRedispatching(false);
    }
  };

  // ── Reset conversations bloquées ──────────────────────────────────────────

  const handleResetStuck = async () => {
    try {
      setResettingStuck(true);
      const result = await resetStuckConversations();
      if (result.reset === 0) {
        addToast({ type: 'info', message: 'Aucune conversation bloquée trouvée.' });
      } else {
        addToast({
          type: 'success',
          message: `${result.reset} conversation(s) remises en EN_ATTENTE sur leur poste d'origine. Elles se réactiveront à la reconnexion de l'agent.`,
        });
      }
      await refresh();
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Erreur reset conversations bloquées.',
      });
    } finally {
      setResettingStuck(false);
    }
  };

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* En-tête */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Dispatch & Queue</h2>
          <p className="text-sm text-gray-500">
            Suivi des conversations et gestion de la file d&apos;attente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void refresh(); onRefresh?.(); }}
          disabled={loading}
          title="Rafraichir"
          aria-label="Rafraichir"
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Bannière règle poste permanent */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-start gap-2">
        <ListChecks className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <span>
          <strong>Règle poste permanent active</strong> — une conversation reste sur son poste pour toujours.
          Les EN_ATTENTE &quot;sur poste&quot; sont normaux (agent hors-ligne) et se réactivent à la reconnexion.
          Seuls les <strong>orphelins</strong> (sans poste) nécessitent une action.
        </span>
      </div>

      {/* Compteurs */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <ListChecks className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Queue</p>
              <p className="text-2xl font-semibold text-gray-900">{snapshot?.queue_size ?? 0}</p>
              <p className="text-[10px] text-gray-400">agents connectés</p>
            </div>
          </div>
        </div>
        <div className={`rounded-xl border p-4 shadow-sm ${(snapshot?.orphan_count ?? 0) > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${(snapshot?.orphan_count ?? 0) > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Orphelins</p>
              <p className={`text-2xl font-semibold ${(snapshot?.orphan_count ?? 0) > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{snapshot?.orphan_count ?? 0}</p>
              <p className="text-[10px] text-gray-400">sans poste — à dispatcher</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Att. agent</p>
              <p className="text-2xl font-semibold text-gray-700">{snapshot?.waiting_on_poste_count ?? 0}</p>
              <p className="text-[10px] text-gray-400">agent hors-ligne (normal)</p>
            </div>
          </div>
        </div>
        <div className={`rounded-xl border p-4 shadow-sm ${(snapshot?.stuck_active_count ?? 0) > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${(snapshot?.stuck_active_count ?? 0) > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Actifs bloqués</p>
              <p className={`text-2xl font-semibold ${(snapshot?.stuck_active_count ?? 0) > 0 ? 'text-red-700' : 'text-gray-900'}`}>{snapshot?.stuck_active_count ?? 0}</p>
              <p className="text-[10px] text-gray-400">ACTIF sans agent connecté</p>
            </div>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">

        {/* Barre d'onglets */}
        <div className="flex overflow-x-auto border-b border-gray-200">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 whitespace-nowrap px-5 py-3 text-sm font-medium transition-colors focus:outline-none ${
                  active
                    ? 'border-b-2 border-slate-900 text-slate-900'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Onglet : File d'attente ── */}
        {activeTab === 'queue' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
              <div className="text-xs text-gray-500 space-y-0.5">
                {(snapshot?.orphan_count ?? 0) > 0
                  ? <p className="text-amber-700 font-medium">{snapshot!.orphan_count} orphelin(s) sans poste — action requise.</p>
                  : <p>Aucun orphelin à dispatcher.</p>
                }
                {(snapshot?.waiting_on_poste_count ?? 0) > 0 && (
                  <p className="text-gray-400">{snapshot!.waiting_on_poste_count} conversation(s) en attente de reconnexion de leur agent (normal).</p>
                )}
                {(snapshot?.stuck_active_count ?? 0) > 0 && (
                  <p className="font-semibold text-red-600">{snapshot!.stuck_active_count} actives bloquées — agent offline sans mise à jour.</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { void handleRedispatchAll(); }}
                  disabled={redispatching || resettingStuck || (snapshot?.orphan_count ?? 0) === 0}
                  title="Assigne uniquement les conversations sans poste (orphelins)"
                  className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-200"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${redispatching ? 'animate-spin' : ''}`} />
                  {redispatching ? 'Dispatch...' : `Assigner orphelins${(snapshot?.orphan_count ?? 0) > 0 ? ` (${snapshot!.orphan_count})` : ''}`}
                </button>
                <button
                  type="button"
                  onClick={() => { void handleResetStuck(); }}
                  disabled={resettingStuck || redispatching || (snapshot?.stuck_active_count ?? 0) === 0}
                  title="Remet en EN_ATTENTE sur le même poste (le poste est conservé)"
                  className="flex items-center gap-1.5 rounded-md bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
                >
                  <AlertTriangle className={`h-3.5 w-3.5 ${resettingStuck ? 'animate-pulse' : ''}`} />
                  {resettingStuck ? 'En cours...' : `Libérer bloquées${(snapshot?.stuck_active_count ?? 0) > 0 ? ` (${snapshot!.stuck_active_count})` : ''}`}
                </button>
              </div>
            </div>
          <div className="max-h-[480px] overflow-y-auto">
            {snapshot?.waiting_items?.length ? (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Chat</th>
                    <th className="px-4 py-2">Poste</th>
                    <th className="px-4 py-2">Deadline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {snapshot.waiting_items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-900">{item.chat_id}</td>
                      <td className="px-4 py-2 text-gray-600">
                        {item.poste?.name ?? item.poste_id ?? '-'}
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {formatDate(item.first_response_deadline_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-10 text-center text-sm text-gray-500">
                Aucune conversation en attente.
              </p>
            )}
          </div>
          </div>
        )}

        {/* ── Onglet : Historique ── */}
        {activeTab === 'historique' && (
          <div>
            {/* Filtres */}
            <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3 text-xs">
              <label className="flex items-center gap-2 text-gray-600">
                <input
                  type="checkbox"
                  checked={auditResetOnly}
                  onChange={async (e) => {
                    const next = e.target.checked;
                    setAuditResetOnly(next);
                    const data = await loadAudit({ resetOnly: next, offset: 0 });
                    setAudit(data);
                    setAuditOffset(0);
                  }}
                />
                Resets uniquement
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Recherche..."
                  className="rounded-md border border-gray-200 px-2 py-1 text-xs"
                  value={auditQuery}
                  onChange={(e) => setAuditQuery(e.target.value)}
                />
                <input
                  type="date"
                  className="rounded-md border border-gray-200 px-2 py-1 text-xs"
                  value={auditFrom}
                  onChange={(e) => setAuditFrom(e.target.value)}
                />
                <span className="text-gray-400">→</span>
                <input
                  type="date"
                  className="rounded-md border border-gray-200 px-2 py-1 text-xs"
                  value={auditTo}
                  onChange={(e) => setAuditTo(e.target.value)}
                />
                <button
                  type="button"
                  onClick={async () => {
                    const data = await loadAudit({ offset: 0 });
                    setAudit(data);
                    setAuditOffset(0);
                  }}
                  className="rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-100"
                >
                  Filtrer
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const data = await loadAudit({ offset: 0 });
                    setAudit(data);
                    setAuditOffset(0);
                  }}
                  title="Rafraichir"
                  aria-label="Rafraichir historique"
                  className="rounded-full border border-gray-200 p-1 text-gray-600 hover:bg-gray-100"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="max-h-[420px] overflow-y-auto">
              {audit.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-2 w-40">Date</th>
                      <th className="px-4 py-2">Modifications</th>
                      <th className="px-4 py-2 w-52">Valeurs apres</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {audit.map((entry) => {
                      let parsed: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null = null;
                      try { parsed = JSON.parse(entry.payload); } catch { parsed = null; }
                      return (
                        <tr key={entry.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 align-top text-xs text-gray-500 whitespace-nowrap">
                            {formatDate(entry.createdAt)}
                          </td>
                          <td className="px-4 py-2 align-top">
                            {parsed?.before && parsed?.after ? (
                              <div className="space-y-1">
                                {Object.keys(parsed.before).map((key) => (
                                  <div key={key} className="flex flex-wrap items-center gap-1.5">
                                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">
                                      {key}
                                    </span>
                                    <span className="text-[11px] text-gray-400 line-through">
                                      {String((parsed!.before as Record<string, unknown>)[key])}
                                    </span>
                                    <span className="text-[11px] text-gray-400">→</span>
                                    <span className="text-[11px] font-medium text-gray-800">
                                      {String((parsed!.after as Record<string, unknown>)[key])}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[11px] text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 align-top">
                            {parsed?.after ? (
                              <div className="space-y-1">
                                {Object.entries(parsed.after).map(([key, value]) => (
                                  <div key={key} className="flex justify-between gap-2">
                                    <span className="text-[11px] text-gray-500">{key}</span>
                                    <span className="text-[11px] font-semibold text-gray-800">
                                      {String(value)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[11px] text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="px-4 py-10 text-center text-sm text-gray-500">
                  Aucun historique disponible.
                </p>
              )}
            </div>

            {/* Pagination */}
            <div className="flex justify-end border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={async () => {
                  const nextOffset = auditOffset + 50;
                  const data = await loadAudit({ offset: nextOffset });
                  setAudit((prev) => [...prev, ...data]);
                  setAuditOffset(nextOffset);
                }}
                className="rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-100"
              >
                Charger plus
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
