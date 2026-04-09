"use client";

import React, { useState, useCallback, useEffect } from 'react';
import {
  Edit, PlusCircle, Trash2, RefreshCw, CheckCircle2, PauseCircle,
  Settings, Clock, Moon, RotateCcw, Timer, Search, Users, Battery,
  UserCheck, List, Zap, Tag, X,
} from 'lucide-react';
import { formatDateShort } from '@/app/lib/dateUtils';
import type {
  MessageAuto, AutoMessageTriggerType, AutoMessageKeyword, BusinessHoursConfig,
  CronConfig, UpdateCronConfigPayload, Poste, Channel, KeywordMatchType,
} from '@/app/lib/definitions';
import {
  getMessageAutoByTrigger, getMessageAuto,
  createMessageAuto, updateMessageAuto, deleteMessageAuto,
  addKeyword, removeKeyword,
  getBusinessHours, updateBusinessHoursDay,
  getCronConfigs, updateCronConfig,
  getPostes, getChannels,
} from '@/app/lib/api';
import { EntityFormModal } from '@/app/ui/crud/EntityFormModal';
import { EntityTable } from '@/app/ui/crud/EntityTable';
import { useToast } from '@/app/ui/ToastProvider';

// ─── Constantes ───────────────────────────────────────────────────────────────

type TabKey = 'master' | AutoMessageTriggerType;

const TRIGGER_TABS: Array<{
  key: TabKey;
  label: string;
  cronKey: string | null;
  icon: React.ElementType;
  description: string;
  hasThreshold: 'noResponse' | 'queueWait' | 'inactivity' | null;
  hasClientType: boolean;
  hasKeywords: boolean;
  hasBusinessHours: boolean;
}> = [
  { key: 'master', label: 'CRON Global', cronKey: 'auto-message-master', icon: Zap, description: 'Planification et délais du CRON maître', hasThreshold: null, hasClientType: false, hasKeywords: false, hasBusinessHours: false },
  { key: 'no_response', label: 'A – Sans réponse', cronKey: 'auto-message-no-response', icon: Clock, description: 'Aucune réponse agent après X minutes', hasThreshold: 'noResponse', hasClientType: false, hasKeywords: false, hasBusinessHours: false },
  { key: 'sequence', label: 'B – Séquence', cronKey: null, icon: List, description: 'Séquence multi-étapes à la demande', hasThreshold: null, hasClientType: false, hasKeywords: false, hasBusinessHours: false },
  { key: 'out_of_hours', label: 'C – Hors horaires', cronKey: 'auto-message-out-of-hours', icon: Moon, description: 'Message reçu en dehors des horaires', hasThreshold: null, hasClientType: false, hasKeywords: false, hasBusinessHours: true },
  { key: 'reopened', label: 'D – Réouverture', cronKey: 'auto-message-reopened', icon: RotateCcw, description: 'Client ré-écrit après fermeture', hasThreshold: null, hasClientType: false, hasKeywords: false, hasBusinessHours: false },
  { key: 'queue_wait', label: 'E – File d\'attente', cronKey: 'auto-message-queue-wait', icon: Timer, description: 'Client en attente de prise en charge', hasThreshold: 'queueWait', hasClientType: false, hasKeywords: false, hasBusinessHours: false },
  { key: 'keyword', label: 'F – Mot-clé', cronKey: 'auto-message-keyword', icon: Search, description: 'Mot-clé détecté dans le message client', hasThreshold: null, hasClientType: false, hasKeywords: true, hasBusinessHours: false },
  { key: 'client_type', label: 'G – Type de client', cronKey: 'auto-message-client-type', icon: Users, description: 'Nouveau contact ou client fidèle', hasThreshold: null, hasClientType: true, hasKeywords: false, hasBusinessHours: false },
  { key: 'inactivity', label: 'H – Inactivité', cronKey: 'auto-message-inactivity', icon: Battery, description: 'Aucune activité des deux côtés depuis X min', hasThreshold: 'inactivity', hasClientType: false, hasKeywords: false, hasBusinessHours: false },
  { key: 'on_assign', label: 'I – Assignation', cronKey: 'auto-message-on-assign', icon: UserCheck, description: 'Message lors de l\'assignation à un agent', hasThreshold: null, hasClientType: false, hasKeywords: false, hasBusinessHours: false },
];

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

