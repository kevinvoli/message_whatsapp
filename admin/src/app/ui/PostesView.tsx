"use client";

import React, { useState } from 'react';
import { Ban, Edit, PlusCircle, ShieldCheck, Trash2, RefreshCw } from 'lucide-react';
import { formatDateShort } from '@/app/lib/dateUtils';
import {
  blockPosteFromQueue,
  createPoste,
  deletePoste,
  unblockPosteFromQueue,
  updatePoste,
} from '@/app/lib/api';
import { Poste } from '@/app/lib/definitions';
import { useCrudResource } from '@/app/hooks/useCrudResource';
import { EntityTable } from '@/app/ui/crud/EntityTable';
import { EntityFormModal } from '@/app/ui/crud/EntityFormModal';
import { useToast } from '@/app/ui/ToastProvider';

interface PostesViewProps {
  initialPostes: Poste[];
  onPosteUpdated: () => Promise<void> | void;
  onRefresh?: () => void;
}

export default function PostesView({
  initialPostes,
  onPosteUpdated,
  onRefresh,
}: PostesViewProps) {
  const {
    items: postes,
    loading,
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
  const [queueActionLoadingId, setQueueActionLoadingId] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<'all' | 'blocked' | 'allowed'>('all');
  const { addToast } = useToast();

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
    setFormIsActive(poste.is_queue_enabled === false ? false : poste.is_active);
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
    if (currentPoste.is_queue_enabled === false && formIsActive) {
      addToast({
        type: 'error',
        message: 'Ce poste est bloque dans la file. Debloque-le avant de l’activer.',
      });
      return;
    }
    const result = await update(
      currentPoste.id,
      { name: formName, code: formCode, is_active: formIsActive },
      'Poste mis a jour.',
    );
    if (!result.ok && result.error?.toLowerCase().includes('bloque')) {
      addToast({
        type: 'error',
        message:
          'Activation refusee: ce poste est bloque dans la file. Debloque-le avant de l’activer.',
      });
    }
    if (result.ok) {
      closeEditModal();
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this poste?')) return;
    await remove(id, 'Poste supprime.');
  };

  const handleQueueToggle = async (poste: Poste) => {
    const isQueueEnabled = poste.is_queue_enabled !== false;
    setQueueActionLoadingId(poste.id);
    try {
      if (isQueueEnabled) {
        await blockPosteFromQueue(poste.id);
        addToast({ type: 'success', message: 'Poste bloque dans la file.' });
      } else {
        await unblockPosteFromQueue(poste.id);
        addToast({
          type: 'success',
          message: 'Poste debloque et autorise dans la file.',
        });
      }
      await onPosteUpdated();
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Action echouee.',
      });
    } finally {
      setQueueActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            title="Rafraîchir"
            aria-label="Rafraîchir"
            className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>
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

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-600">Filtre Queue:</span>
        <button
          onClick={() => setQueueFilter('all')}
          className={`rounded-full px-3 py-1 text-sm ${
            queueFilter === 'all'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Tous
        </button>
        <button
          onClick={() => setQueueFilter('allowed')}
          className={`rounded-full px-3 py-1 text-sm ${
            queueFilter === 'allowed'
              ? 'bg-emerald-600 text-white'
              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          }`}
        >
          Autorises
        </button>
        <button
          onClick={() => setQueueFilter('blocked')}
          className={`rounded-full px-3 py-1 text-sm ${
            queueFilter === 'blocked'
              ? 'bg-orange-600 text-white'
              : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
          }`}
        >
          Bloques
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <EntityTable
          items={postes.filter((poste) => {
            if (queueFilter === 'blocked') return poste.is_queue_enabled === false;
            if (queueFilter === 'allowed') return poste.is_queue_enabled !== false;
            return true;
          })}
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
              header: 'Queue',
              render: (poste) => {
                const isQueueEnabled = poste.is_queue_enabled !== false;
                return (
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      isQueueEnabled
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-orange-100 text-orange-800'
                    }`}
                  >
                    {isQueueEnabled ? 'Autorise' : 'Bloque'}
                  </span>
                );
              },
            },
            {
              header: 'Cree le',
              render: (poste) => (
                <span className="text-sm text-gray-500">
                  {formatDateShort(poste.created_at || poste.createdAt)}
                </span>
              ),
            },
            {
              header: 'Actions',
              render: (poste) => (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleQueueToggle(poste)}
                    className="rounded p-1 text-amber-600 hover:bg-amber-50"
                    disabled={loading || queueActionLoadingId === poste.id}
                    title={
                      poste.is_queue_enabled === false
                        ? 'Debloquer dans la queue'
                        : 'Bloquer dans la queue'
                    }
                  >
                    {poste.is_queue_enabled === false ? (
                      <ShieldCheck className="h-4 w-4" />
                    ) : (
                      <Ban className="h-4 w-4" />
                    )}
                  </button>
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
            disabled={currentPoste?.is_queue_enabled === false}
          />
          <label htmlFor="edit-is_active" className="text-sm font-bold text-gray-700">
            Actif
          </label>
          {currentPoste?.is_queue_enabled === false && (
            <span className="ml-3 text-xs text-orange-600">
              Debloque la queue pour activer ce poste.
            </span>
          )}
        </div>
      </EntityFormModal>
    </div>
  );
}


