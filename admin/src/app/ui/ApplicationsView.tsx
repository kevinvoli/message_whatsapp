"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Edit, PlusCircle, Trash2, RefreshCw, Info, X, Globe } from 'lucide-react';
import { formatDateShort } from '@/app/lib/dateUtils';
import { Channel, MessagingApplication } from '@/app/lib/definitions';
import {
  createApplication,
  deleteApplication,
  getApplications,
  getApplicationChannels,
  updateApplication,
} from '@/app/lib/api/applications.api';
import { useCrudResource } from '@/app/hooks/useCrudResource';
import { EntityTable } from '@/app/ui/crud/EntityTable';
import { EntityFormModal } from '@/app/ui/crud/EntityFormModal';
import { useToast } from '@/app/ui/ToastProvider';

type AppCreateInput = {
  label: string;
  provider?: string;
  appId: string;
  appSecret: string;
  systemToken?: string;
};

const PROVIDER_LABELS: Record<string, string> = {
  meta:      'WhatsApp (Meta)',
  messenger: 'Messenger',
  instagram: 'Instagram',
};

const PROVIDER_BADGE: Record<string, string> = {
  meta:      'bg-emerald-100 text-emerald-800',
  messenger: 'bg-blue-100 text-blue-800',
  instagram: 'bg-purple-100 text-purple-800',
};

