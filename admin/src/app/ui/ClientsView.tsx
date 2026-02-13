"use client";

import React, { useState } from 'react';
import { Edit, MessageCircle, Trash2, UserPlus } from 'lucide-react';
import { Client } from '@/app/lib/definitions';
import { createClient, deleteClient, updateClient } from '@/app/lib/api';
import { useCrudResource } from '@/app/hooks/useCrudResource';
import { EntityTable } from '@/app/ui/crud/EntityTable';
import { EntityFormModal } from '@/app/ui/crud/EntityFormModal';

interface ClientsViewProps {
  initialClients: Client[];
  onClientUpdated: () => Promise<void> | void;
}

export default function ClientsView({
  initialClients,
  onClientUpdated,
}: ClientsViewProps) {
  const { items: clients, loading, error, success, clearStatus, create, update, remove } =
    useCrudResource<
      Client,
      { name: string; phone: string; chat_id?: string; is_active: boolean },
      Partial<Client>
    >({
      initialItems: initialClients,
      onRefresh: onClientUpdated,
      createItem: createClient,
      updateItem: updateClient,
      deleteItem: deleteClient,
      getId: (item) => item.id,
    });

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentClient, setCurrentClient] = useState<Client | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formChatId, setFormChatId] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  const openAddModal = () => {
    setFormName('');
    setFormPhone('');
    setFormChatId('');
    setFormIsActive(true);
    clearStatus();
    setShowAddModal(true);
  };

  const openEditModal = (client: Client) => {
    setCurrentClient(client);
    setFormName(client.name);
    setFormPhone(client.phone);
    setFormChatId(client.chat_id || '');
    setFormIsActive(client.is_active);
    clearStatus();
    setShowEditModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    clearStatus();
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setCurrentClient(null);
    clearStatus();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await create(
      {
        name: formName,
        phone: formPhone,
        chat_id: formChatId || undefined,
        is_active: formIsActive,
      },
      'Client ajoute.',
    );
    if (result.ok) closeAddModal();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClient) return;
    const result = await update(
      currentClient.id,
      {
        name: formName,
        phone: formPhone,
        chat_id: formChatId || undefined,
        is_active: formIsActive,
      },
      'Client mis a jour.',
    );
    if (result.ok) closeEditModal();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this client?')) return;
    await remove(id, 'Client supprime.');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Gestion des Clients</h2>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          disabled={loading}
        >
          <UserPlus className="h-4 w-4" />
          Ajouter un client
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
          items={clients}
          loading={loading}
          emptyMessage="Aucun client trouve."
          getRowKey={(client) => client.id}
          columns={[
            {
              header: 'Nom',
              render: (client) => (
                <span className="font-medium text-gray-900">{client.name}</span>
              ),
            },
            {
              header: 'Telephone',
              render: (client) => <span className="text-gray-700">{client.phone}</span>,
            },
            {
              header: 'Chat ID',
              render: (client) => <span className="text-gray-700">{client.chat_id || 'N/A'}</span>,
            },
            {
              header: 'nb Message',
              render: (client) => (
                <span className="text-gray-700">{client.messages?.length ?? 'N/A'}</span>
              ),
            },
            {
              header: 'Statut',
              render: (client) => (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    client.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {client.is_active ? 'Actif' : 'Inactif'}
                </span>
              ),
            },
            {
              header: 'Cree le',
              render: (client) => (
                <span className="text-sm text-gray-500">
                  {new Date(client.createdAt).toLocaleDateString()}
                </span>
              ),
            },
            {
              header: 'Actions',
              render: (client) => (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(client)}
                    className="rounded p-1 text-blue-600 hover:bg-blue-50"
                    disabled={loading}
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(client.id)}
                    className="rounded p-1 text-red-600 hover:bg-red-50"
                    disabled={loading}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button className="rounded p-1 text-blue-600 hover:bg-blue-50" disabled={loading}>
                    <MessageCircle className="h-4 w-4" />
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>

      <EntityFormModal
        isOpen={showAddModal}
        title="Ajouter un nouveau client"
        onClose={closeAddModal}
        onSubmit={handleAdd}
        loading={loading}
        error={error}
        submitLabel="Ajouter"
        loadingLabel="Adding..."
      >
        <div className="mb-4">
          <label htmlFor="name" className="mb-2 block text-sm font-bold text-gray-700">
            Nom
          </label>
          <input
            type="text"
            id="name"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="phone" className="mb-2 block text-sm font-bold text-gray-700">
            Telephone
          </label>
          <input
            type="text"
            id="phone"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formPhone}
            onChange={(e) => setFormPhone(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="chat_id" className="mb-2 block text-sm font-bold text-gray-700">
            Chat ID (Optionnel)
          </label>
          <input
            type="text"
            id="chat_id"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formChatId}
            onChange={(e) => setFormChatId(e.target.value)}
          />
        </div>
        <div className="mb-4 flex items-center">
          <input
            type="checkbox"
            id="is_active"
            className="mr-2 leading-tight"
            checked={formIsActive}
            onChange={(e) => setFormIsActive(e.target.checked)}
          />
          <label htmlFor="is_active" className="text-sm font-bold text-gray-700">
            Actif
          </label>
        </div>
      </EntityFormModal>

      <EntityFormModal
        isOpen={showEditModal && !!currentClient}
        title="Modifier le client"
        onClose={closeEditModal}
        onSubmit={handleUpdate}
        loading={loading}
        error={error}
        submitLabel="Sauvegarder"
        loadingLabel="Saving..."
      >
        <div className="mb-4">
          <label htmlFor="edit-name" className="mb-2 block text-sm font-bold text-gray-700">
            Nom
          </label>
          <input
            type="text"
            id="edit-name"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="edit-phone" className="mb-2 block text-sm font-bold text-gray-700">
            Telephone
          </label>
          <input
            type="text"
            id="edit-phone"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formPhone}
            onChange={(e) => setFormPhone(e.target.value)}
            required
          />
        </div>
        <div className="mb-4">
          <label htmlFor="edit-chat_id" className="mb-2 block text-sm font-bold text-gray-700">
            Chat ID (Optionnel)
          </label>
          <input
            type="text"
            id="edit-chat_id"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formChatId}
            onChange={(e) => setFormChatId(e.target.value)}
          />
        </div>
        <div className="mb-4 flex items-center">
          <input
            type="checkbox"
            id="edit-is_active"
            className="mr-2 leading-tight"
            checked={formIsActive}
            onChange={(e) => setFormIsActive(e.target.checked)}
          />
          <label htmlFor="edit-is_active" className="text-sm font-bold text-gray-700">
            Actif
          </label>
        </div>
      </EntityFormModal>
    </div>
  );
}
