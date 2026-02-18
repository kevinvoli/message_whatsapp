"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Clock, ListChecks, RefreshCw } from 'lucide-react';
import { DispatchSettings, DispatchSettingsAudit, DispatchSnapshot } from '@/app/lib/definitions';
import { getDispatchSettings, getDispatchSettingsAudit, getDispatchSnapshot, resetDispatchSettings, updateDispatchSettings } from '@/app/lib/api';
import { useToast } from '@/app/ui/ToastProvider';
import { formatDate } from '@/app/lib/dateUtils';

const ageSeconds = (value?: string | null) => {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
};

export default function DispatchView({ onRefresh }: { onRefresh?: () => void }) {
  const [snapshot, setSnapshot] = useState<DispatchSnapshot | null>(null);
  const [settings, setSettings] = useState<DispatchSettings | null>(null);
  const [audit, setAudit] = useState<DispatchSettingsAudit[]>([]);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditResetOnly, setAuditResetOnly] = useState(false);
  const [auditQuery, setAuditQuery] = useState('');
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const refresh = async () => {
    try {
      setLoading(true);
      const [snapshotData, settingsData] = await Promise.all([
        getDispatchSnapshot(),
        getDispatchSettings(),
      ]);
      setSnapshot(snapshotData);
      setSettings(settingsData);
      const auditData = await getDispatchSettingsAudit({
        limit: 50,
        offset: 0,
        resetOnly: auditResetOnly,
        q: auditQuery,
        from: auditFrom,
        to: auditTo,
      });
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
  }, []);

  const handleSaveSettings = async () => {
    if (!settings) return;
    try {
      setSaving(true);
      const saved = await updateDispatchSettings(settings);
      setSettings(saved);
      const auditData = await getDispatchSettingsAudit({
        limit: 50,
        offset: 0,
        resetOnly: auditResetOnly,
        q: auditQuery,
        from: auditFrom,
        to: auditTo,
      });
      setAudit(auditData);
      setAuditOffset(0);
      addToast({ type: 'success', message: 'Parametres dispatch sauvegardes.' });
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Erreur sauvegarde parametres.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetSettings = async () => {
    try {
      setSaving(true);
      const saved = await resetDispatchSettings();
      setSettings(saved);
      const auditData = await getDispatchSettingsAudit({
        limit: 50,
        offset: 0,
        resetOnly: auditResetOnly,
        q: auditQuery,
        from: auditFrom,
        to: auditTo,
      });
      setAudit(auditData);
      setAuditOffset(0);
      addToast({ type: 'success', message: 'Parametres dispatch reinitialises.' });
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Erreur reset parametres.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Dispatch</h2>
          <p className="text-sm text-gray-500">
            Suivi des conversations en attente et etat de la queue.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            refresh();
            onRefresh?.();
          }}
          disabled={loading}
          title="Rafraîchir"
          aria-label="Rafraîchir"
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <ListChecks className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Queue</p>
              <p className="text-2xl font-semibold text-gray-900">
                {snapshot?.queue_size ?? 0}
              </p>
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
              <p className="text-2xl font-semibold text-gray-900">
                {snapshot?.waiting_count ?? 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Parametres Cron
            </h3>
            <p className="text-xs text-gray-500">
              Ces valeurs pilotent les crons dispatch en temps reel.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleResetSettings}
              disabled={saving || !settings}
              className="rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              Reset defaut
            </button>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={saving || !settings}
              className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </div>
        {settings && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Reinject sans reponse (min)
              </label>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                value={settings.no_reply_reinject_interval_minutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    no_reply_reinject_interval_minutes: Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Read-only check (min)
              </label>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                value={settings.read_only_check_interval_minutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    read_only_check_interval_minutes: Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Offline reinject cron
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                value={settings.offline_reinject_cron}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    offline_reinject_cron: e.target.value,
                  })
                }
              />
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Historique des changements
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3 text-xs">
          <label className="flex items-center gap-2 text-gray-600">
            <input
              type="checkbox"
              checked={auditResetOnly}
              onChange={async (e) => {
                const next = e.target.checked;
                setAuditResetOnly(next);
                const data = await getDispatchSettingsAudit({
                  limit: 50,
                  offset: 0,
                  resetOnly: next,
                  q: auditQuery,
                });
                setAudit(data);
                setAuditOffset(0);
              }}
            />
            Afficher uniquement les resets
          </label>
          <div className="flex items-center gap-2">
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
            <input
              type="date"
              className="rounded-md border border-gray-200 px-2 py-1 text-xs"
              value={auditTo}
              onChange={(e) => setAuditTo(e.target.value)}
            />
            <button
              type="button"
              onClick={async () => {
                const data = await getDispatchSettingsAudit({
                  limit: 50,
                  offset: 0,
                  resetOnly: auditResetOnly,
                  q: auditQuery,
                  from: auditFrom,
                  to: auditTo,
                });
                setAudit(data);
                setAuditOffset(0);
              }}
              className="rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-100"
            >
              Rechercher
            </button>
          </div>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {audit.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Avant</th>
                  <th className="px-4 py-2">Apres</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {audit.map((entry) => {
                  let payload: any = null;
                  try {
                    payload = JSON.parse(entry.payload);
                  } catch {
                    payload = null;
                  }
                  return (
                    <tr key={entry.id}>
                      <td className="px-4 py-2 text-gray-500">
                        {formatDate(entry.created_at)}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {payload?.before && payload?.after ? (
                          <div className="space-y-1">
                            {Object.keys(payload.before).map((key) => (
                              <div key={key} className="flex flex-wrap gap-2">
                                <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-gray-600">
                                  {key}
                                </span>
                                <span className="text-[11px] text-gray-500">
                                  {String(payload.before[key])}
                                </span>
                                <span className="text-[11px] text-gray-400">→</span>
                                <span className="text-[11px] text-gray-800">
                                  {String(payload.after[key])}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {payload?.after ? (
                          <div className="space-y-1">
                            {Object.entries(payload.after).map(([key, value]) => (
                              <div key={key} className="flex justify-between gap-2">
                                <span className="text-[11px] text-gray-500">{key}</span>
                                <span className="text-[11px] font-semibold text-gray-800">
                                  {String(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-gray-500">
              Aucun historique disponible.
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={async () => {
              const data = await getDispatchSettingsAudit({
                limit: 50,
                offset: 0,
                resetOnly: auditResetOnly,
                q: auditQuery,
                from: auditFrom,
                to: auditTo,
              });
              setAudit(data);
              setAuditOffset(0);
            }}
            title="Rafraîchir l'historique"
            aria-label="Rafraîchir l'historique"
            className="p-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={async () => {
              const nextOffset = auditOffset + 50;
              const data = await getDispatchSettingsAudit({
                limit: 50,
                offset: nextOffset,
                resetOnly: auditResetOnly,
                q: auditQuery,
                from: auditFrom,
                to: auditTo,
              });
              setAudit((prev) => [...prev, ...data]);
              setAuditOffset(nextOffset);
            }}
            className="rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-100"
          >
            Charger plus
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Conversations en attente
            </h3>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
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
                    <tr key={item.id}>
                      <td className="px-4 py-2 text-gray-900">{item.chat_id}</td>
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
              <p className="px-4 py-6 text-center text-sm text-gray-500">
                Aucune conversation en attente.
              </p>
            )}
          </div>
      </div>
    </div>
  );
}

