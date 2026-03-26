"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Edit, PlusCircle, Trash2, RefreshCw, Info } from 'lucide-react';
import { formatDateShort } from '@/app/lib/dateUtils';
import { Channel, ProviderType } from '@/app/lib/definitions';
import { createChannel, deleteChannel, getChannels, refreshChannelToken, updateChannel } from '@/app/lib/api';
import { useCrudResource } from '@/app/hooks/useCrudResource';
import { EntityTable } from '@/app/ui/crud/EntityTable';
import { EntityFormModal } from '@/app/ui/crud/EntityFormModal';
import { useToast } from '@/app/ui/ToastProvider';

interface ChannelsViewProps {
  onRefresh?: () => void;
}

type ChannelCreateInput = {
  token: string;
  label?: string;
  provider?: ProviderType;
  channel_id?: string;
  external_id?: string;
  is_business?: boolean;
  meta_app_id?: string;
  meta_app_secret?: string;
  verify_token?: string;
};

const PROVIDER_CONFIG: Record<ProviderType, { label: string; badgeClass: string }> = {
  whapi:     { label: 'WhatsApp (Whapi)', badgeClass: 'bg-green-100 text-green-800' },
  meta:      { label: 'WhatsApp (Meta)',  badgeClass: 'bg-emerald-100 text-emerald-800' },
  messenger: { label: 'Messenger',        badgeClass: 'bg-blue-100 text-blue-800' },
  instagram: { label: 'Instagram',        badgeClass: 'bg-purple-100 text-purple-800' },
  telegram:  { label: 'Telegram',         badgeClass: 'bg-sky-100 text-sky-800' },
};

const HAS_TOKEN_EXPIRY: ProviderType[] = ['meta', 'messenger', 'instagram'];

function getTokenExpiryLabel(expiresAt: string | null | undefined): string {
  if (!expiresAt) return 'Inconnue';
  const date = new Date(expiresAt);
  const daysLeft = Math.floor((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return `Expiré (il y a ${Math.abs(daysLeft)}j)`;
  return `dans ${daysLeft}j (${formatDateShort(expiresAt)})`;
}

function getTokenExpiryClass(expiresAt: string | null | undefined): string {
  if (!expiresAt) return 'text-gray-400';
  const daysLeft = Math.floor((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 7) return 'text-red-600 font-semibold';
  if (daysLeft < 14) return 'text-orange-500 font-semibold';
  return 'text-green-600';
}

const META_ACCOUNT_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  ACTIVE:     { label: 'Actif',      cls: 'bg-green-100 text-green-800' },
  FLAGGED:    { label: 'Signalé',    cls: 'bg-yellow-100 text-yellow-800' },
  RESTRICTED: { label: 'Restreint', cls: 'bg-orange-100 text-orange-800' },
  DISABLED:   { label: 'Désactivé', cls: 'bg-red-100 text-red-800' },
  BANNED:     { label: 'Banni',     cls: 'bg-red-200 text-red-900' },
};

function MetaAccountStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const cfg = META_ACCOUNT_STATUS_CONFIG[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function ProviderBadge({ provider }: { provider: ProviderType | null | undefined }) {
  const p = provider ?? 'whapi';
  const cfg = PROVIDER_CONFIG[p];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.badgeClass}`}>
      {cfg.label}
    </span>
  );
}

// ─── Champs dynamiques selon provider ────────────────────────────────────────

interface DynamicFieldsProps {
  provider: ProviderType;
  channelId: string;
  externalId: string;
  isBusiness: boolean;
  metaAppId: string;
  metaAppSecret: string;
  verifyToken: string;
  idPrefix: string;
  onChannelId: (v: string) => void;
  onExternalId: (v: string) => void;
  onIsBusiness: (v: boolean) => void;
  onMetaAppId: (v: string) => void;
  onMetaAppSecret: (v: string) => void;
  onVerifyToken: (v: string) => void;
}

function MetaCredentialsFields({
  metaAppId, metaAppSecret, idPrefix, onMetaAppId, onMetaAppSecret,
}: Pick<DynamicFieldsProps, 'metaAppId' | 'metaAppSecret' | 'idPrefix' | 'onMetaAppId' | 'onMetaAppSecret'>) {
  const inputClass = 'w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none';
  const labelClass = 'mb-2 block text-sm font-bold text-gray-700';
  return (
    <div className="mb-4 rounded border border-blue-100 bg-blue-50 p-3 space-y-3">
      <p className="text-xs font-semibold text-blue-700">Credentials de l&apos;application Meta</p>
      <div>
        <label htmlFor={`${idPrefix}-meta-app-id`} className={labelClass}>
          App ID <span className="text-red-500">*</span>
          <span className="ml-1 font-normal text-gray-400 text-xs">(identifiant de l&apos;app Meta Developer)</span>
        </label>
        <input
          type="text"
          id={`${idPrefix}-meta-app-id`}
          className={inputClass}
          placeholder="Ex: 123456789012345"
          value={metaAppId}
          onChange={(e) => onMetaAppId(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-meta-app-secret`} className={labelClass}>
          App Secret <span className="text-red-500">*</span>
          <span className="ml-1 font-normal text-gray-400 text-xs">(clé secrète de l&apos;app Meta)</span>
        </label>
        <input
          type="password"
          id={`${idPrefix}-meta-app-secret`}
          className={inputClass}
          placeholder="App Secret..."
          value={metaAppSecret}
          onChange={(e) => onMetaAppSecret(e.target.value)}
          required
        />
      </div>
    </div>
  );
}