// ─── TriggerCronConfigCard ────────────────────────────────────────────────────

interface TriggerCronConfigCardProps {
  cronKey: string;
  hasThreshold: 'noResponse' | 'queueWait' | 'inactivity' | null;
  isMaster?: boolean;
}

function TriggerCronConfigCard({ cronKey, hasThreshold, isMaster = false }: TriggerCronConfigCardProps) {
  const { addToast } = useToast();
  const [config, setConfig] = useState<CronConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  // form state
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [delayMin, setDelayMin] = useState(300);
  const [delayMax, setDelayMax] = useState(540);
  const [maxSteps, setMaxSteps] = useState(3);
  const [threshold, setThreshold] = useState(60);
  const [applyToReadOnly, setApplyToReadOnly] = useState(false);
  const [applyToClosed, setApplyToClosed] = useState(false);
  const [activeHourStart, setActiveHourStart] = useState<number | ''>('');
  const [activeHourEnd, setActiveHourEnd] = useState<number | ''>('');

  const load = useCallback(async () => {
    try {
      const all = await getCronConfigs();
      const found = all.find((c) => c.key === cronKey) ?? null;
      if (found) {
        setConfig(found);
        setIntervalMinutes(found.intervalMinutes ?? 5);
        setDelayMin(found.delayMinSeconds ?? 300);
        setDelayMax(found.delayMaxSeconds ?? 540);
        setMaxSteps(found.maxSteps ?? 3);
        if (hasThreshold === 'noResponse') setThreshold(found.noResponseThresholdMinutes ?? 60);
        if (hasThreshold === 'queueWait') setThreshold(found.queueWaitThresholdMinutes ?? 30);
        if (hasThreshold === 'inactivity') setThreshold(found.inactivityThresholdMinutes ?? 120);
        setApplyToReadOnly(found.applyToReadOnly ?? false);
        setApplyToClosed(found.applyToClosed ?? false);
        setActiveHourStart(found.activeHourStart ?? '');
        setActiveHourEnd(found.activeHourEnd ?? '');
      }
    } catch { /* ignore */ }
  }, [cronKey, hasThreshold]);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = async () => {
    if (!config) return;
    setToggling(true);
    try {
      const updated = await updateCronConfig(config.key, { enabled: !config.enabled });
      setConfig(updated);
      addToast({ type: updated.enabled ? 'success' : 'info', message: updated.enabled ? 'Trigger activé.' : 'Trigger désactivé.' });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur.' });
    } finally { setToggling(false); }
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const payload: UpdateCronConfigPayload = {};
      if (isMaster) {
        payload.intervalMinutes = intervalMinutes;
        payload.delayMinSeconds = delayMin;
        payload.delayMaxSeconds = delayMax;
        payload.maxSteps = maxSteps;
      }
      if (hasThreshold === 'noResponse') payload.noResponseThresholdMinutes = threshold;
      if (hasThreshold === 'queueWait') payload.queueWaitThresholdMinutes = threshold;
      if (hasThreshold === 'inactivity') payload.inactivityThresholdMinutes = threshold;
      if (!isMaster) {
        payload.applyToReadOnly = applyToReadOnly;
        payload.applyToClosed = applyToClosed;
      }
      if (activeHourStart !== '') payload.activeHourStart = Number(activeHourStart);
      if (activeHourEnd !== '') payload.activeHourEnd = Number(activeHourEnd);

      const updated = await updateCronConfig(config.key, payload);
      setConfig(updated);
      addToast({ type: 'success', message: 'Configuration sauvegardée.' });
      setShowEdit(false);
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur sauvegarde.' });
    } finally { setSaving(false); }
  };

  if (!config) return <div className="h-16 animate-pulse rounded-xl bg-gray-100" />;

  const enabled = config.enabled;
  const thresholdLabel = hasThreshold === 'noResponse' ? 'Seuil sans réponse (min)' :
    hasThreshold === 'queueWait' ? 'Seuil attente queue (min)' :
    hasThreshold === 'inactivity' ? 'Seuil inactivité (min)' : null;

  return (
    <div className={`rounded-xl border shadow-sm ${enabled ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {enabled
            ? <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
            : <PauseCircle className="h-5 w-5 text-gray-400 flex-shrink-0" />
          }
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {enabled ? 'Activé' : 'Désactivé'}
              {isMaster && ` · Intervalle ${config.intervalMinutes ?? 5} min`}
              {isMaster && ` · Délai ${config.delayMinSeconds ?? 300}–${config.delayMaxSeconds ?? 540}s · Max ${config.maxSteps ?? 3} étape(s)`}
              {!isMaster && hasThreshold && ` · Seuil ${
                hasThreshold === 'noResponse' ? (config.noResponseThresholdMinutes ?? 60) :
                hasThreshold === 'queueWait' ? (config.queueWaitThresholdMinutes ?? 30) :
                (config.inactivityThresholdMinutes ?? 120)
              } min`}
            </p>
            {(config.activeHourStart !== null && config.activeHourEnd !== null) && (
              <p className="text-xs text-gray-500">
                Plage active : {config.activeHourStart}h–{config.activeHourEnd}h
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowEdit((v) => !v)}
            title="Configurer"
            className="rounded-md border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => void handleToggle()}
            disabled={toggling}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      {showEdit && (
        <div className="border-t border-gray-200 px-4 py-4 bg-white rounded-b-xl space-y-3">
          {isMaster && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">Intervalle CRON (min)</label>
                <input type="number" min={1} value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))} className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Étapes max (séquence)</label>
                <input type="number" min={1} max={20} value={maxSteps} onChange={(e) => setMaxSteps(Number(e.target.value))} className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Délai min (s)</label>
                <input type="number" min={1} value={delayMin} onChange={(e) => setDelayMin(Number(e.target.value))} className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Délai max (s)</label>
                <input type="number" min={1} value={delayMax} onChange={(e) => setDelayMax(Number(e.target.value))} className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none" />
              </div>
            </div>
          )}
          {thresholdLabel && (
            <div>
              <label className="mb-1 block text-xs text-gray-500">{thresholdLabel}</label>
              <input type="number" min={1} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Heure début activité (0–23, vide = désactivé)</label>
              <input type="number" min={0} max={22} value={activeHourStart} onChange={(e) => setActiveHourStart(e.target.value ? Number(e.target.value) : '')} placeholder="Ex: 8" className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Heure fin activité (1–23)</label>
              <input type="number" min={1} max={23} value={activeHourEnd} onChange={(e) => setActiveHourEnd(e.target.value ? Number(e.target.value) : '')} placeholder="Ex: 18" className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none" />
            </div>
          </div>
          {!isMaster && (
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={applyToReadOnly} onChange={(e) => setApplyToReadOnly(e.target.checked)} className="rounded" />
                Conversations lecture seule
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={applyToClosed} onChange={(e) => setApplyToClosed(e.target.checked)} className="rounded" />
                Conversations fermées
              </label>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowEdit(false)} className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">Annuler</button>
            <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BusinessHoursPanel ───────────────────────────────────────────────────────

function BusinessHoursPanel() {
  const { addToast } = useToast();
  const [hours, setHours] = useState<BusinessHoursConfig[]>([]);
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getBusinessHours();
      const sorted = [...data].sort((a, b) => {
        const order = [1, 2, 3, 4, 5, 6, 0]; // Lun-Sam-Dim
        return order.indexOf(a.dayOfWeek) - order.indexOf(b.dayOfWeek);
      });
      setHours(sorted);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleUpdate = async (day: number, patch: Partial<BusinessHoursConfig>) => {
    setSaving(day);
    try {
      const updated = await updateBusinessHoursDay(day, patch);
      setHours((prev) => prev.map((h) => h.dayOfWeek === day ? { ...h, ...updated } : h));
      addToast({ type: 'success', message: `${DAY_NAMES[day]} mis à jour.` });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur.' });
    } finally { setSaving(null); }
  };

  const fmt = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  if (hours.length === 0) return <div className="h-8 animate-pulse rounded bg-gray-100" />;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-2.5 bg-gray-50">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Horaires d&apos;ouverture</p>
        <p className="text-xs text-gray-400">Utilisés par le trigger Hors horaires (C). Les messages hors de ces plages déclenchent le message auto.</p>
      </div>
      <div className="divide-y divide-gray-50">
        {hours.map((h) => (
          <div key={h.dayOfWeek} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-24 text-sm font-medium text-gray-700">{DAY_NAMES[h.dayOfWeek]}</span>
            <button
              type="button"
              role="switch"
              aria-checked={h.isOpen}
              onClick={() => void handleUpdate(h.dayOfWeek, { isOpen: !h.isOpen })}
              disabled={saving === h.dayOfWeek}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${h.isOpen ? 'bg-emerald-500' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${h.isOpen ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
            {h.isOpen ? (
              <div className="flex items-center gap-2 ml-2">
                <input
                  type="time"
                  defaultValue={fmt(h.openHour, h.openMinute)}
                  onBlur={(e) => {
                    const [hh, mm] = e.target.value.split(':').map(Number);
                    if (!isNaN(hh) && !isNaN(mm)) void handleUpdate(h.dayOfWeek, { openHour: hh, openMinute: mm });
                  }}
                  className="rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none"
                />
                <span className="text-gray-400 text-xs">à</span>
                <input
                  type="time"
                  defaultValue={fmt(h.closeHour, h.closeMinute)}
                  onBlur={(e) => {
                    const [hh, mm] = e.target.value.split(':').map(Number);
                    if (!isNaN(hh) && !isNaN(mm)) void handleUpdate(h.dayOfWeek, { closeHour: hh, closeMinute: mm });
                  }}
                  className="rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none"
                />
              </div>
            ) : (
              <span className="ml-2 text-xs text-gray-400">Fermé</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── KeywordManagerModal ──────────────────────────────────────────────────────

interface KeywordManagerModalProps {
  template: MessageAuto;
  onClose: () => void;
  onUpdate: (updated: MessageAuto) => void;
}

function KeywordManagerModal({ template, onClose, onUpdate }: KeywordManagerModalProps) {
  const { addToast } = useToast();
  const [keywords, setKeywords] = useState<AutoMessageKeyword[]>(template.keywords ?? []);
  const [newKeyword, setNewKeyword] = useState('');
  const [newMatchType, setNewMatchType] = useState<KeywordMatchType>('contains');
  const [newCaseSensitive, setNewCaseSensitive] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newKeyword.trim()) return;
    setAdding(true);
    try {
      const kw = await addKeyword(template.id, {
        keyword: newKeyword.trim(),
        matchType: newMatchType,
        caseSensitive: newCaseSensitive,
        actif: true,
      });
      const next = [...keywords, kw];
      setKeywords(next);
      onUpdate({ ...template, keywords: next });
      setNewKeyword('');
      addToast({ type: 'success', message: 'Mot-clé ajouté.' });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur ajout.' });
    } finally { setAdding(false); }
  };

  const handleRemove = async (kw: AutoMessageKeyword) => {
    try {
      await removeKeyword(template.id, kw.id);
      const next = keywords.filter((k) => k.id !== kw.id);
      setKeywords(next);
      onUpdate({ ...template, keywords: next });
      addToast({ type: 'success', message: 'Mot-clé supprimé.' });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur suppression.' });
    }
  };

  const matchTypeLabel: Record<KeywordMatchType, string> = {
    exact: 'Exact',
    contains: 'Contient',
    starts_with: 'Commence par',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="font-semibold text-gray-900">Mots-clés de déclenchement</p>
            <p className="text-xs text-gray-500 mt-0.5 max-w-xs truncate">{template.body}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Ajouter un mot-clé */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
              placeholder="Ex: aide, problème, urgent..."
              className="flex-1 rounded border border-gray-200 px-3 py-2 text-sm focus:outline-none"
            />
            <select
              value={newMatchType}
              onChange={(e) => setNewMatchType(e.target.value as KeywordMatchType)}
              className="rounded border border-gray-200 px-2 py-2 text-sm focus:outline-none"
            >
              <option value="contains">Contient</option>
              <option value="exact">Exact</option>
              <option value="starts_with">Commence par</option>
            </select>
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={adding || !newKeyword.trim()}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <PlusCircle className="h-4 w-4" />
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={newCaseSensitive} onChange={(e) => setNewCaseSensitive(e.target.checked)} className="rounded" />
            Respecter la casse
          </label>

          {/* Liste des mots-clés */}
          {keywords.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">Aucun mot-clé configuré. Le trigger F ne se déclenchera pas pour ce template.</p>
          ) : (
            <div className="divide-y divide-gray-50 rounded-lg border border-gray-100 overflow-hidden">
              {keywords.map((kw) => (
                <div key={kw.id} className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                    <span className="font-mono text-sm text-gray-800">{kw.keyword}</span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">{matchTypeLabel[kw.matchType]}</span>
                    {kw.caseSensitive && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-600">Aa</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRemove(kw)}
                    className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end border-t border-gray-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ─── TemplateFormFields ───────────────────────────────────────────────────────

interface ScopeOption { id: string; label: string; }

interface TemplateFormFieldsProps {
  body: string; onBodyChange: (v: string) => void;
  delai: number | undefined; onDelaiChange: (v: number | undefined) => void;
  position: number; onPositionChange: (v: number) => void;
  actif: boolean; onActifChange: (v: boolean) => void;
  scopeType: string; onScopeTypeChange: (v: string) => void;
  scopeId: string; onScopeIdChange: (v: string) => void;
  scopeLabel: string; onScopeLabelChange: (v: string) => void;
  clientTypeTarget: string; onClientTypeTargetChange: (v: string) => void;
  showClientType: boolean;
  postes: Poste[]; channels: Channel[];
  idPrefix: string;
}

function TemplateFormFields({
  body, onBodyChange, delai, onDelaiChange,
  position, onPositionChange, actif, onActifChange,
  scopeType, onScopeTypeChange, scopeId, onScopeIdChange,
  scopeLabel, onScopeLabelChange, clientTypeTarget, onClientTypeTargetChange,
  showClientType, postes, channels, idPrefix,
}: TemplateFormFieldsProps) {
  return (
    <>
      <div className="mb-4">
        <label htmlFor={`${idPrefix}-body`} className="mb-1 block text-sm font-bold text-gray-700">Corps du message</label>
        <textarea
          id={`${idPrefix}-body`} rows={3}
          className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
          value={body} onChange={(e) => onBodyChange(e.target.value)} required
          placeholder="Ex: Bonjour #name#, comment puis-je vous aider ?"
        />
        <p className="mt-1 text-xs text-gray-400">
          Placeholders : <code className="rounded bg-gray-100 px-1">#name#</code> prénom, <code className="rounded bg-gray-100 px-1">#numero#</code> téléphone
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label htmlFor={`${idPrefix}-position`} className="mb-1 block text-sm font-bold text-gray-700">Position (étape)</label>
          <input type="number" id={`${idPrefix}-position`} min={1}
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={position} onChange={(e) => onPositionChange(Number.parseInt(e.target.value || '1', 10))} required />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-delai`} className="mb-1 block text-sm font-bold text-gray-700">Délai (s) — vide = global</label>
          <input type="number" id={`${idPrefix}-delai`} min={0}
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={delai ?? ''}
            onChange={(e) => onDelaiChange(e.target.value ? Number.parseInt(e.target.value, 10) : undefined)} />
        </div>
      </div>

      {/* Scope */}
      <div className="mb-4 rounded-lg border border-gray-100 p-3 space-y-3 bg-gray-50">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Scope (optionnel)</p>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Type de scope</label>
          <select
            className="w-full rounded border px-2 py-1.5 text-sm text-gray-700 focus:outline-none bg-white"
            value={scopeType}
            onChange={(e) => { onScopeTypeChange(e.target.value); onScopeIdChange(''); onScopeLabelChange(''); }}
          >
            <option value="">Global (tous)</option>
            <option value="poste">Poste spécifique</option>
            <option value="canal">Canal spécifique</option>
          </select>
        </div>
        {scopeType === 'poste' && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">Poste</label>
            <select
              className="w-full rounded border px-2 py-1.5 text-sm text-gray-700 focus:outline-none bg-white"
              value={scopeId}
              onChange={(e) => {
                const p = postes.find((x) => x.id === e.target.value);
                onScopeIdChange(e.target.value);
                onScopeLabelChange(p?.name ?? '');
              }}
            >
              <option value="">-- Sélectionner un poste --</option>
              {postes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {scopeType === 'canal' && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">Canal</label>
            <select
              className="w-full rounded border px-2 py-1.5 text-sm text-gray-700 focus:outline-none bg-white"
              value={scopeId}
              onChange={(e) => {
                const c = channels.find((x) => x.id === e.target.value);
                onScopeIdChange(e.target.value);
                onScopeLabelChange(c?.label || 'Canal sans nom');
              }}
            >
              <option value="">-- Sélectionner un canal --</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || 'Canal sans nom'}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Client type (trigger G only) */}
      {showClientType && (
        <div className="mb-4">
          <label className="mb-1 block text-sm font-bold text-gray-700">Ciblage type de client</label>
          <select
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={clientTypeTarget}
            onChange={(e) => onClientTypeTargetChange(e.target.value)}
          >
            <option value="all">Tous les clients</option>
            <option value="new">Nouveau contact uniquement</option>
            <option value="returning">Client fidèle uniquement</option>
          </select>
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <input type="checkbox" id={`${idPrefix}-actif`} className="rounded"
          checked={actif} onChange={(e) => onActifChange(e.target.checked)} />
        <label htmlFor={`${idPrefix}-actif`} className="text-sm font-bold text-gray-700">Actif</label>
      </div>
    </>
  );
}

// ─── TemplatePanel ────────────────────────────────────────────────────────────

interface TemplatePanelProps {
  trigger: AutoMessageTriggerType;
  showClientType: boolean;
  showKeywords: boolean;
}

function TemplatePanel({ trigger, showClientType, showKeywords }: TemplatePanelProps) {
  const { addToast } = useToast();
  const [templates, setTemplates] = useState<MessageAuto[]>([]);
  const [loading, setLoading] = useState(false);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [current, setCurrent] = useState<MessageAuto | null>(null);
  const [keywordTarget, setKeywordTarget] = useState<MessageAuto | null>(null);

  // form state
  const [fBody, setFBody] = useState('');
  const [fDelai, setFDelai] = useState<number | undefined>(undefined);
  const [fPosition, setFPosition] = useState(1);
  const [fActif, setFActif] = useState(true);
  const [fScopeType, setFScopeType] = useState('');
  const [fScopeId, setFScopeId] = useState('');
  const [fScopeLabel, setFScopeLabel] = useState('');
  const [fClientType, setFClientType] = useState('all');
  const [formLoading, setFormLoading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      let data: MessageAuto[];
      if (trigger === 'sequence') {
        const all = await getMessageAuto();
        data = all.filter((t) => !t.trigger_type || t.trigger_type === 'sequence');
      } else {
        data = await getMessageAutoByTrigger(trigger);
      }
      setTemplates(data);
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur chargement.' });
    } finally { setLoading(false); }
  }, [trigger, addToast]);

  const loadScopeData = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([getPostes(), getChannels()]);
      setPostes(p); setChannels(c);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void fetchTemplates(); void loadScopeData(); }, [fetchTemplates, loadScopeData]);

  const resetForm = (msg?: MessageAuto) => {
    setFBody(msg?.body ?? '');
    setFDelai(msg?.delai ?? undefined);
    setFPosition(msg?.position ?? (templates.length + 1));
    setFActif(msg?.actif ?? true);
    setFScopeType(msg?.scope_type ?? '');
    setFScopeId(msg?.scope_id ?? '');
    setFScopeLabel(msg?.scope_label ?? '');
    setFClientType(msg?.client_type_target ?? 'all');
  };

  const openAdd = () => { resetForm(); setShowAddModal(true); };
  const openEdit = (msg: MessageAuto) => { setCurrent(msg); resetForm(msg); setShowEditModal(true); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const created = await createMessageAuto({
        body: fBody, delai: fDelai, position: fPosition, actif: fActif,
        trigger_type: trigger,
        scope_type: fScopeType as MessageAuto['scope_type'] || null,
        scope_id: fScopeId || null,
        scope_label: fScopeLabel || null,
        client_type_target: (showClientType ? fClientType : 'all') as MessageAuto['client_type_target'],
      });
      setTemplates((prev) => [...prev, created]);
      addToast({ type: 'success', message: 'Template ajouté.' });
      setShowAddModal(false);
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur création.' });
    } finally { setFormLoading(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    setFormLoading(true);
    try {
      const updated = await updateMessageAuto(current.id, {
        body: fBody, delai: fDelai, position: fPosition, actif: fActif,
        scope_type: fScopeType as MessageAuto['scope_type'] || null,
        scope_id: fScopeId || null,
        scope_label: fScopeLabel || null,
        client_type_target: (showClientType ? fClientType : 'all') as MessageAuto['client_type_target'],
      });
      setTemplates((prev) => prev.map((t) => t.id === updated.id ? updated : t));
      addToast({ type: 'success', message: 'Template mis à jour.' });
      setShowEditModal(false);
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur modification.' });
    } finally { setFormLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer ce template ?')) return;
    try {
      await deleteMessageAuto(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      addToast({ type: 'success', message: 'Template supprimé.' });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur suppression.' });
    }
  };

  const clientTypeLabel: Record<string, string> = { all: 'Tous', new: 'Nouveau', returning: 'Fidèle' };
  const scopeBadge = (t: MessageAuto) => {
    if (!t.scope_type) return null;
    return (
      <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">
        {t.scope_label ?? t.scope_id}
      </span>
    );
  };

  const formFields = (
    <TemplateFormFields
      idPrefix="tpl" body={fBody} onBodyChange={setFBody}
      delai={fDelai} onDelaiChange={setFDelai}
      position={fPosition} onPositionChange={setFPosition}
      actif={fActif} onActifChange={setFActif}
      scopeType={fScopeType} onScopeTypeChange={setFScopeType}
      scopeId={fScopeId} onScopeIdChange={setFScopeId}
      scopeLabel={fScopeLabel} onScopeLabelChange={setFScopeLabel}
      clientTypeTarget={fClientType} onClientTypeTargetChange={setFClientType}
      showClientType={showClientType}
      postes={postes} channels={channels}
    />
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-700">Templates ({templates.length})</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void fetchTemplates()} title="Rafraîchir" className="p-1.5 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={openAdd} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
            <PlusCircle className="h-3.5 w-3.5" />
            Ajouter
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <EntityTable
          items={templates}
          loading={loading}
          emptyMessage="Aucun template configuré pour ce trigger."
          getRowKey={(t) => t.id}
          columns={[
            { header: '#', render: (t) => <span className="font-medium text-gray-500 w-6 text-center">{t.position}</span> },
            {
              header: 'Message',
              render: (t) => (
                <div>
                  <p className="max-w-xs truncate text-sm text-gray-800">{t.body}</p>
                  {scopeBadge(t)}
                </div>
              ),
            },
            ...(showClientType ? [{
              header: 'Cible',
              render: (t: MessageAuto) => (
                <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700">
                  {clientTypeLabel[t.client_type_target ?? 'all']}
                </span>
              ),
            }] : []),
            {
              header: 'Délai',
              render: (t) => <span className="text-xs text-gray-500">{t.delai ? `${t.delai}s` : 'Global'}</span>,
            },
            {
              header: 'Actif',
              render: (t) => (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${t.actif ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                  {t.actif ? 'Oui' : 'Non'}
                </span>
              ),
            },
            {
              header: 'Créé',
              render: (t) => <span className="text-xs text-gray-400">{formatDateShort(t.createdAt)}</span>,
            },
            {
              header: 'Actions',
              render: (t) => (
                <div className="flex items-center gap-1">
                  {showKeywords && (
                    <button
                      type="button"
                      onClick={() => setKeywordTarget(t)}
                      title="Gérer les mots-clés"
                      className="rounded p-1.5 text-blue-500 hover:bg-blue-50"
                    >
                      <Tag className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={() => openEdit(t)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50">
                    <Edit className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => void handleDelete(t.id)} className="rounded p-1.5 text-red-500 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>

      <EntityFormModal isOpen={showAddModal} title="Ajouter un template" onClose={() => setShowAddModal(false)} onSubmit={handleAdd} loading={formLoading} submitLabel="Ajouter" loadingLabel="Ajout...">
        {formFields}
      </EntityFormModal>
      <EntityFormModal isOpen={showEditModal && !!current} title="Modifier le template" onClose={() => { setShowEditModal(false); setCurrent(null); }} onSubmit={handleEdit} loading={formLoading} submitLabel="Sauvegarder" loadingLabel="Sauvegarde...">
        {formFields}
      </EntityFormModal>

      {keywordTarget && (
        <KeywordManagerModal
          template={keywordTarget}
          onClose={() => setKeywordTarget(null)}
          onUpdate={(updated) => {
            setTemplates((prev) => prev.map((t) => t.id === updated.id ? updated : t));
          }}
        />
      )}
    </div>
  );
}

// ─── MessageAutoView ──────────────────────────────────────────────────────────

interface MessageAutoViewProps {
  onRefresh?: () => void;
}

export default function MessageAutoView({ onRefresh: _onRefresh }: MessageAutoViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('master');

  const activeTabDef = TRIGGER_TABS.find((t) => t.key === activeTab)!;

  return (
    <div className="space-y-4">
      {/* ─── Onglets ──────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-1 rounded-xl bg-gray-100 p-1">
          {TRIGGER_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Description de l'onglet ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        {React.createElement(activeTabDef.icon, { className: 'h-4 w-4 text-gray-400 flex-shrink-0' })}
        <span>{activeTabDef.description}</span>
      </div>

      {/* ─── Contenu ──────────────────────────────────────────────────────── */}
      {activeTab === 'master' && activeTabDef.cronKey && (
        <div className="space-y-4">
          <TriggerCronConfigCard
            cronKey={activeTabDef.cronKey}
            hasThreshold={null}
            isMaster
          />
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            <p className="font-semibold mb-1">Fonctionnement du CRON maître</p>
            <p>Ce CRON s&apos;exécute à l&apos;intervalle défini et vérifie tous les triggers actifs (A à I). Pour activer/désactiver un trigger spécifique, accédez à son onglet. Les templates sont sélectionnés par priorité : <strong>Poste &gt; Canal &gt; Global</strong>, avec tirage aléatoire au sein du groupe prioritaire.</p>
          </div>
        </div>
      )}

      {activeTab !== 'master' && activeTab !== 'sequence' && activeTabDef.cronKey && (
        <TriggerCronConfigCard
          cronKey={activeTabDef.cronKey}
          hasThreshold={activeTabDef.hasThreshold}
        />
      )}

      {activeTab === 'out_of_hours' && (
        <BusinessHoursPanel />
      )}

      {activeTab !== 'master' && (
        <TemplatePanel
          trigger={activeTab as AutoMessageTriggerType}
          showClientType={activeTabDef.hasClientType}
          showKeywords={activeTabDef.hasKeywords}
        />
      )}
    </div>
  );
}
