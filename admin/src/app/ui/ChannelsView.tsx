"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Edit, PlusCircle, Trash2, RefreshCw } from 'lucide-react';
import { formatDateShort } from '@/app/lib/dateUtils';
import { Channel } from '@/app/lib/definitions';
import { createChannel, deleteChannel, getChannels, refreshChannelToken, updateChannel } from '@/app/lib/api';
import { useCrudResource } from '@/app/hooks/useCrudResource';
import { EntityTable } from '@/app/ui/crud/EntityTable';
import { EntityFormModal } from '@/app/ui/crud/EntityFormModal';

interface ChannelsViewProps {
  onRefresh?: () => void;
}

type ChannelCreateInput = {
  token: string;
  provider?: 'whapi' | 'meta';
  channel_id?: string;
  external_id?: string;
  is_business?: boolean;
};

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

export default function ChannelsView({ onRefresh }: ChannelsViewProps) {
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
  const [formProvider, setFormProvider] = useState<'whapi' | 'meta'>('whapi');
  const [formChannelId, setFormChannelId] = useState('');
  const [formExternalId, setFormExternalId] = useState('');
  const [formToken, setFormToken] = useState('');
  const [formIsBusiness, setFormIsBusiness] = useState(false);

  const buildPayload = (): ChannelCreateInput => {
    if (formProvider === 'meta') {
      const channelId = formChannelId.trim();
      const externalId = formExternalId.trim() || channelId;
      return {
        token: formToken,
        provider: 'meta',
        channel_id: channelId,
        external_id: externalId,
        is_business: formIsBusiness,
      };
    }
    return {
      token: formToken,
      provider: 'whapi',
      is_business: formIsBusiness,
    };
  };

  const openAddModal = () => {
    setFormProvider('whapi');
    setFormChannelId('');
    setFormExternalId('');
    setFormToken('');
    setFormIsBusiness(false);
    clearStatus();
    setShowAddModal(true);
  };

  const openEditModal = (channel: Channel) => {
    setCurrentChannel(channel);
    setFormProvider(channel.provider === 'meta' ? 'meta' : 'whapi');
    setFormChannelId(channel.channel_id ?? '');
    setFormExternalId(channel.external_id ?? '');
    setFormToken(channel.token);
    setFormIsBusiness(channel.is_business);
    clearStatus();
    setShowEditModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    clearStatus();
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setCurrentChannel(null);
    clearStatus();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await create(buildPayload(), 'Canal ajoute.');
    if (result.ok) closeAddModal();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentChannel) return;
    const result = await update(
      currentChannel.id,
      buildPayload(),
      'Canal mis a jour.',
    );
    if (result.ok) closeEditModal();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this channel?')) return;
    await remove(id, 'Canal supprime.');
  };

  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const handleRefreshToken = async (id: string) => {
    setRefreshingId(id);
    try {
      const updated = await refreshChannelToken(id);
      setItems((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch {
      // erreur visible via le retour de l'API
    } finally {
      setRefreshingId(null);
    }
  };

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
        <h2 className="text-xl font-semibold">Gestion des Canaux WHAPI</h2>
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
          emptyMessage="Aucun canal trouve."
          getRowKey={(channel) => channel.id}
          columns={[
            {
              header: 'Provider',
              render: (channel) => (
                <span className="text-gray-700">{channel.provider ?? 'whapi'}</span>
              ),
            },
            {
              header: 'Channel ID',
              render: (channel) => (
                <span className="font-medium text-gray-900">{channel.channel_id}</span>
              ),
            },
            {
              header: 'External ID',
              render: (channel) => (
                <span className="text-gray-700">{channel.external_id ?? '-'}</span>
              ),
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
              header: 'Business',
              render: (channel) => (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    channel.is_business
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {channel.is_business ? 'Oui' : 'Non'}
                </span>
              ),
            },
            {
              header: 'Version API',
              render: (channel) => <span className="text-gray-700">{channel.api_version}</span>,
            },
            {
              header: 'IP',
              render: (channel) => <span className="text-gray-700">{channel.ip}</span>,
            },
            {
              header: 'Cree le',
              render: (channel) => (
                <span className="text-sm text-gray-500">
                  {formatDateShort(channel.createdAt)}
                </span>
              ),
            },
            {
              header: 'Expiration Token',
              render: (channel) => {
                if (channel.provider !== 'meta') return <span className="text-gray-400">-</span>;
                return (
                  <span className={`text-sm ${getTokenExpiryClass(channel.tokenExpiresAt)}`}>
                    {getTokenExpiryLabel(channel.tokenExpiresAt)}
                  </span>
                );
              },
            },
            {
              header: 'Actions',
              render: (channel) => (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(channel)}
                    className="rounded p-1 text-blue-600 hover:bg-blue-50"
                    disabled={loading}
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  {channel.provider === 'meta' && (
                    <button
                      onClick={() => void handleRefreshToken(channel.id)}
                      className="rounded p-1 text-green-600 hover:bg-green-50"
                      disabled={loading || refreshingId === channel.id}
                      title="Renouveler le token Meta"
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshingId === channel.id ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(channel.id)}
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

      <EntityFormModal
        isOpen={showAddModal}
        title="Ajouter un nouveau canal"
        onClose={closeAddModal}
        onSubmit={handleAdd}
        loading={loading}
        submitLabel="Ajouter"
        loadingLabel="Adding..."
      >
        <div className="mb-4">
          <label htmlFor="provider" className="mb-2 block text-sm font-bold text-gray-700">
            Provider
          </label>
          <select
            id="provider"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formProvider}
            onChange={(e) => setFormProvider(e.target.value as 'whapi' | 'meta')}
          >
            <option value="whapi">whapi</option>
            <option value="meta">meta</option>
          </select>
        </div>
        {formProvider === 'meta' && (
          <>
            <div className="mb-4">
              <label htmlFor="channel-id" className="mb-2 block text-sm font-bold text-gray-700">
                Phone Number ID (channel_id)
              </label>
              <input
                type="text"
                id="channel-id"
                className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
                value={formChannelId}
                onChange={(e) => setFormChannelId(e.target.value)}
                required
              />
            </div>
            <div className="mb-4">
              <label htmlFor="external-id" className="mb-2 block text-sm font-bold text-gray-700">
                External ID (optionnel)
              </label>
              <input
                type="text"
                id="external-id"
                className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
                value={formExternalId}
                onChange={(e) => setFormExternalId(e.target.value)}
              />
            </div>
          </>
        )}
        <div className="mb-4">
          <label htmlFor="token" className="mb-2 block text-sm font-bold text-gray-700">
            Token
          </label>
          <input
            type="text"
            id="token"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formToken}
            onChange={(e) => setFormToken(e.target.value)}
            required
          />
        </div>
      </EntityFormModal>

      <EntityFormModal
        isOpen={showEditModal && !!currentChannel}
        title="Modifier le canal"
        onClose={closeEditModal}
        onSubmit={handleUpdate}
        loading={loading}
        submitLabel="Sauvegarder"
        loadingLabel="Saving..."
      >
        <div className="mb-4">
          <label htmlFor="edit-provider" className="mb-2 block text-sm font-bold text-gray-700">
            Provider
          </label>
          <select
            id="edit-provider"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formProvider}
            onChange={(e) => setFormProvider(e.target.value as 'whapi' | 'meta')}
          >
            <option value="whapi">whapi</option>
            <option value="meta">meta</option>
          </select>
        </div>
        {formProvider === 'meta' && (
          <>
            <div className="mb-4">
              <label htmlFor="edit-channel-id" className="mb-2 block text-sm font-bold text-gray-700">
                Phone Number ID (channel_id)
              </label>
              <input
                type="text"
                id="edit-channel-id"
                className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
                value={formChannelId}
                onChange={(e) => setFormChannelId(e.target.value)}
                required
              />
            </div>
            <div className="mb-4">
              <label htmlFor="edit-external-id" className="mb-2 block text-sm font-bold text-gray-700">
                External ID (optionnel)
              </label>
              <input
                type="text"
                id="edit-external-id"
                className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
                value={formExternalId}
                onChange={(e) => setFormExternalId(e.target.value)}
              />
            </div>
          </>
        )}
        <div className="mb-4">
          <label htmlFor="edit-token" className="mb-2 block text-sm font-bold text-gray-700">
            Token
          </label>
          <input
            type="text"
            id="edit-token"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formToken}
            onChange={(e) => setFormToken(e.target.value)}
            required
          />
        </div>
        <div className="mb-4 flex items-center">
          <input
            type="checkbox"
            id="edit-is_business"
            className="mr-2 leading-tight"
            checked={formIsBusiness}
            onChange={(e) => setFormIsBusiness(e.target.checked)}
          />
          <label htmlFor="edit-is_business" className="text-sm font-bold text-gray-700">
            Est Business
          </label>
        </div>
      </EntityFormModal>
    </div>
  );
}


