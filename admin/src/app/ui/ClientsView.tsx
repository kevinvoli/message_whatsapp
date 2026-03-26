"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Edit, Trash2, UserPlus, RefreshCw } from 'lucide-react';
import { formatDateShort } from '@/app/lib/dateUtils';
import { Client } from '@/app/lib/definitions';
import { createClient, deleteClient, updateClient, getClients } from '@/app/lib/api';
import { EntityTable } from '@/app/ui/crud/EntityTable';
import { EntityFormModal } from '@/app/ui/crud/EntityFormModal';
import { Pagination } from '@/app/ui/Pagination';

interface ClientsViewProps {
  onRefresh?: () => void;
}

export default function ClientsView({ onRefresh }: ClientsViewProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentClient, setCurrentClient] = useState<Client | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formChatId, setFormChatId] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  const loadPage = useCallback(async (l: number, o: number) => {
    setLoading(true);
    try {
      const result = await getClients(l, o);
      setClients(result.data);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPage(limit, offset); }, [loadPage, limit, offset]);

  const openAddModal = () => {
    setFormName(''); setFormPhone(''); setFormChatId(''); setFormIsActive(true);
    setShowAddModal(true);
  };

  const openEditModal = (client: Client) => {
    setCurrentClient(client);
    setFormName(client.name);
    setFormPhone(client.phone);
    setFormChatId(client.chat_id || '');
    setFormIsActive(client.is_active);
    setShowEditModal(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createClient({ name: formName, phone: formPhone, chat_id: formChatId || undefined, is_active: formIsActive });
      setShowAddModal(false);
      await loadPage(limit, offset);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClient) return;
    setLoading(true);
    try {
      await updateClient(currentClient.id, { name: formName, phone: formPhone, chat_id: formChatId || undefined, is_active: formIsActive });
      setShowEditModal(false);
      setCurrentClient(null);
      await loadPage(limit, offset);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer ce client ?')) return;
    setLoading(true);
    try {
      await deleteClient(id);
      await loadPage(limit, offset);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button type="button" onClick={() => void loadPage(limit, offset)}
          title="Rafraîchir" aria-label="Rafraîchir"
          className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Gestion des Clients</h2>
        <button onClick={openAddModal} disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
          <UserPlus className="h-4 w-4" />
          Ajouter un client
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <EntityTable
          items={clients}
          loading={loading}
          emptyMessage="Aucun client trouvé."
          getRowKey={(client) => client.id}
          columns={[
            { header: 'Nom', render: (c) => <span className="font-medium text-gray-900">{c.name}</span> },
            { header: 'Téléphone', render: (c) => <span className="text-gray-700">{c.phone}</span> },
            { header: 'Chat ID', render: (c) => <span className="text-gray-700">{c.chat_id || 'N/A'}</span> },
            {
              header: 'Statut',
              render: (c) => (
                <div className="flex flex-col gap-1">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${c.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {c.is_active ? 'Actif' : 'Inactif'}
                  </span>
                  {c.marketing_opt_out && (
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-orange-100 text-orange-800" title="Ce contact a refusé les messages marketing">
                      🚫 Opt-out
                    </span>
                  )}
                </div>
              ),
            },
            { header: 'Créé le', render: (c) => <span className="text-sm text-gray-500">{formatDateShort(c.createdAt)}</span> },
            {
              header: 'Actions',
              render: (c) => (
                <div className="flex items-center gap-2">
                  <button onClick={() => openEditModal(c)} disabled={loading} className="rounded p-1 text-blue-600 hover:bg-blue-50">
                    <Edit className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(c.id)} disabled={loading} className="rounded p-1 text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ),
            },
          ]}
        />
        <Pagination
          total={total} limit={limit} offset={offset}
          onPageChange={(o) => setOffset(o)}
          onLimitChange={(l) => { setLimit(l); setOffset(0); }}
        />
      </div>

      <EntityFormModal isOpen={showAddModal} title="Ajouter un client" onClose={() => setShowAddModal(false)}
        onSubmit={handleAdd} loading={loading} submitLabel="Ajouter" loadingLabel="Ajout...">
        <div className="mb-4">
          <label className="mb-2 block text-sm font-bold text-gray-700">Nom</label>
          <input type="text" className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none" value={formName} onChange={(e) => setFormName(e.target.value)} required />
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-sm font-bold text-gray-700">Téléphone</label>
          <input type="text" className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} required />
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-sm font-bold text-gray-700">Chat ID (Optionnel)</label>
          <input type="text" className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none" value={formChatId} onChange={(e) => setFormChatId(e.target.value)} />
        </div>
        <div className="mb-4 flex items-center">
          <input type="checkbox" className="mr-2" checked={formIsActive} onChange={(e) => setFormIsActive(e.target.checked)} />
          <label className="text-sm font-bold text-gray-700">Actif</label>
        </div>
      </EntityFormModal>

      <EntityFormModal isOpen={showEditModal && !!currentClient} title="Modifier le client" onClose={() => { setShowEditModal(false); setCurrentClient(null); }}
        onSubmit={handleUpdate} loading={loading} submitLabel="Sauvegarder" loadingLabel="Sauvegarde...">
        <div className="mb-4">
          <label className="mb-2 block text-sm font-bold text-gray-700">Nom</label>
          <input type="text" className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none" value={formName} onChange={(e) => setFormName(e.target.value)} required />
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-sm font-bold text-gray-700">Téléphone</label>
          <input type="text" className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} required />
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-sm font-bold text-gray-700">Chat ID (Optionnel)</label>
          <input type="text" className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none" value={formChatId} onChange={(e) => setFormChatId(e.target.value)} />
        </div>
        <div className="mb-4 flex items-center">
          <input type="checkbox" className="mr-2" checked={formIsActive} onChange={(e) => setFormIsActive(e.target.checked)} />
          <label className="text-sm font-bold text-gray-700">Actif</label>
        </div>
      </EntityFormModal>
    </div>
  );
}
