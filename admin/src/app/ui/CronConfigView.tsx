'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock, Lock, PauseCircle, Play, RefreshCw, RotateCcw, Timer, X, Zap } from 'lucide-react';
import { CronConfig, UpdateCronConfigPayload } from '@/app/lib/definitions';
import { getCronConfigs, getCronPreview, resetCronConfig, runCronNow, updateCronConfig } from '@/app/lib/api';
import { useToast } from '@/app/ui/ToastProvider';
import { formatDate, formatRelativeDate } from '@/app/lib/dateUtils';

// ─── Types preview ────────────────────────────────────────────────────────────

interface ReinjectionPreviewRow {
  chat_id: string; name: string; poste_id: string | null;
  unread_count: number; last_activity_at: string | null; read_only: boolean;
}
interface ReinjectionPreview { total: number; conversations: ReinjectionPreviewRow[] }

interface ReadOnlyRow {
  chat_id: string; name: string; last_client_message_at: string | null; idle_hours: number;
}
interface ReadOnlyPreview { total: number; conversations: ReadOnlyRow[] }

interface NoPreview { available: false; message: string }

type CronPreviewData = ReinjectionPreview | ReadOnlyPreview | NoPreview | null;

// ─── Modal de confirmation ────────────────────────────────────────────────────

