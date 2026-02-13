"use client";

import React, { useState } from 'react';
import { Edit, PlusCircle, Trash2 } from 'lucide-react';
import { createPoste, deletePoste, updatePoste } from '@/app/lib/api';
import { Poste } from '@/app/lib/definitions';
import { useCrudResource } from '@/app/hooks/useCrudResource';
import { EntityTable } from '@/app/ui/crud/EntityTable';
import { EntityFormModal } from '@/app/ui/crud/EntityFormModal';

interface PostesViewProps {
  initialPostes: Poste[];
  onPosteUpdated: () => Promise<void> | void;
}

export default function PostesView({
  initialPostes,
  onPosteUpdated,
}: PostesViewProps) {
  const {
    items: postes,
    loading,
    error,
    success,
    clearStatus,
    create,
    update,
    remove,
  } = useCrudResource<
    Poste,
    { name: string; code: string; is_active: boolean; chats: []; messages: []; commercial: [] },
    Partial<Poste>
  >({
    initialItems: initialPostes,
    onRefresh: onPosteUpdated,
    createItem: createPoste,
    updateItem: updatePoste,
    deleteItem: deletePoste,
    getId: (item) => item.id,
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentPoste, setCurrentPoste] = useState<Poste | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  const openAddModal = () => {
    setFormName('');
    setFormCode('');
    setFormIsActive(true);
    clearStatus();
    setShowAddModal(true);
  };

  const openEditModal = (poste: Poste) => {
    setCurrentPoste(poste);
    setFormName(poste.name);
    setFormCode(poste.code);
    setFormIsActive(poste.is_active);
    clearStatus();
    setShowEditModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    clearStatus();
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setCurrentPoste(null);
    clearStatus();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await create(
      {
        name: formName,
        code: formCode,
        is_active: formIsActive,
        chats: [],
        messages: [],
        commercial: [],
      },
      'Poste ajoute.',
    );
    if (result.ok) {
      closeAddModal();
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPoste) return;
    const result = await update(
      currentPoste.id,
      { name: formName, code: formCode, is_active: formIsActive },
      'Poste mis a jour.',
    );
    if (result.ok) {
      closeEditModal();
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this poste?')) return;
    await remove(id, 'Poste supprime.');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Gestion des Postes</h2>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          disabled={loading}
        >
          <PlusCircle className="h-4 w-4" />
          Ajouter un poste
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
          items={postes}
          loading={loading}
          emptyMessage="Aucun poste trouve."
          getRowKey={(poste) => poste.id}
          columns={[
            {
              header: 'Nom du Poste',
              render: (poste) => (
                <span className="font-medium text-gray-900">{poste.name}</span>
              ),
            },
            {
              header: 'Nb chats',
              render: (poste) => <span className="text-gray-700">{poste.chats?.length ?? 0}</span>,
            },
            {
              header: 'Nb sms',
              render: (poste) => <span className="text-gray-700">{poste.messages?.length ?? 0}</span>,
            },
            {
              header: 'Nb Agent',
              render: (poste) => (
                <span className="text-gray-700">{poste.commercial?.length ?? 0}</span>
              ),
            },
            {
              header: 'Code',
              render: (poste) => <span className="text-gray-700">{poste.code}</span>,
            },
            {
              header: 'Statut',
              render: (poste) => (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    poste.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {poste.is_active ? 'Actif' : 'Inactif'}
                </span>
              ),
            },
            {
              header: 'Cree le',
              render: (poste) => (
                <span className="text-sm text-gray-500">
                  {new Date(poste.created_at || poste.createdAt || Date.now()).toLocaleDateString()}
                </span>
              ),
            },
            {
              header: 'Actions',
              render: (poste) => (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(poste)}
                    className="rounded p-1 text-blue-600 hover:bg-blue-50"
                    disabled={loading}
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(poste.id)}
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
        title="Ajouter un nouveau poste"
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
          <label htmlFor="code" className="mb-2 block text-sm font-bold text-gray-700">
            Code
          </label>
          <input
            type="text"
            id="code"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formCode}
            onChange={(e) => setFormCode(e.target.value)}
            required
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
        isOpen={showEditModal && !!currentPoste}
        title="Modifier le poste"
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
          <label htmlFor="edit-code" className="mb-2 block text-sm font-bold text-gray-700">
            Code
          </label>
          <input
            type="text"
            id="edit-code"
            className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
            value={formCode}
            onChange={(e) => setFormCode(e.target.value)}
            required
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
