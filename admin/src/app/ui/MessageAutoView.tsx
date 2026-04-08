"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Edit, PlusCircle, Trash2, RefreshCw, CheckCircle2, PauseCircle, Settings } from 'lucide-react';
import { formatDateShort } from '@/app/lib/dateUtils';
import { MessageAuto, AutoMessageScopeConfig, AutoMessageScopeType, CronConfig, UpdateCronConfigPayload } from '@/app/lib/definitions';
import {
  createMessageAuto,
  deleteMessageAuto,
  getMessageAuto,
  updateMessageAuto,
  getScopeConfigs,
  upsertScopeConfig,
  deleteScopeConfig,
  getCronConfigs,
  updateCronConfig,
  getPostes,
  getChannels,
} from '@/app/lib/api';
import { Poste, Channel } from '@/app/lib/definitions';
import { useCrudResource } from '@/app/hooks/useCrudResource';
import { EntityTable } from '@/app/ui/crud/EntityTable';
import { EntityFormModal } from '@/app/ui/crud/EntityFormModal';
import { useToast } from '@/app/ui/ToastProvider';

interface MessageAutoViewProps {
  onRefresh?: () => void;
}

type AutoMessageChannel = 'whatsapp' | 'sms' | 'email';

// ─── Formulaire partagé ajout/édition ─────────────────────────────────────────

interface MessageAutoFormFieldsProps {
  body: string;
  onBodyChange: (v: string) => void;
  delai: number | undefined;
  onDelaiChange: (v: number | undefined) => void;
  canal: AutoMessageChannel | undefined;
  onCanalChange: (v: AutoMessageChannel | undefined) => void;
  position: number;
  onPositionChange: (v: number) => void;
  actif: boolean;
  onActifChange: (v: boolean) => void;
  idPrefix: string;
}

function MessageAutoFormFields({
  body, onBodyChange,
  delai, onDelaiChange,
  canal, onCanalChange,
  position, onPositionChange,
  actif, onActifChange,
  idPrefix,
}: MessageAutoFormFieldsProps) {
  return (
    <>
      <div className="mb-4">
        <label htmlFor={`${idPrefix}-body`} className="mb-2 block text-sm font-bold text-gray-700">
          Corps du message
        </label>
        <textarea
          id={`${idPrefix}-body`}
          rows={4}
          className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder="Ex: Bonjour #name#, comment puis-je vous aider ?"
          required
        />
        <p className="mt-1 text-xs text-gray-400">
          Placeholders : <code className="rounded bg-gray-100 px-1">#name#</code> → prénom du client,{' '}
          <code className="rounded bg-gray-100 px-1">#numero#</code> → numéro de téléphone
        </p>
      </div>
      <div className="mb-4">
        <label htmlFor={`${idPrefix}-delai`} className="mb-2 block text-sm font-bold text-gray-700">
          Délai (secondes) — 0 ou vide = utiliser les délais globaux
        </label>
        <input
          type="number"
          id={`${idPrefix}-delai`}
          min={0}
          className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
          value={delai ?? ''}
          onChange={(e) =>
            onDelaiChange(e.target.value ? Number.parseInt(e.target.value, 10) : undefined)
          }
        />
      </div>
      <div className="mb-4">
        <label htmlFor={`${idPrefix}-canal`} className="mb-2 block text-sm font-bold text-gray-700">
          Canal
        </label>
        <select
          id={`${idPrefix}-canal`}
          className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
          value={canal ?? ''}
          onChange={(e) =>
            onCanalChange(e.target.value ? (e.target.value as AutoMessageChannel) : undefined)
          }
        >
          <option value="">Tous les canaux</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
        </select>
      </div>
      <div className="mb-4">
        <label htmlFor={`${idPrefix}-position`} className="mb-2 block text-sm font-bold text-gray-700">
          Position (ordre d&apos;envoi, min. 1)
        </label>
        <input
          type="number"
          id={`${idPrefix}-position`}
          min={1}
          className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
          value={position}
          onChange={(e) => onPositionChange(Number.parseInt(e.target.value || '1', 10))}
          required
        />
      </div>
      <div className="mb-4 flex items-center">
        <input
          type="checkbox"
          id={`${idPrefix}-actif`}
          className="mr-2 leading-tight"
          checked={actif}
          onChange={(e) => onActifChange(e.target.checked)}
        />
        <label htmlFor={`${idPrefix}-actif`} className="text-sm font-bold text-gray-700">
          Actif
        </label>
      </div>
    </>
  );
}