function VerifyTokenField({
  verifyToken, idPrefix, onVerifyToken,
}: { verifyToken: string; idPrefix: string; onVerifyToken: (v: string) => void }) {
  const inputClass = 'w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none';
  const labelClass = 'mb-2 block text-sm font-bold text-gray-700';
  return (
    <div className="mb-4">
      <label htmlFor={`${idPrefix}-verify-token`} className={labelClass}>
        Verify Token <span className="text-red-500">*</span>
        <span className="ml-1 font-normal text-gray-400 text-xs">(token à saisir dans Meta Developer Console → Webhook)</span>
      </label>
      <input
        type="text"
        id={`${idPrefix}-verify-token`}
        className={inputClass}
        placeholder="Ex: mon_token_webhook_secret"
        value={verifyToken}
        onChange={(e) => onVerifyToken(e.target.value)}
        required
      />
    </div>
  );
}

function DynamicFields({
  provider, channelId, externalId, isBusiness, metaAppId, metaAppSecret, verifyToken, idPrefix,
  onChannelId, onExternalId, onIsBusiness, onMetaAppId, onMetaAppSecret, onVerifyToken,
}: DynamicFieldsProps) {
  const inputClass = 'w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none';
  const labelClass = 'mb-2 block text-sm font-bold text-gray-700';

  if (provider === 'meta') {
    return (
      <>
        <div className="mb-4">
          <label htmlFor={`${idPrefix}-channel-id`} className={labelClass}>
            Phone Number ID <span className="text-red-500">*</span>
            <span className="ml-1 font-normal text-gray-400 text-xs">(phone_number_id dans l&apos;API Meta)</span>
          </label>
          <input
            type="text"
            id={`${idPrefix}-channel-id`}
            className={inputClass}
            placeholder="Ex: 123456789012345"
            value={channelId}
            onChange={(e) => onChannelId(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor={`${idPrefix}-external-id`} className={labelClass}>
            Numéro de téléphone
            <span className="ml-1 font-normal text-gray-400 text-xs">(optionnel, ex: +2250700000000)</span>
          </label>
          <input
            type="text"
            id={`${idPrefix}-external-id`}
            className={inputClass}
            placeholder="Ex: +2250700000000"
            value={externalId}
            onChange={(e) => onExternalId(e.target.value)}
          />
        </div>
        <MetaCredentialsFields
          metaAppId={metaAppId} metaAppSecret={metaAppSecret}
          idPrefix={idPrefix} onMetaAppId={onMetaAppId} onMetaAppSecret={onMetaAppSecret}
        />
        <VerifyTokenField verifyToken={verifyToken} idPrefix={idPrefix} onVerifyToken={onVerifyToken} />
        <div className="mb-4 flex items-center gap-2 rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <Info className="h-3 w-3 flex-shrink-0" />
          Le token sera échangé contre un token long-lived automatiquement.
        </div>
      </>
    );
  }

  if (provider === 'messenger') {
    return (
      <>
        <div className="mb-4">
          <label htmlFor={`${idPrefix}-external-id`} className={labelClass}>
            Page ID <span className="text-red-500">*</span>
            <span className="ml-1 font-normal text-gray-400 text-xs">(ID de la page Facebook)</span>
          </label>
          <input
            type="text"
            id={`${idPrefix}-external-id`}
            className={inputClass}
            placeholder="Ex: 123456789"
            value={externalId}
            onChange={(e) => onExternalId(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor={`${idPrefix}-channel-id`} className={labelClass}>
            Identifiant de page (channel_id) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id={`${idPrefix}-channel-id`}
            className={inputClass}
            placeholder="Ex: 987654321"
            value={channelId}
            onChange={(e) => onChannelId(e.target.value)}
            required
          />
        </div>
        <MetaCredentialsFields
          metaAppId={metaAppId} metaAppSecret={metaAppSecret}
          idPrefix={idPrefix} onMetaAppId={onMetaAppId} onMetaAppSecret={onMetaAppSecret}
        />
        <VerifyTokenField verifyToken={verifyToken} idPrefix={idPrefix} onVerifyToken={onVerifyToken} />
        <div className="mb-4 flex items-center gap-2 rounded bg-blue-50 px-3 py-2 text-xs text-blue-700">
          <Info className="h-3 w-3 flex-shrink-0" />
          Le token de page sera échangé contre un token long-lived automatiquement.
        </div>
      </>
    );
  }

  if (provider === 'instagram') {
    return (
      <>
        <div className="mb-4">
          <label htmlFor={`${idPrefix}-external-id`} className={labelClass}>
            Instagram Account ID <span className="text-red-500">*</span>
            <span className="ml-1 font-normal text-gray-400 text-xs">(IGSID du compte professionnel)</span>
          </label>
          <input
            type="text"
            id={`${idPrefix}-external-id`}
            className={inputClass}
            placeholder="Ex: 17841400000000000"
            value={externalId}
            onChange={(e) => onExternalId(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor={`${idPrefix}-channel-id`} className={labelClass}>
            Identifiant business (channel_id) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id={`${idPrefix}-channel-id`}
            className={inputClass}
            placeholder="Ex: 987654321"
            value={channelId}
            onChange={(e) => onChannelId(e.target.value)}
            required
          />
        </div>
        <MetaCredentialsFields
          metaAppId={metaAppId} metaAppSecret={metaAppSecret}
          idPrefix={idPrefix} onMetaAppId={onMetaAppId} onMetaAppSecret={onMetaAppSecret}
        />
        <VerifyTokenField verifyToken={verifyToken} idPrefix={idPrefix} onVerifyToken={onVerifyToken} />
        <div className="mb-4 flex items-center gap-2 rounded bg-orange-50 px-3 py-2 text-xs text-orange-700">
          <Info className="h-3 w-3 flex-shrink-0" />
          Instagram ne supporte pas l&apos;envoi d&apos;audio ni de documents. Le token sera échangé automatiquement.
        </div>
      </>
    );
  }

  if (provider === 'telegram') {
    return (
      <div className="mb-4 flex items-center gap-2 rounded bg-sky-50 px-3 py-2 text-xs text-sky-700">
        <Info className="h-3 w-3 flex-shrink-0" />
        Le token est validé via @BotFather et le webhook est enregistré automatiquement.
      </div>
    );
  }

  // whapi
  return null;
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ChannelsView({ onRefresh }: ChannelsViewProps) {
  const { addToast } = useToast();
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const { items: channels, setItems, loading, clearStatus, create, update, remove } =
    useCrudResource<Channel, ChannelCreateInput, Partial<Channel>>({
      initialItems: [],
      onRefresh: () => refreshRef.current(),
      createItem: createChannel,
      updateItem: updateChannel,
      deleteItem: deleteChannel,
      getId: (item) => item.id,
    });

  const fetchData = useCallback(async () => {
    const data = await getChannels();
    setItems(data);
  }, [setItems]);

  refreshRef.current = fetchData;

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [formProvider, setFormProvider] = useState<ProviderType>('whapi');
  const [formLabel, setFormLabel] = useState('');
  const [formChannelId, setFormChannelId] = useState('');
  const [formExternalId, setFormExternalId] = useState('');
  const [formToken, setFormToken] = useState('');
  const [formIsBusiness, setFormIsBusiness] = useState(false);
  const [formMetaAppId, setFormMetaAppId] = useState('');
  const [formMetaAppSecret, setFormMetaAppSecret] = useState('');
  const [formVerifyToken, setFormVerifyToken] = useState('');

  const buildPayload = (): ChannelCreateInput => {
    const base: ChannelCreateInput = {
      token: formToken,
      label: formLabel.trim() || undefined,
      provider: formProvider,
    };
    const metaCredentials = {
      meta_app_id: formMetaAppId.trim() || undefined,
      meta_app_secret: formMetaAppSecret.trim() || undefined,
      verify_token: formVerifyToken.trim() || undefined,
    };
    if (formProvider === 'meta') {
      return {
        ...base,
        ...metaCredentials,
        channel_id: formChannelId.trim(),
        external_id: formExternalId.trim() || formChannelId.trim(),
        is_business: true,
      };
    }
    if (formProvider === 'messenger' || formProvider === 'instagram') {
      return {
        ...base,
        ...metaCredentials,
        external_id: formExternalId.trim(),
        channel_id: formChannelId.trim(),
      };
    }
    // whapi, telegram
    return base;
  };

  const resetFormState = () => {
    setFormLabel('');
    setFormChannelId('');
    setFormExternalId('');
    setFormToken('');
    setFormIsBusiness(false);
    setFormMetaAppId('');
    setFormMetaAppSecret('');
    setFormVerifyToken('');
  };

  const openAddModal = () => {
    setFormProvider('whapi');
    resetFormState();
    clearStatus();
    setShowAddModal(true);
  };

  const openEditModal = (channel: Channel) => {
    setCurrentChannel(channel);
    setFormProvider(channel.provider ?? 'whapi');
    setFormLabel(channel.label ?? '');
    setFormChannelId(channel.channel_id ?? '');
    setFormExternalId(channel.external_id ?? '');
    setFormToken(channel.token);
    setFormIsBusiness(channel.is_business);
    setFormMetaAppId(channel.meta_app_id ?? '');
    setFormMetaAppSecret(channel.meta_app_secret ?? '');
    setFormVerifyToken(channel.verify_token ?? '');
    clearStatus();
    setShowEditModal(true);
  };

  const closeAddModal = () => { setShowAddModal(false); clearStatus(); };
  const closeEditModal = () => { setShowEditModal(false); setCurrentChannel(null); clearStatus(); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await create(buildPayload(), 'Canal ajouté.');
    if (result.ok) closeAddModal();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentChannel) return;
    const result = await update(currentChannel.id, buildPayload(), 'Canal mis à jour.');
    if (result.ok) closeEditModal();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer ce canal ?')) return;
    await remove(id, 'Canal supprimé.');
  };

  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const handleRefreshToken = async (id: string) => {
    setRefreshingId(id);
    try {
      const updated = await refreshChannelToken(id);
      setItems((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      addToast({ type: 'success', message: 'Token renouvelé avec succès.' });
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Échec du renouvellement du token.',
      });
    } finally {
      setRefreshingId(null);
    }
  };

  const inputClass = 'w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none';
  const labelClass = 'mb-2 block text-sm font-bold text-gray-700';

  const sharedFormFields = (idPrefix: string) => (
    <>
      <div className="mb-4">
        <label htmlFor={`${idPrefix}-label`} className={labelClass}>
          Nom / Label <span className="font-normal text-gray-400">(optionnel)</span>
        </label>
        <input
          type="text"
          id={`${idPrefix}-label`}
          className={inputClass}
          placeholder="Ex: Canal principal, Numéro Abidjan..."
          value={formLabel}
          onChange={(e) => setFormLabel(e.target.value)}
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
          onChange={(e) => setFormProvider(e.target.value as ProviderType)}
        >
          <option value="whapi">WhatsApp (Whapi)</option>
          <option value="meta">WhatsApp (Meta Cloud API)</option>
          <option value="messenger">Facebook Messenger</option>
          <option value="instagram">Instagram Direct</option>
          <option value="telegram">Telegram</option>
        </select>
      </div>
      <DynamicFields
        provider={formProvider}
        channelId={formChannelId}
        externalId={formExternalId}
        isBusiness={formIsBusiness}
        metaAppId={formMetaAppId}
        metaAppSecret={formMetaAppSecret}
        verifyToken={formVerifyToken}
        idPrefix={idPrefix}
        onChannelId={setFormChannelId}
        onExternalId={setFormExternalId}
        onIsBusiness={setFormIsBusiness}
        onMetaAppId={setFormMetaAppId}
        onMetaAppSecret={setFormMetaAppSecret}
        onVerifyToken={setFormVerifyToken}
      />
      <div className="mb-4">
        <label htmlFor={`${idPrefix}-token`} className={labelClass}>
          {formProvider === 'telegram' ? 'Token du bot' : 'Token d\'accès'} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id={`${idPrefix}-token`}
          className={inputClass}
          placeholder={formProvider === 'telegram' ? 'Ex: 1234567890:AAAA...' : 'Token...'}
          value={formToken}
          onChange={(e) => setFormToken(e.target.value)}
          required
        />
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
        <h2 className="text-xl font-semibold">Gestion des Canaux</h2>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          disabled={loading}
        >
          <PlusCircle className="h-4 w-4" />
          Ajouter un canal
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <EntityTable
          items={channels}
          loading={loading}
          emptyMessage="Aucun canal trouvé."
          getRowKey={(channel) => channel.id}
          columns={[
            {
              header: 'Nom',
              render: (channel) => (
                channel.label
                  ? <span className="font-semibold text-gray-900">{channel.label}</span>
                  : <span className="text-gray-400 italic text-xs">Sans nom</span>
              ),
            },
            {
              header: 'Provider',
              render: (channel) => (
                <div className="flex flex-col gap-1">
                  <ProviderBadge provider={channel.provider} />
                  {channel.provider === 'meta' && channel.meta_account_status && (
                    <MetaAccountStatusBadge status={channel.meta_account_status} />
                  )}
                </div>
              ),
            },
            {
              header: 'Identifiant',
              render: (channel) => {
                const id = channel.external_id || channel.channel_id || '-';
                return <span className="font-mono text-xs text-gray-700">{id}</span>;
              },
            },
            {
              header: 'Token (Partiel)',
              render: (channel) => (
                <span className="text-gray-700">
                  {channel.token ? `${channel.token.substring(0, 10)}...` : '-'}
                </span>
              ),
            },
            {
              header: 'Créé le',
              render: (channel) => (
                <span className="text-sm text-gray-500">
                  {formatDateShort(channel.createdAt)}
                </span>
              ),
            },
            {
              header: 'Expiration Token',
              render: (channel) => {
                const provider = channel.provider ?? 'whapi';
                if (!HAS_TOKEN_EXPIRY.includes(provider)) {
                  return <span className="text-gray-400 text-xs">N/A</span>;
                }
                return (
                  <span className={`text-sm ${getTokenExpiryClass(channel.tokenExpiresAt)}`}>
                    {getTokenExpiryLabel(channel.tokenExpiresAt)}
                  </span>
                );
              },
            },
            {
              header: 'Actions',
              render: (channel) => {
                const provider = channel.provider ?? 'whapi';
                return (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditModal(channel)}
                      className="rounded p-1 text-blue-600 hover:bg-blue-50"
                      disabled={loading}
                      title="Modifier"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    {HAS_TOKEN_EXPIRY.includes(provider) && (() => {
                      const missingCreds = !channel.meta_app_id || !channel.meta_app_secret;
                      return (
                        <button
                          onClick={() => void handleRefreshToken(channel.id)}
                          className={`rounded p-1 ${missingCreds ? 'text-gray-300 cursor-not-allowed' : 'text-green-600 hover:bg-green-50'}`}
                          disabled={loading || refreshingId === channel.id || missingCreds}
                          title={missingCreds ? 'App ID et App Secret requis — modifiez le canal pour les renseigner' : 'Renouveler le token'}
                        >
                          <RefreshCw className={`h-4 w-4 ${refreshingId === channel.id ? 'animate-spin' : ''}`} />
                        </button>
                      );
                    })()}
                    <button
                      onClick={() => handleDelete(channel.id)}
                      className="rounded p-1 text-red-600 hover:bg-red-50"
                      disabled={loading}
                      title="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              },
            },
          ]}
        />
      </div>

      <EntityFormModal
        isOpen={showAddModal}
        title="Ajouter un nouveau canal"
        onClose={closeAddModal}
        onSubmit={handleAdd}
        loading={loading}
        submitLabel="Ajouter"
        loadingLabel="Ajout en cours..."
      >
        {sharedFormFields('add')}
      </EntityFormModal>

      <EntityFormModal
        isOpen={showEditModal && !!currentChannel}
        title="Modifier le canal"
        onClose={closeEditModal}
        onSubmit={handleUpdate}
        loading={loading}
        submitLabel="Sauvegarder"
        loadingLabel="Enregistrement..."
      >
        {sharedFormFields('edit')}
      </EntityFormModal>
    </div>
  );
}
