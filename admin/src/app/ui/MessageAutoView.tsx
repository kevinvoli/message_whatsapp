"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Edit, PlusCircle, Trash2, RefreshCw } from 'lucide-react';
import { formatDateShort } from '@/app/lib/dateUtils';
import { MessageAuto, AutoMessageScopeConfig, AutoMessageScopeType } from '@/app/lib/definitions';
import {
  createMessageAuto,
  deleteMessageAuto,
  getMessageAuto,
  updateMessageAuto,
  getScopeConfigs,
  upsertScopeConfig,
  deleteScopeConfig,
} from '@/app/lib/api';
import { useCrudResource } from '@/app/hooks/useCrudResource';
import { EntityTable } from '@/app/ui/crud/EntityTable';
import { EntityFormModal } from '@/app/ui/crud/EntityFormModal';
import { useToast } from '@/app/ui/ToastProvider';

interface MessageAutoViewProps {
  onRefresh?: () => void;
}

type AutoMessageChannel = 'whatsapp' | 'sms' | 'email';

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
  const [formPosition, setFormPosition] = useState(0);
  const [formActif, setFormActif] = useState(true);

  const openAddModal = () => {
    setFormBody('');
    setFormDelai(undefined);
    setFormCanal(undefined);
    setFormPosition(0);
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
      'Message automatique ajoute.',
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
      'Message automatique mis a jour.',
    );
    if (result.ok) closeEditModal();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer ce message automatique ?')) return;
    await remove(id, 'Message automatique supprime.');
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

  const openScopeAddModal = () => {
    setEditingScope(null);
    setScopeType('poste');
    setScopeId('');
    setScopeLabel('');
    setScopeEnabled(false);
    setShowScopeModal(true);
  };

  const openScopeEditModal = (scope: AutoMessageScopeConfig) => {
    setEditingScope(scope);
    setScopeType(scope.scope_type);
    setScopeId(scope.scope_id);
    setScopeLabel(scope.label ?? '');
    setScopeEnabled(scope.enabled);
    setShowScopeModal(true);
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
      addToast({ type: 'success', message: 'Restriction scope sauvegardee.' });
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
      addToast({ type: 'success', message: 'Restriction scope supprimee.' });
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
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => void fetchData()}
          title="Rafraichir"
          aria-label="Rafraichir"
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ─── Messages auto ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Gestion des Messages Automatiques</h2>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          disabled={loading}
        >
          <PlusCircle className="h-4 w-4" />
          Ajouter un message auto
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <EntityTable
          items={messagesAuto}
          loading={loading}
          emptyMessage="Aucun message automatique trouve."
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
              header: 'Delai (s)',
              render: (msg) => <span className="text-gray-700">{msg.delai ?? 'N/A'}</span>,
            },
            {
              header: 'Canal',
              render: (msg) => <span className="text-gray-700">{msg.canal ?? 'N/A'}</span>,
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
              header: 'Cree le',
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
                    onClick={() => handleDelete(msg.id)}
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
              Desactiver les messages auto pour un poste, un canal ou un provider specifique.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchScopes()}
              title="Rafraichir scopes"
              aria-label="Rafraichir scopes"
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
            Aucune restriction configuree. Les messages auto s&apos;appliquent a tous les scopes.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">ID / Valeur</th>
                  <th className="px-4 py-2">Label</th>
                  <th className="px-4 py-2">Etat</th>
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
                        {scope.enabled ? 'Actif' : 'Desactive'}
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
                          onClick={() => handleScopeDelete(scope.id)}
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
        <div className="mb-4">
          <label htmlFor="body" className="mb-2 block text-sm font-bold text-gray-700">
            Corps du message
          </label>
          <textarea
            id="body"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formBody}
            onChange={(e) => setFormBody(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="delai" className="mb-2 block text-sm font-bold text-gray-700">
            Delai (secondes) — 0 = utiliser les delais globaux
          </label>
          <input
            type="number"
            id="delai"
            min={0}
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formDelai ?? ''}
            onChange={(e) =>
              setFormDelai(e.target.value ? Number.parseInt(e.target.value, 10) : undefined)
            }
          />
        </div>
        <div className="mb-4">
          <label htmlFor="canal" className="mb-2 block text-sm font-bold text-gray-700">
            Canal
          </label>
          <select
            id="canal"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formCanal ?? ''}
            onChange={(e) =>
              setFormCanal(e.target.value ? (e.target.value as AutoMessageChannel) : undefined)
            }
          >
            <option value="">Selectionner un canal</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div className="mb-4">
          <label htmlFor="position" className="mb-2 block text-sm font-bold text-gray-700">
            Position (ordre d&apos;envoi, min. 1)
          </label>
          <input
            type="number"
            id="position"
            min={1}
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formPosition}
            onChange={(e) => setFormPosition(Number.parseInt(e.target.value || '1', 10))}
            required
          />
        </div>
        <div className="mb-4 flex items-center">
          <input
            type="checkbox"
            id="actif"
            className="mr-2 leading-tight"
            checked={formActif}
            onChange={(e) => setFormActif(e.target.checked)}
          />
          <label htmlFor="actif" className="text-sm font-bold text-gray-700">
            Actif
          </label>
        </div>
      </EntityFormModal>

      {/* ─── Modal message auto — edition ──────────────────────────────────── */}
      <EntityFormModal
        isOpen={showEditModal && !!currentMessageAuto}
        title="Modifier le message automatique"
        onClose={closeEditModal}
        onSubmit={handleUpdate}
        loading={loading}
        submitLabel="Sauvegarder"
        loadingLabel="Sauvegarde en cours..."
      >
        <div className="mb-4">
          <label htmlFor="edit-body" className="mb-2 block text-sm font-bold text-gray-700">
            Corps du message
          </label>
          <textarea
            id="edit-body"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formBody}
            onChange={(e) => setFormBody(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="edit-delai" className="mb-2 block text-sm font-bold text-gray-700">
            Delai (secondes) — 0 = utiliser les delais globaux
          </label>
          <input
            type="number"
            id="edit-delai"
            min={0}
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formDelai ?? ''}
            onChange={(e) =>
              setFormDelai(e.target.value ? Number.parseInt(e.target.value, 10) : undefined)
            }
          />
        </div>
        <div className="mb-4">
          <label htmlFor="edit-canal" className="mb-2 block text-sm font-bold text-gray-700">
            Canal
          </label>
          <select
            id="edit-canal"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formCanal ?? ''}
            onChange={(e) =>
              setFormCanal(e.target.value ? (e.target.value as AutoMessageChannel) : undefined)
            }
          >
            <option value="">Selectionner un canal</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div className="mb-4">
          <label htmlFor="edit-position" className="mb-2 block text-sm font-bold text-gray-700">
            Position (ordre d&apos;envoi, min. 1)
          </label>
          <input
            type="number"
            id="edit-position"
            min={1}
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formPosition}
            onChange={(e) => setFormPosition(Number.parseInt(e.target.value || '1', 10))}
            required
          />
        </div>
        <div className="mb-4 flex items-center">
          <input
            type="checkbox"
            id="edit-actif"
            className="mr-2 leading-tight"
            checked={formActif}
            onChange={(e) => setFormActif(e.target.checked)}
          />
          <label htmlFor="edit-actif" className="text-sm font-bold text-gray-700">
            Actif
          </label>
        </div>
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
            onChange={(e) => setScopeType(e.target.value as AutoMessageScopeType)}
          >
            <option value="poste">Poste</option>
            <option value="canal">Canal</option>
            <option value="provider">Provider</option>
          </select>
        </div>
        <div className="mb-4">
          <label htmlFor="scope-id" className="mb-2 block text-sm font-bold text-gray-700">
            {scopeType === 'poste' && 'ID du poste (UUID)'}
            {scopeType === 'canal' && 'ID du canal'}
            {scopeType === 'provider' && 'Provider (ex: whapi, meta)'}
          </label>
          <input
            type="text"
            id="scope-id"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            required
            placeholder={
              scopeType === 'poste'
                ? 'uuid-du-poste'
                : scopeType === 'canal'
                ? 'channel_id'
                : 'whapi ou meta'
            }
          />
        </div>
        <div className="mb-4">
          <label htmlFor="scope-label" className="mb-2 block text-sm font-bold text-gray-700">
            Label (optionnel)
          </label>
          <input
            type="text"
            id="scope-label"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={scopeLabel}
            onChange={(e) => setScopeLabel(e.target.value)}
            placeholder="Ex: Poste support — desactive"
          />
        </div>
        <div className="mb-4 flex items-center justify-between rounded-lg border border-gray-200 p-3">
          <div>
            <p className="text-sm font-bold text-gray-700">Messages auto actifs pour ce scope</p>
            <p className="text-xs text-gray-500">
              Desactiver = bloquer les messages auto pour ce scope meme si actif globalement.
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
