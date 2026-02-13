"use client";

import React, { useState } from 'react';
import { Edit, PlusCircle, Trash2 } from 'lucide-react';
import { Channel } from '@/app/lib/definitions';
import { createChannel, deleteChannel, updateChannel } from '@/app/lib/api';
import { useCrudResource } from '@/app/hooks/useCrudResource';
import { EntityTable } from '@/app/ui/crud/EntityTable';
import { EntityFormModal } from '@/app/ui/crud/EntityFormModal';

interface ChannelsViewProps {
  initialChannels: Channel[];
  onChannelUpdated: () => Promise<void> | void;
}

export default function ChannelsView({
  initialChannels,
  onChannelUpdated,
}: ChannelsViewProps) {
  const { items: channels, loading, clearStatus, create, update, remove } =
    useCrudResource<Channel, { token: string }, Partial<Channel>>({
      initialItems: initialChannels,
      onRefresh: onChannelUpdated,
      createItem: createChannel,
      updateItem: updateChannel,
      deleteItem: deleteChannel,
      getId: (item) => item.id,
    });

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [formToken, setFormToken] = useState('');
  const [formIsBusiness, setFormIsBusiness] = useState(false);

  const openAddModal = () => {
    setFormToken('');
    setFormIsBusiness(false);
    clearStatus();
    setShowAddModal(true);
  };

  const openEditModal = (channel: Channel) => {
    setCurrentChannel(channel);
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
    const result = await create({ token: formToken }, 'Canal ajoute.');
    if (result.ok) closeAddModal();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentChannel) return;
    const result = await update(
      currentChannel.id,
      { token: formToken, is_business: formIsBusiness },
      'Canal mis a jour.',
    );
    if (result.ok) closeEditModal();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this channel?')) return;
    await remove(id, 'Canal supprime.');
  };

  return (
    <div className="space-y-6">
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
              header: 'Channel ID',
              render: (channel) => (
                <span className="font-medium text-gray-900">{channel.channel_id}</span>
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
                  {new Date(channel.createdAt).toLocaleDateString()}
                </span>
              ),
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


