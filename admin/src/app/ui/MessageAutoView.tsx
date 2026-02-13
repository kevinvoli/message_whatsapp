"use client";

import React, { useState } from 'react';
import { Edit, PlusCircle, Trash2 } from 'lucide-react';
import { MessageAuto } from '@/app/lib/definitions';
import { createMessageAuto, deleteMessageAuto, updateMessageAuto } from '@/app/lib/api';
import { useCrudResource } from '@/app/hooks/useCrudResource';
import { EntityTable } from '@/app/ui/crud/EntityTable';
import { EntityFormModal } from '@/app/ui/crud/EntityFormModal';

interface MessageAutoViewProps {
  initialMessagesAuto: MessageAuto[];
  onMessageAutoUpdated: () => Promise<void> | void;
}

type AutoMessageChannel = 'whatsapp' | 'sms' | 'email';

export default function MessageAutoView({
  initialMessagesAuto,
  onMessageAutoUpdated,
}: MessageAutoViewProps) {
  const {
    items: messagesAuto,
    loading,
    error,
    success,
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
    initialItems: initialMessagesAuto,
    onRefresh: onMessageAutoUpdated,
    createItem: createMessageAuto,
    updateItem: updateMessageAuto,
    deleteItem: deleteMessageAuto,
    getId: (item) => item.id,
  });

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
    if (!window.confirm('Are you sure you want to delete this automated message?')) return;
    await remove(id, 'Message automatique supprime.');
  };

  return (
    <div className="space-y-6">
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

      {error && (
        <div
          className="relative rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700"
          role="alert"
        >
          <strong className="font-bold">Error:</strong>
          <span className="sm:inline"> {error}</span>
        </div>
      )}
      {success && (
        <div
          className="relative rounded border border-green-400 bg-green-100 px-4 py-3 text-green-700"
          role="status"
        >
          {success}
        </div>
      )}

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
                  {new Date(msg.created_at || msg.createdAt || Date.now()).toLocaleDateString()}
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

      <EntityFormModal
        isOpen={showAddModal}
        title="Ajouter un nouveau message automatique"
        onClose={closeAddModal}
        onSubmit={handleAdd}
        loading={loading}
        error={error}
        submitLabel="Ajouter"
        loadingLabel="Adding..."
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
            Delai (secondes)
          </label>
          <input
            type="number"
            id="delai"
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
            Position
          </label>
          <input
            type="number"
            id="position"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formPosition}
            onChange={(e) => setFormPosition(Number.parseInt(e.target.value || '0', 10))}
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

      <EntityFormModal
        isOpen={showEditModal && !!currentMessageAuto}
        title="Modifier le message automatique"
        onClose={closeEditModal}
        onSubmit={handleUpdate}
        loading={loading}
        error={error}
        submitLabel="Sauvegarder"
        loadingLabel="Saving..."
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
            Delai (secondes)
          </label>
          <input
            type="number"
            id="edit-delai"
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
            Position
          </label>
          <input
            type="number"
            id="edit-position"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formPosition}
            onChange={(e) => setFormPosition(Number.parseInt(e.target.value || '0', 10))}
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
    </div>
  );
}
