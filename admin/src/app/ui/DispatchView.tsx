"use client";

import React, { useEffect, useState } from 'react';
import { Clock, ListChecks, RefreshCw, Bot, History } from 'lucide-react';
import { DispatchSettings, DispatchSettingsAudit, DispatchSnapshot } from '@/app/lib/definitions';
import {
  getDispatchSettings,
  getDispatchSettingsAudit,
  getDispatchSnapshot,
  redispatchAllWaiting,
  updateDispatchSettings,
} from '@/app/lib/api';
import { useToast } from '@/app/ui/ToastProvider';
import { formatDate } from '@/app/lib/dateUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'queue' | 'automessages' | 'historique';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'queue',        label: 'File d\'attente',  icon: ListChecks },
  { id: 'automessages', label: 'Messages auto',    icon: Bot        },
  { id: 'historique',   label: 'Historique',       icon: History    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SettingsActions({
  saving,
  hasSettings,
  onSave,
  onReset,
}: {
  saving: boolean;
  hasSettings: boolean;
  onSave: () => void;
  onReset?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          disabled={saving || !hasSettings}
          className="rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
        >
          Reset defaut
        </button>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !hasSettings}
        className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
      >
        {saving ? 'Sauvegarde...' : 'Sauvegarder'}
      </button>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function DispatchView({ onRefresh }: { onRefresh?: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('queue');

  const [snapshot, setSnapshot] = useState<DispatchSnapshot | null>(null);
  const [settings, setSettings] = useState<DispatchSettings | null>(null);
  const [audit, setAudit] = useState<DispatchSettingsAudit[]>([]);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditResetOnly, setAuditResetOnly] = useState(false);
  const [auditQuery, setAuditQuery] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');

  const [loading, setLoading] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);
  const [redispatching, setRedispatching] = useState(false);

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
      const [snapshotData, settingsData, auditData] = await Promise.all([
        getDispatchSnapshot(),
        getDispatchSettings(),
        loadAudit({ offset: 0 }),
      ]);
      setSnapshot(snapshotData);
      setSettings(settingsData);
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
        addToast({ type: 'info', message: 'Aucune conversation à redispatcher.' });
      } else {
        addToast({
          type: 'success',
          message: `${result.dispatched} conversation(s) assignée(s).${result.still_waiting > 0 ? ` ${result.still_waiting} toujours en attente (aucun agent disponible).` : ''}`,
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

  // ── Sauvegarde Messages auto ───────────────────────────────────────────────

  const handleSaveAutoMessages = async () => {
    if (!settings) return;
    try {
      setSavingAuto(true);
      const saved = await updateDispatchSettings({
        auto_message_enabled: settings.auto_message_enabled,
        auto_message_delay_min_seconds: settings.auto_message_delay_min_seconds,
        auto_message_delay_max_seconds: settings.auto_message_delay_max_seconds,
        auto_message_max_steps: settings.auto_message_max_steps,
      });
      setSettings(saved);
      const auditData = await loadAudit({ offset: 0 });
      setAudit(auditData);
      setAuditOffset(0);
      addToast({ type: 'success', message: 'Parametres messages auto sauvegardes.' });
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Erreur sauvegarde messages auto.',
      });
    } finally {
      setSavingAuto(false);
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
            Suivi des conversations, crons et parametres d&apos;envoi automatique.
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

      {/* Compteurs */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <ListChecks className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Queue</p>
              <p className="text-2xl font-semibold text-gray-900">{snapshot?.queue_size ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-700">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">En attente</p>
              <p className="text-2xl font-semibold text-gray-900">{snapshot?.waiting_count ?? 0}</p>
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
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="text-xs text-gray-500">
                {snapshot?.waiting_count
                  ? `${snapshot.waiting_count} conversation(s) en attente d'un agent.`
                  : 'Aucune conversation en attente.'}
              </p>
              <button
                type="button"
                onClick={() => { void handleRedispatchAll(); }}
                disabled={redispatching || !snapshot?.waiting_count}
                className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-200"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${redispatching ? 'animate-spin' : ''}`} />
                {redispatching ? 'Redispatch...' : 'Redispatcher'}
              </button>
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

        {/* ── Onglet : Messages auto ── */}
        {activeTab === 'automessages' && (
          <div className="p-5">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-800">Parametres des messages automatiques</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Activation globale et configuration des delais d&apos;envoi.
                </p>
              </div>
              <SettingsActions
                saving={savingAuto}
                hasSettings={!!settings}
                onSave={handleSaveAutoMessages}
              />
            </div>

            {settings ? (
              <div className="space-y-6">
                {/* Toggle activation */}
                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                  <div>
                    <p className="text-sm font-medium text-gray-800">Activer les messages automatiques</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Lorsque desactive, aucun message auto ne sera envoye, quel que soit le scope.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.auto_message_enabled}
                    onClick={() =>
                      setSettings({ ...settings, auto_message_enabled: !settings.auto_message_enabled })
                    }
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                      settings.auto_message_enabled ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                        settings.auto_message_enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Delais et etapes */}
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Delais et etapes
                  </p>
                  <div className="grid gap-5 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Delai minimum (secondes)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={3600}
                        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                        value={settings.auto_message_delay_min_seconds}
                        onChange={(e) =>
                          setSettings({ ...settings, auto_message_delay_min_seconds: Number(e.target.value) })
                        }
                      />
                      <p className="mt-1 text-[11px] text-gray-400">Min: 1s — Max: 3600s</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Delai maximum (secondes)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={3600}
                        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                        value={settings.auto_message_delay_max_seconds}
                        onChange={(e) =>
                          setSettings({ ...settings, auto_message_delay_max_seconds: Number(e.target.value) })
                        }
                      />
                      <p className="mt-1 text-[11px] text-gray-400">Doit etre superieur au min.</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Nombre d&apos;etapes max
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                        value={settings.auto_message_max_steps}
                        onChange={(e) =>
                          setSettings({ ...settings, auto_message_max_steps: Number(e.target.value) })
                        }
                      />
                      <p className="mt-1 text-[11px] text-gray-400">
                        Au-dela, le chat passe en lecture seule.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Info */}
                {!settings.auto_message_enabled && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    Les messages automatiques sont actuellement <strong>desactives</strong>.
                    Activez-les et sauvegardez pour commencer l&apos;envoi automatique.
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Chargement...</p>
            )}
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