export default function ApplicationsView() {
  const { addToast } = useToast();
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const { items: apps, setItems, loading, clearStatus, create, update, remove } =
    useCrudResource<MessagingApplication, AppCreateInput, Partial<AppCreateInput>>({
      initialItems: [],
      onRefresh: () => refreshRef.current(),
      createItem: (data) => createApplication(data),
      updateItem: (id, data) => updateApplication(id, data),
      deleteItem: deleteApplication,
      getId: (item) => item.id,
    });

  const fetchData = useCallback(async () => {
    try {
      const data = await getApplications();
      setItems(data);
    } catch {
      addToast({ type: 'error', message: 'Impossible de charger les applications.' });
    }
  }, [setItems, addToast]);

  refreshRef.current = fetchData;

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── Formulaire ──────────────────────────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentApp, setCurrentApp] = useState<MessagingApplication | null>(null);
  const [formLabel, setFormLabel] = useState('');
  const [formProvider, setFormProvider] = useState('meta');
  const [formAppId, setFormAppId] = useState('');
  const [formAppSecret, setFormAppSecret] = useState('');
  const [formSystemToken, setFormSystemToken] = useState('');

  // ── Modal canaux liés ────────────────────────────────────────────────────────
  const [channelsModal, setChannelsModal] = useState<{ app: MessagingApplication; channels: Channel[] } | null>(null);
  const [channelsModalLoading, setChannelsModalLoading] = useState(false);

  const openChannelsModal = async (app: MessagingApplication) => {
    setChannelsModal({ app, channels: [] });
    setChannelsModalLoading(true);
    try {
      const channels = await getApplicationChannels(app.id);
      setChannelsModal({ app, channels });
    } catch {
      addToast({ type: 'error', message: 'Impossible de charger les canaux liés.' });
      setChannelsModal(null);
    } finally {
      setChannelsModalLoading(false);
    }
  };

  // ── Handlers CRUD ─────────────────────────────────────────────────────────
  const resetForm = () => {
    setFormLabel('');
    setFormProvider('meta');
    setFormAppId('');
    setFormAppSecret('');
    setFormSystemToken('');
  };

  const openAddModal = () => { resetForm(); clearStatus(); setShowAddModal(true); };

  const openEditModal = (app: MessagingApplication) => {
    setCurrentApp(app);
    setFormLabel(app.label);
    setFormProvider(app.provider ?? 'meta');
    setFormAppId(app.appId);
    setFormAppSecret('');
    setFormSystemToken('');
    clearStatus();
    setShowEditModal(true);
  };

  const closeAddModal = () => { setShowAddModal(false); clearStatus(); };
  const closeEditModal = () => { setShowEditModal(false); setCurrentApp(null); clearStatus(); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: AppCreateInput = {
      label: formLabel.trim(),
      provider: formProvider,
      appId: formAppId.trim(),
      appSecret: formAppSecret.trim(),
      systemToken: formSystemToken.trim() || undefined,
    };
    const result = await create(payload, 'Application créée.');
    if (result.ok) closeAddModal();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentApp) return;
    const payload: Partial<AppCreateInput> = {
      label: formLabel.trim(),
      provider: formProvider,
      appId: formAppId.trim(),
    };
    if (formAppSecret.trim()) payload.appSecret = formAppSecret.trim();
    if (formSystemToken.trim()) payload.systemToken = formSystemToken.trim();
    const result = await update(currentApp.id, payload, 'Application mise à jour.');
    if (result.ok) closeEditModal();
  };

  const handleDelete = async (app: MessagingApplication) => {
    if ((app.channelCount ?? 0) > 0) {
      addToast({
        type: 'error',
        message: `Impossible de supprimer "${app.label}" : ${app.channelCount} canal(aux) y sont liés. Détachez-les d'abord.`,
      });
      return;
    }
    if (!window.confirm(`Supprimer l'application "${app.label}" ?`)) return;
    await remove(app.id, 'Application supprimée.');
  };

  const inputClass = 'w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none';
  const labelClass = 'mb-2 block text-sm font-bold text-gray-700';

  const formFields = (idPrefix: string, isEdit: boolean) => (
    <>
      <div className="mb-4">
        <label htmlFor={`${idPrefix}-label`} className={labelClass}>
          Nom de l&apos;application <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id={`${idPrefix}-label`}
          className={inputClass}
          placeholder="Ex: App Meta Production"
          value={formLabel}
          onChange={(e) => setFormLabel(e.target.value)}
          required
        />
      </div>
      <div className="mb-4">
        <label htmlFor={`${idPrefix}-provider`} className={labelClass}>
          Provider
        </label>
        <select
          id={`${idPrefix}-provider`}
          className={inputClass}
          value={formProvider}
          onChange={(e) => setFormProvider(e.target.value)}
        >
          <option value="meta">WhatsApp (Meta Cloud API)</option>
          <option value="messenger">Facebook Messenger</option>
          <option value="instagram">Instagram Direct</option>
        </select>
      </div>
      <div className="mb-4">
        <label htmlFor={`${idPrefix}-app-id`} className={labelClass}>
          App ID <span className="text-red-500">*</span>
          <span className="ml-1 font-normal text-gray-400 text-xs">(identifiant de l&apos;app Meta Developer)</span>
        </label>
        <input
          type="text"
          id={`${idPrefix}-app-id`}
          className={inputClass}
          placeholder="Ex: 123456789012345"
          value={formAppId}
          onChange={(e) => setFormAppId(e.target.value)}
          required
        />
      </div>
      <div className="mb-4">
        <label htmlFor={`${idPrefix}-app-secret`} className={labelClass}>
          App Secret {!isEdit && <span className="text-red-500">*</span>}
          {isEdit && <span className="ml-1 font-normal text-gray-400 text-xs">(laisser vide pour conserver l&apos;actuel)</span>}
        </label>
        <input
          type="password"
          id={`${idPrefix}-app-secret`}
          className={inputClass}
          placeholder={isEdit ? '••••••••' : "Clé secrète de l'app Meta..."}
          value={formAppSecret}
          onChange={(e) => setFormAppSecret(e.target.value)}
          required={!isEdit}
        />
      </div>
      <div className="mb-4">
        <label htmlFor={`${idPrefix}-system-token`} className={labelClass}>
          System User Token
          <span className="ml-1 font-normal text-gray-400 text-xs">(optionnel — token permanent Business Manager)</span>
        </label>
        <input
          type="password"
          id={`${idPrefix}-system-token`}
          className={inputClass}
          placeholder={isEdit ? '••••••••  (laisser vide pour conserver)' : 'Token System User...'}
          value={formSystemToken}
          onChange={(e) => setFormSystemToken(e.target.value)}
        />
        <p className="mt-1 text-xs text-emerald-700 bg-emerald-50 rounded px-3 py-2">
          Si renseigné, tous les canaux liés utiliseront ce token permanent (ne expire jamais).
        </p>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => void fetchData()}
          title="Rafraîchir"
          aria-label="Rafraîchir"
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Applications Meta</h2>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          disabled={loading}
        >
          <PlusCircle className="h-4 w-4" />
          Ajouter une application
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <Info className="h-4 w-4 flex-shrink-0" />
        <span>
          Une application centralise les credentials Meta (App ID, App Secret, System User Token optionnel).
          Lors de la création d&apos;un canal, sélectionnez une application pour hériter de ses credentials automatiquement.
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <EntityTable
          items={apps}
          loading={loading}
          emptyMessage="Aucune application trouvée."
          getRowKey={(app) => app.id}
          columns={[
            {
              header: 'Nom',
              render: (app) => (
                <span className="font-semibold text-gray-900">{app.label}</span>
              ),
            },
            {
              header: 'Provider',
              render: (app) => (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PROVIDER_BADGE[app.provider] ?? 'bg-gray-100 text-gray-700'}`}>
                  {PROVIDER_LABELS[app.provider] ?? app.provider}
                </span>
              ),
            },
            {
              header: 'App ID',
              render: (app) => (
                <span className="font-mono text-xs text-gray-700">{app.appId}</span>
              ),
            },
            {
              header: 'Canaux liés',
              render: (app) => {
                const count = app.channelCount ?? 0;
                if (count === 0) {
                  return <span className="text-xs text-gray-400 italic">Aucun canal</span>;
                }
                return (
                  <button
                    type="button"
                    onClick={() => void openChannelsModal(app)}
                    className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800 hover:bg-violet-200 transition-colors"
                    title="Voir les canaux liés"
                  >
                    <Globe className="h-3 w-3" />
                    {count} canal{count !== 1 ? 'x' : ''}
                  </button>
                );
              },
            },
            {
              header: 'Créé le',
              render: (app) => (
                <span className="text-sm text-gray-500">{formatDateShort(app.createdAt)}</span>
              ),
            },
            {
              header: 'Actions',
              render: (app) => (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(app)}
                    className="rounded p-1 text-blue-600 hover:bg-blue-50"
                    disabled={loading}
                    title="Modifier"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => void handleDelete(app)}
                    className={`rounded p-1 ${(app.channelCount ?? 0) > 0 ? 'text-gray-300 cursor-not-allowed' : 'text-red-600 hover:bg-red-50'}`}
                    disabled={loading || (app.channelCount ?? 0) > 0}
                    title={(app.channelCount ?? 0) > 0 ? `${app.channelCount} canal(aux) lié(s) — détachez-les d'abord` : 'Supprimer'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>

      {/* ── Modal canaux liés ─────────────────────────────────────────────── */}
      {channelsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Canaux liés à &laquo;{channelsModal.app.label}&raquo;
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">App ID : {channelsModal.app.appId}</p>
              </div>
              <button
                onClick={() => setChannelsModal(null)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto px-6 py-4">
              {channelsModalLoading ? (
                <p className="py-6 text-center text-sm text-gray-400">Chargement…</p>
              ) : channelsModal.channels.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">Aucun canal lié.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {channelsModal.channels.map((ch) => (
                    <li key={ch.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {ch.label ?? <span className="italic text-gray-400">Sans nom</span>}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-gray-500">
                          {ch.external_id || ch.channel_id || ch.id}
                        </p>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PROVIDER_BADGE[ch.provider ?? ''] ?? 'bg-gray-100 text-gray-700'}`}>
                        {PROVIDER_LABELS[ch.provider ?? ''] ?? ch.provider ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-gray-100 px-6 py-4 text-right">
              <button
                onClick={() => setChannelsModal(null)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      <EntityFormModal
        isOpen={showAddModal}
        title="Ajouter une application Meta"
        onClose={closeAddModal}
        onSubmit={handleAdd}
        loading={loading}
        submitLabel="Créer"
        loadingLabel="Création..."
      >
        {formFields('add', false)}
      </EntityFormModal>

      <EntityFormModal
        isOpen={showEditModal && !!currentApp}
        title="Modifier l'application"
        onClose={closeEditModal}
        onSubmit={handleUpdate}
        loading={loading}
        submitLabel="Sauvegarder"
        loadingLabel="Enregistrement..."
      >
        {formFields('edit', true)}
      </EntityFormModal>
    </div>
  );
}