function PreviewModal({
  cronKey,
  cronLabel,
  data,
  onConfirm,
  onClose,
  confirming,
}: {
  cronKey: string;
  cronLabel: string;
  data: CronPreviewData;
  onConfirm: () => void;
  onClose: () => void;
  confirming: boolean;
}) {
  const noPreview = data && 'available' in data && data.available === false;

  const renderContent = () => {
    if (!data) return <p className="text-sm text-gray-500">Chargement de l&apos;aperçu...</p>;
    if (noPreview) return <p className="text-sm text-gray-500">{(data as NoPreview).message}</p>;

    if (cronKey === 'offline-reinject') {
      const d = data as ReinjectionPreview;
      return (
        <div>
          <p className="text-sm text-gray-700 mb-3">
            <strong>{d.total}</strong> conversation{d.total !== 1 ? 's' : ''} seront réinjectées dans le système.
          </p>
          {d.total === 0 ? (
            <p className="text-xs text-gray-400 italic">Aucune conversation à réinjecter.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Client</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-500">Non lus</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-500">Lecture seule</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Dernière activité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {d.conversations.map((c) => (
                    <tr key={c.chat_id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{c.name}</td>
                      <td className="px-3 py-2 text-center">
                        {c.unread_count > 0
                          ? <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-red-100 text-red-700 font-bold text-[10px]">{c.unread_count}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {c.read_only ? <Lock className="w-3.5 h-3.5 text-amber-500 mx-auto" /> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {c.last_activity_at ? formatRelativeDate(c.last_activity_at) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    }

    if (cronKey === 'read-only-enforcement') {
      const d = data as ReadOnlyPreview;
      return (
        <div>
          <p className="text-sm text-gray-700 mb-3">
            <strong>{d.total}</strong> conversation{d.total !== 1 ? 's' : ''} seront passées en lecture seule (inactives &gt; 24h).
          </p>
          {d.total === 0 ? (
            <p className="text-xs text-gray-400 italic">Aucune conversation concernée.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Client</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-500">Inactivité</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Dernier message client</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {d.conversations.map((c) => (
                    <tr key={c.chat_id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{c.name}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 font-semibold text-[10px]">{c.idle_hours}h</span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {c.last_client_message_at ? formatRelativeDate(c.last_client_message_at) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    }

    return <p className="text-sm text-gray-500">Aperçu non disponible pour ce CRON.</p>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Confirmer l&apos;exécution</h2>
            <p className="mt-0.5 text-sm text-gray-500">{cronLabel}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <div className="mb-4 flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-100 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">Cette action sera exécutée immédiatement, en dehors du planning habituel.</p>
          </div>
          {renderContent()}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose} disabled={confirming}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Annuler
          </button>
          <button onClick={onConfirm} disabled={confirming}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            <Play className="h-3.5 w-3.5" />
            {confirming ? 'Exécution...' : 'Confirmer l\'exécution'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const SCHEDULE_BADGE: Record<string, { label: string; cls: string }> = {
  interval: { label: 'Interval', cls: 'bg-blue-100 text-blue-700' },
  cron:     { label: 'Cron',     cls: 'bg-purple-100 text-purple-700' },
  event:    { label: 'Événement', cls: 'bg-amber-100 text-amber-700' },
};

function scheduleLabel(c: CronConfig): string {
  if (c.scheduleType === 'interval' && c.intervalMinutes)
    return `Toutes les ${c.intervalMinutes} min`;
  if (c.scheduleType === 'cron' && c.cronExpression)
    return c.cronExpression;
  if (c.scheduleType === 'event')
    return 'Déclenché par événement';
  return '—';
}

// ─── Panneau de configuration (inline) ───────────────────────────────────────

function ConfigPanel({
  config,
  onUpdate,
  onClose,
}: {
  config: CronConfig;
  onUpdate: (updated: CronConfig) => void;
  onClose: () => void;
}) {
  const { addToast } = useToast();

  const [enabled, setEnabled]                 = useState(config.enabled);
  const [intervalMinutes, setIntervalMinutes] = useState(config.intervalMinutes ?? 5);
  const [cronExpression, setCronExpression]   = useState(config.cronExpression ?? '');
  const [ttlDays, setTtlDays]                 = useState(config.ttlDays ?? 14);
  const [delayMin, setDelayMin]               = useState(config.delayMinSeconds ?? 20);
  const [delayMax, setDelayMax]               = useState(config.delayMaxSeconds ?? 45);
  const [maxSteps, setMaxSteps]               = useState(config.maxSteps ?? 3);

  const [saving,    setSaving]    = useState(false);
  const [resetting, setResetting] = useState(false);
  const [running,   setRunning]   = useState(false);

  // Preview modal
  const [previewOpen,   setPreviewOpen]   = useState(false);
  const [previewData,   setPreviewData]   = useState<CronPreviewData>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    setEnabled(config.enabled);
    setIntervalMinutes(config.intervalMinutes ?? 5);
    setCronExpression(config.cronExpression ?? '');
    setTtlDays(config.ttlDays ?? 14);
    setDelayMin(config.delayMinSeconds ?? 20);
    setDelayMax(config.delayMaxSeconds ?? 45);
    setMaxSteps(config.maxSteps ?? 3);
  }, [config]);

  const busy = saving || resetting || running;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: UpdateCronConfigPayload = { enabled };
      if (config.scheduleType === 'interval') payload.intervalMinutes = intervalMinutes;
      if (config.scheduleType === 'cron')     payload.cronExpression  = cronExpression;
      if (config.key === 'webhook-purge')     payload.ttlDays         = ttlDays;
      if (config.key === 'auto-message') {
        payload.delayMinSeconds = delayMin;
        payload.delayMaxSeconds = delayMax;
        payload.maxSteps        = maxSteps;
      }
      const updated = await updateCronConfig(config.key, payload);
      onUpdate(updated);
      addToast({ type: 'success', message: `"${config.label}" mis à jour.` });
      onClose();
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur sauvegarde.' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const updated = await resetCronConfig(config.key);
      onUpdate(updated);
      addToast({ type: 'info', message: `"${config.label}" remis aux valeurs par défaut.` });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur reset.' });
    } finally {
      setResetting(false);
    }
  };

  const handleOpenPreview = async () => {
    setPreviewOpen(true);
    setPreviewData(null);
    setLoadingPreview(true);
    try {
      const data = await getCronPreview(config.key);
      setPreviewData(data as CronPreviewData);
    } catch {
      setPreviewData({ available: false, message: 'Impossible de charger l\'aperçu.' });
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirmRun = async () => {
    setRunning(true);
    try {
      await runCronNow(config.key);
      setPreviewOpen(false);
      addToast({ type: 'success', message: `"${config.label}" exécuté immédiatement.` });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : "Erreur d'exécution." });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="border-t border-blue-100 bg-blue-50/40 px-5 py-5">
      <div className="grid gap-6 md:grid-cols-2">

        {/* ── Colonne gauche : activation + champs ─────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Toggle activé */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Statut</p>
              <p className="mt-0.5 text-sm font-medium text-gray-800">
                {enabled ? 'Activé — tâche planifiée' : 'Désactivé — tâche suspendue'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                enabled ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                enabled ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {/* Intervalle */}
          {config.scheduleType === 'interval' && (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Intervalle (minutes)
              </label>
              <input
                type="number" min={1} max={1440}
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-gray-400">S'exécute toutes les {intervalMinutes} min.</p>
            </div>
          )}

          {/* Expression CRON */}
          {config.scheduleType === 'cron' && (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Expression CRON
              </label>
              <input
                type="text"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 3 * * *"
                className="w-full rounded-md border border-gray-200 px-3 py-2 font-mono text-sm focus:border-slate-400 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-gray-400">Format : min heure jour mois jour-semaine</p>
            </div>
          )}

          {/* Rétention webhook-purge */}
          {config.key === 'webhook-purge' && (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Rétention (jours)
              </label>
              <input
                type="number" min={1} max={365}
                value={ttlDays}
                onChange={(e) => setTtlDays(Number(e.target.value))}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Événements webhook supprimés après {ttlDays} jour{ttlDays !== 1 ? 's' : ''}.
              </p>
            </div>
          )}

          {/* Auto-message */}
          {config.key === 'auto-message' && (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Délais & étapes</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Délai min (s)</label>
                  <input type="number" min={1} value={delayMin}
                    onChange={(e) => setDelayMin(Number(e.target.value))}
                    className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Délai max (s)</label>
                  <input type="number" min={1} value={delayMax}
                    onChange={(e) => setDelayMax(Number(e.target.value))}
                    className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Étapes max</label>
                  <input type="number" min={1} max={20} value={maxSteps}
                    onChange={(e) => setMaxSteps(Number(e.target.value))}
                    className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Colonne droite : infos + actions ─────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Infos read-only */}
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Informations</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Clé</span>
              <code className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{config.key}</code>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Type</span>
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${SCHEDULE_BADGE[config.scheduleType]?.cls}`}>
                {SCHEDULE_BADGE[config.scheduleType]?.label}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Planning</span>
              <span className="font-medium text-gray-700 font-mono text-xs">{scheduleLabel(config)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Dernière exécution</span>
              <span className="text-xs text-gray-600">
                {config.lastRunAt ? formatRelativeDate(config.lastRunAt) : 'jamais'}
              </span>
            </div>
          </div>

          {/* Description */}
          {config.description && (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Description</p>
              <p className="text-xs text-gray-600 leading-relaxed">{config.description}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={handleReset} disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400">
              <RotateCcw className="h-3.5 w-3.5" />
              {resetting ? 'Reset...' : 'Remettre défaut'}
            </button>
            <button type="button" onClick={() => void handleOpenPreview()} disabled={busy || loadingPreview}
              className="flex items-center gap-1.5 rounded-md border border-blue-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-blue-300">
              <Play className="h-3.5 w-3.5" />
              {loadingPreview ? 'Chargement...' : 'Exécuter maintenant'}
            </button>
            <button type="button" onClick={handleSave} disabled={busy}
              className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300">
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>

      {previewOpen && (
        <PreviewModal
          cronKey={config.key}
          cronLabel={config.label}
          data={loadingPreview ? null : previewData}
          onConfirm={() => void handleConfirmRun()}
          onClose={() => setPreviewOpen(false)}
          confirming={running}
        />
      )}
    </div>
  );
}

// ─── Ligne de tableau CRON ────────────────────────────────────────────────────

function CronRow({
  config,
  isOpen,
  onToggleOpen,
  onUpdate,
}: {
  config: CronConfig;
  isOpen: boolean;
  onToggleOpen: () => void;
  onUpdate: (updated: CronConfig) => void;
}) {
  const { addToast } = useToast();
  const [toggling, setToggling] = useState(false);

  const badge = SCHEDULE_BADGE[config.scheduleType] ?? SCHEDULE_BADGE.event;

  // Toggle rapide sans ouvrir le panneau
  const handleQuickToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setToggling(true);
    try {
      const updated = await updateCronConfig(config.key, { enabled: !config.enabled });
      onUpdate(updated);
      addToast({
        type: updated.enabled ? 'success' : 'info',
        message: `"${config.label}" ${updated.enabled ? 'activé' : 'désactivé'}.`,
      });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur.' });
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className={`rounded-xl border bg-white shadow-sm transition-all ${isOpen ? 'border-blue-200' : 'border-gray-200'}`}>

      {/* ── Ligne principale ──────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={onToggleOpen}
        className="w-full text-left"
      >
        <div className="flex items-center gap-4 px-5 py-4">

          {/* Indicateur de statut */}
          <div className="flex-shrink-0">
            {config.enabled
              ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              : <PauseCircle  className="h-5 w-5 text-gray-300" />
            }
          </div>

          {/* Nom + description */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-800">{config.label}</span>
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badge.cls}`}>
                {badge.label}
              </span>
              {!config.enabled && (
                <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Désactivé
                </span>
              )}
            </div>
            {config.description && (
              <p className="mt-0.5 truncate text-xs text-gray-400 max-w-md">{config.description}</p>
            )}
          </div>

          {/* Planning */}
          <div className="hidden sm:flex flex-col items-end gap-0.5 text-right flex-shrink-0">
            <span className="font-mono text-xs text-gray-600">{scheduleLabel(config)}</span>
            <span className="text-[11px] text-gray-400 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {config.lastRunAt ? formatRelativeDate(config.lastRunAt) : 'jamais'}
            </span>
          </div>

          {/* Toggle rapide */}
          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            onClick={handleQuickToggle}
            disabled={toggling}
            title={config.enabled ? 'Désactiver' : 'Activer'}
            className={`relative ml-2 inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
              config.enabled ? 'bg-emerald-500' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
              config.enabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>

          {/* Chevron */}
          <div className="ml-1 flex-shrink-0 text-gray-400">
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </button>

      {/* ── Panneau de configuration ──────────────────────────────────────── */}
      {isOpen && (
        <ConfigPanel
          config={config}
          onUpdate={onUpdate}
          onClose={onToggleOpen}
        />
      )}
    </div>
  );
}

// ─── CronConfigView ───────────────────────────────────────────────────────────

export default function CronConfigView() {
  const [configs, setConfigs]   = useState<CronConfig[]>([]);
  const [loading, setLoading]   = useState(false);
  const [openKey, setOpenKey]   = useState<string | null>(null);
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCronConfigs();
      setConfigs(data);
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur chargement CRONs.' });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const handleUpdate = (updated: CronConfig) => {
    setConfigs((prev) => prev.map((c) => (c.key === updated.key ? updated : c)));
  };

  const toggleOpen = (key: string) => {
    setOpenKey((prev) => (prev === key ? null : key));
  };

  const enabledCount  = configs.filter((c) => c.enabled).length;
  const disabledCount = configs.length - enabledCount;
  const lastRun = configs
    .map((c) => c.lastRunAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="space-y-6">

      {/* ── En-tête ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">CRONs & Tâches planifiées</h1>
          <p className="text-sm text-gray-500">Configurez, activez ou exécutez chaque tâche indépendamment.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="flex items-center gap-2 self-start rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* ── Compteurs ─────────────────────────────────────────────────────────── */}
      {configs.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-gray-100 p-2">
                <Timer className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{configs.length}</p>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Total</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 p-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-700">{enabledCount}</p>
                <p className="text-xs text-emerald-600 uppercase tracking-wide">Actives</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-gray-100 p-2">
                <PauseCircle className="h-5 w-5 text-gray-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-500">{disabledCount}</p>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Désactivées</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Légende ───────────────────────────────────────────────────────────── */}
      {configs.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
          <span className="font-semibold uppercase tracking-wide text-gray-400">Types :</span>
          {Object.entries(SCHEDULE_BADGE).map(([k, v]) => (
            <span key={k} className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${v.cls}`}>
              {v.label}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Cliquez sur une ligne pour configurer
          </span>
        </div>
      )}

      {/* ── Chargement ────────────────────────────────────────────────────────── */}
      {loading && configs.length === 0 && (
        <div className="flex justify-center py-16 text-sm text-gray-400">Chargement...</div>
      )}

      {/* ── Liste des CRONs ──────────────────────────────────────────────────── */}
      {configs.length > 0 && (
        <div className="flex flex-col gap-3">
          {configs.map((config) => (
            <CronRow
              key={config.key}
              config={config}
              isOpen={openKey === config.key}
              onToggleOpen={() => toggleOpen(config.key)}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}

      {/* ── Vide ──────────────────────────────────────────────────────────────── */}
      {!loading && configs.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-400 shadow-sm">
          Aucune tâche CRON. Exécutez la migration pour initialiser les entrées.
        </div>
      )}
    </div>
  );
}