// ─── Panneau config globale ───────────────────────────────────────────────────

function GlobalConfigPanel() {
  const { addToast } = useToast();
  const [config, setConfig] = useState<CronConfig | null>(null);
  const [toggling, setToggling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [delayMin, setDelayMin] = useState(300);
  const [delayMax, setDelayMax] = useState(540);
  const [maxSteps, setMaxSteps] = useState(3);

  const load = useCallback(async () => {
    try {
      const all = await getCronConfigs();
      const found = all.find((c) => c.key === 'auto-message') ?? null;
      if (found) {
        setConfig(found);
        setDelayMin(found.delayMinSeconds ?? 300);
        setDelayMax(found.delayMaxSeconds ?? 540);
        setMaxSteps(found.maxSteps ?? 3);
      }
    } catch {
      // silently ignore — not critical
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = async () => {
    if (!config) return;
    setToggling(true);
    try {
      const updated = await updateCronConfig(config.key, { enabled: !config.enabled });
      setConfig(updated);
      addToast({
        type: updated.enabled ? 'success' : 'info',
        message: `Messages automatiques ${updated.enabled ? 'activés' : 'désactivés'} globalement.`,
      });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur.' });
    } finally {
      setToggling(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const payload: UpdateCronConfigPayload = {
        delayMinSeconds: delayMin,
        delayMaxSeconds: delayMax,
        maxSteps,
      };
      const updated = await updateCronConfig(config.key, payload);
      setConfig(updated);
      addToast({ type: 'success', message: 'Configuration mise à jour.' });
      setShowDetails(false);
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur sauvegarde.' });
    } finally {
      setSaving(false);
    }
  };

  if (!config) return null;

  const enabled = config.enabled;

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
              Messages automatiques {enabled ? 'activés' : 'désactivés'} globalement
            </p>
            <p className="text-xs text-gray-500">
              {enabled
                ? `Délai : ${config.delayMinSeconds ?? 300}–${config.delayMaxSeconds ?? 540}s · Max ${config.maxSteps ?? 3} étape(s)`
                : 'Aucun message automatique ne sera envoyé.'
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            title="Configurer les délais et étapes"
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
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
              enabled ? 'bg-emerald-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {showDetails && (
        <div className="border-t border-gray-200 px-4 py-4 bg-white rounded-b-xl">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Délais & étapes</p>
          <p className="mb-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            Ces paramètres sont <strong>autoritaires</strong> : ils s&apos;appliquent à tous les messages auto, même si un délai spécifique est défini sur le template. Le délai est tiré aléatoirement entre Min et Max à chaque envoi.
          </p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Délai min (s)</label>
              <input
                type="number" min={1} value={delayMin}
                onChange={(e) => setDelayMin(Number(e.target.value))}
                className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Délai max (s)</label>
              <input
                type="number" min={1} value={delayMax}
                onChange={(e) => setDelayMax(Number(e.target.value))}
                className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Étapes max</label>
              <input
                type="number" min={1} max={20} value={maxSteps}
                onChange={(e) => setMaxSteps(Number(e.target.value))}
                className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none"
              />
            </div>
          </div>
          <p className="mb-3 text-xs text-gray-400">
            Note : les messages auto ne se déclenchent que si le commercial n&apos;a jamais répondu sur ce chat.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowDetails(false)}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void handleSaveDetails()}
              disabled={saving}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MessageAutoView ──────────────────────────────────────────────────────────

export default function MessageAutoView({ onRefresh }: MessageAutoViewProps) {
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const { addToast } = useToast();

  // ─── Messages auto CRUD ───────────────────────────────────────────────────

  const {
    items: messagesAuto,
    setItems,
    loading,
    clearStatus,
    create,
    update,
    remove,
  } = useCrudResource<
    MessageAuto,
    {
      body: string;
      delai?: number;
      canal?: AutoMessageChannel;
      position: number;
      actif: boolean;
    },
    Partial<MessageAuto>
  >({
    initialItems: [],
    onRefresh: () => refreshRef.current(),
    createItem: createMessageAuto,
    updateItem: updateMessageAuto,
    deleteItem: deleteMessageAuto,
    getId: (item) => item.id,
  });

  const fetchData = useCallback(async () => {
    const data = await getMessageAuto();
    setItems(data);
  }, [setItems]);

  refreshRef.current = fetchData;

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentMessageAuto, setCurrentMessageAuto] = useState<MessageAuto | null>(null);
  const [formBody, setFormBody] = useState('');
  const [formDelai, setFormDelai] = useState<number | undefined>(undefined);
  const [formCanal, setFormCanal] = useState<AutoMessageChannel | undefined>(undefined);
  const [formPosition, setFormPosition] = useState(1);
  const [formActif, setFormActif] = useState(true);

  const openAddModal = () => {
    setFormBody('');
    setFormDelai(undefined);
    setFormCanal(undefined);
    setFormPosition(1);
    setFormActif(true);
    clearStatus();
    setShowAddModal(true);
  };

  const openEditModal = (message: MessageAuto) => {
    setCurrentMessageAuto(message);
    setFormBody(message.body);
    setFormDelai(message.delai ?? undefined);
    setFormCanal((message.canal as AutoMessageChannel | null) ?? undefined);
    setFormPosition(message.position);
    setFormActif(message.actif);
    clearStatus();
    setShowEditModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    clearStatus();
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setCurrentMessageAuto(null);
    clearStatus();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await create(
      {
        body: formBody,
        delai: formDelai,
        canal: formCanal,
        position: formPosition,
        actif: formActif,
      },
      'Message automatique ajouté.',
    );
    if (result.ok) closeAddModal();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMessageAuto) return;
    const result = await update(
      currentMessageAuto.id,
      {
        body: formBody,
        delai: formDelai,
        canal: formCanal,
        position: formPosition,
        actif: formActif,
      },
      'Message automatique mis à jour.',
    );
    if (result.ok) closeEditModal();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer ce message automatique ?')) return;
    await remove(id, 'Message automatique supprimé.');
  };

  // ─── Scope configs ────────────────────────────────────────────────────────

  const [scopes, setScopes] = useState<AutoMessageScopeConfig[]>([]);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [editingScope, setEditingScope] = useState<AutoMessageScopeConfig | null>(null);
  const [scopeType, setScopeType] = useState<AutoMessageScopeType>('poste');
  const [scopeId, setScopeId] = useState('');
  const [scopeLabel, setScopeLabel] = useState('');
  const [scopeEnabled, setScopeEnabled] = useState(false);
  const [scopeSaving, setScopeSaving] = useState(false);

  // Données pour les selects du modal scope
  const [postesList, setPostesList] = useState<Poste[]>([]);
  const [channelsList, setChannelsList] = useState<Channel[]>([]);
  const [scopeDataLoading, setScopeDataLoading] = useState(false);

  const fetchScopes = useCallback(async () => {
    try {
      setScopeLoading(true);
      const data = await getScopeConfigs();
      setScopes(data);
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erreur chargement scopes.',
      });
    } finally {
      setScopeLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void fetchScopes();
  }, [fetchScopes]);

  const loadScopeData = useCallback(async () => {
    setScopeDataLoading(true);
    try {
      const [p, c] = await Promise.all([getPostes(), getChannels()]);
      setPostesList(p);
      setChannelsList(c);
    } catch {
      // silently ignore
    } finally {
      setScopeDataLoading(false);
    }
  }, []);

  const openScopeAddModal = () => {
    setEditingScope(null);
    setScopeType('poste');
    setScopeId('');
    setScopeLabel('');
    setScopeEnabled(false);
    setShowScopeModal(true);
    void loadScopeData();
  };

  const openScopeEditModal = (scope: AutoMessageScopeConfig) => {
    setEditingScope(scope);
    setScopeType(scope.scope_type);
    setScopeId(scope.scope_id);
    setScopeLabel(scope.label ?? '');
    setScopeEnabled(scope.enabled);
    setShowScopeModal(true);
    void loadScopeData();
  };

  const handleScopeTypeChange = (type: AutoMessageScopeType) => {
    setScopeType(type);
    setScopeId('');
    setScopeLabel('');
  };

  const closeScopeModal = () => {
    setShowScopeModal(false);
    setEditingScope(null);
  };

  const handleScopeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scopeId.trim()) return;
    try {
      setScopeSaving(true);
      const saved = await upsertScopeConfig({
        scope_type: scopeType,
        scope_id: scopeId.trim(),
        label: scopeLabel.trim() || undefined,
        enabled: scopeEnabled,
      });
      setScopes((prev) => {
        const idx = prev.findIndex((s) => s.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      addToast({ type: 'success', message: 'Restriction scope sauvegardée.' });
      closeScopeModal();
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erreur sauvegarde scope.',
      });
    } finally {
      setScopeSaving(false);
    }
  };

  const handleScopeDelete = async (id: string) => {
    if (!window.confirm('Supprimer cette restriction de scope ?')) return;
    try {
      await deleteScopeConfig(id);
      setScopes((prev) => prev.filter((s) => s.id !== id));
      addToast({ type: 'success', message: 'Restriction scope supprimée.' });
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erreur suppression scope.',
      });
    }
  };

  const scopeTypeLabel: Record<AutoMessageScopeType, string> = {
    poste: 'Poste',
    canal: 'Canal',
    provider: 'Provider',
  };

  return (
    <div className="space-y-6">

      {/* ─── Config globale ──────────────────────────────────────────────────── */}
      <GlobalConfigPanel />

      {/* ─── Header messages auto ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Gestion des Messages Automatiques</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchData()}
            title="Rafraîchir"
            aria-label="Rafraîchir"
            className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            disabled={loading}
          >
            <PlusCircle className="h-4 w-4" />
            Ajouter un message auto
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <EntityTable
          items={messagesAuto}
          loading={loading}
          emptyMessage="Aucun message automatique trouvé."
          getRowKey={(msg) => msg.id}
          columns={[
            {
              header: 'Position',
              render: (msg) => (
                <span className="font-medium text-gray-900">{msg.position}</span>
              ),
            },
            {
              header: 'Corps du message',
              render: (msg) => (
                <span className="max-w-xs truncate text-gray-700">{msg.body}</span>
              ),
            },
            {
              header: 'Délai (s)',
              render: (msg) => <span className="text-gray-700">{msg.delai ?? 'Global'}</span>,
            },
            {
              header: 'Canal',
              render: (msg) => <span className="text-gray-700">{msg.canal ?? 'Tous'}</span>,
            },
            {
              header: 'Actif',
              render: (msg) => (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    msg.actif
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {msg.actif ? 'Oui' : 'Non'}
                </span>
              ),
            },
            {
              header: 'Créé le',
              render: (msg) => (
                <span className="text-sm text-gray-500">
                  {formatDateShort(msg.createdAt)}
                </span>
              ),
            },
            {
              header: 'Actions',
              render: (msg) => (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(msg)}
                    className="rounded p-1 text-blue-600 hover:bg-blue-50"
                    disabled={loading}
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => void handleDelete(msg.id)}
                    className="rounded p-1 text-red-600 hover:bg-red-50"
                    disabled={loading}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>

      {/* ─── Scope configs ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Restrictions par scope
            </h3>
            <p className="text-xs text-gray-400">
              Désactiver les messages auto pour un poste, un canal ou un provider spécifique.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchScopes()}
              title="Rafraîchir scopes"
              aria-label="Rafraîchir scopes"
              className="p-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={openScopeAddModal}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Ajouter
            </button>
          </div>
        </div>

        {scopeLoading ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">Chargement...</p>
        ) : scopes.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            Aucune restriction configurée. Les messages auto s&apos;appliquent à tous les scopes.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">ID / Valeur</th>
                  <th className="px-4 py-2">Label</th>
                  <th className="px-4 py-2">État</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scopes.map((scope) => (
                  <tr key={scope.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                        {scopeTypeLabel[scope.scope_type]}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-700 max-w-[180px] truncate">
                      {scope.scope_id}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{scope.label ?? '-'}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          scope.enabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {scope.enabled ? 'Actif' : 'Désactivé'}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openScopeEditModal(scope)}
                          className="rounded p-1 text-blue-600 hover:bg-blue-50"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => void handleScopeDelete(scope.id)}
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Modal message auto — ajout ────────────────────────────────────── */}
      <EntityFormModal
        isOpen={showAddModal}
        title="Ajouter un nouveau message automatique"
        onClose={closeAddModal}
        onSubmit={handleAdd}
        loading={loading}
        submitLabel="Ajouter"
        loadingLabel="Ajout en cours..."
      >
        <MessageAutoFormFields
          idPrefix="add"
          body={formBody} onBodyChange={setFormBody}
          delai={formDelai} onDelaiChange={setFormDelai}
          canal={formCanal} onCanalChange={setFormCanal}
          position={formPosition} onPositionChange={setFormPosition}
          actif={formActif} onActifChange={setFormActif}
        />
      </EntityFormModal>

      {/* ─── Modal message auto — édition ──────────────────────────────────── */}
      <EntityFormModal
        isOpen={showEditModal && !!currentMessageAuto}
        title="Modifier le message automatique"
        onClose={closeEditModal}
        onSubmit={handleUpdate}
        loading={loading}
        submitLabel="Sauvegarder"
        loadingLabel="Sauvegarde en cours..."
      >
        <MessageAutoFormFields
          idPrefix="edit"
          body={formBody} onBodyChange={setFormBody}
          delai={formDelai} onDelaiChange={setFormDelai}
          canal={formCanal} onCanalChange={setFormCanal}
          position={formPosition} onPositionChange={setFormPosition}
          actif={formActif} onActifChange={setFormActif}
        />
      </EntityFormModal>

      {/* ─── Modal scope config ─────────────────────────────────────────────── */}
      <EntityFormModal
        isOpen={showScopeModal}
        title={editingScope ? 'Modifier la restriction scope' : 'Ajouter une restriction scope'}
        onClose={closeScopeModal}
        onSubmit={handleScopeSubmit}
        loading={scopeSaving}
        submitLabel={editingScope ? 'Sauvegarder' : 'Ajouter'}
        loadingLabel="Sauvegarde en cours..."
      >
        <div className="mb-4">
          <label htmlFor="scope-type" className="mb-2 block text-sm font-bold text-gray-700">
            Type de scope
          </label>
          <select
            id="scope-type"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={scopeType}
            onChange={(e) => handleScopeTypeChange(e.target.value as AutoMessageScopeType)}
          >
            <option value="poste">Poste</option>
            <option value="canal">Canal</option>
            <option value="provider">Provider</option>
          </select>
        </div>

        <div className="mb-4">
          <label htmlFor="scope-id" className="mb-2 block text-sm font-bold text-gray-700">
            {scopeType === 'poste' && 'Poste'}
            {scopeType === 'canal' && 'Canal'}
            {scopeType === 'provider' && 'Provider'}
          </label>

          {scopeDataLoading ? (
            <div className="w-full rounded border px-3 py-2 text-sm text-gray-400 bg-gray-50">
              Chargement...
            </div>
          ) : scopeType === 'poste' ? (
            <select
              id="scope-id"
              className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
              value={scopeId}
              onChange={(e) => {
                const poste = postesList.find((p) => p.id === e.target.value);
                setScopeId(e.target.value);
                setScopeLabel(poste?.name ?? '');
              }}
              required
            >
              <option value="">-- Sélectionner un poste --</option>
              {postesList.map((poste) => (
                <option key={poste.id} value={poste.id}>
                  {poste.name}
                </option>
              ))}
            </select>
          ) : scopeType === 'canal' ? (
            <select
              id="scope-id"
              className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
              value={scopeId}
              onChange={(e) => {
                const channel = channelsList.find((c) => c.id === e.target.value);
                setScopeId(e.target.value);
                setScopeLabel(channel?.label || channel?.channel_id || '');
              }}
              required
            >
              <option value="">-- Sélectionner un canal --</option>
              {channelsList.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.label
                    ? `${channel.label} (${channel.channel_id})`
                    : channel.channel_id}
                </option>
              ))}
            </select>
          ) : (
            <select
              id="scope-id"
              className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
              value={scopeId}
              onChange={(e) => {
                setScopeId(e.target.value);
                setScopeLabel(e.target.value === 'whapi' ? 'Whapi' : e.target.value === 'meta' ? 'Meta' : '');
              }}
              required
            >
              <option value="">-- Sélectionner un provider --</option>
              <option value="whapi">Whapi</option>
              <option value="meta">Meta</option>
            </select>
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="scope-label" className="mb-2 block text-sm font-bold text-gray-700">
            Label <span className="font-normal text-gray-400">(optionnel — rempli automatiquement)</span>
          </label>
          <input
            type="text"
            id="scope-label"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={scopeLabel}
            onChange={(e) => setScopeLabel(e.target.value)}
            placeholder="Ex: Poste support — désactivé"
          />
        </div>
        <div className="mb-4 flex items-center justify-between rounded-lg border border-gray-200 p-3">
          <div>
            <p className="text-sm font-bold text-gray-700">Messages auto actifs pour ce scope</p>
            <p className="text-xs text-gray-500">
              Désactiver = bloquer les messages auto pour ce scope même si actif globalement.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={scopeEnabled}
            onClick={() => setScopeEnabled((v) => !v)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
              scopeEnabled ? 'bg-emerald-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                scopeEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </EntityFormModal>
    </div>
  );
}
