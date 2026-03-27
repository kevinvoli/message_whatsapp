"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Edit, Trash2, PlusCircle, RefreshCw, Search } from 'lucide-react';
import { formatDateShort } from '@/app/lib/dateUtils';
import { CannedResponse } from '@/app/lib/definitions';
import {
  getCannedResponses,
  createCannedResponse,
  updateCannedResponse,
  deleteCannedResponse,
} from '@/app/lib/api';
import { EntityTable } from '@/app/ui/crud/EntityTable';
import { EntityFormModal } from '@/app/ui/crud/EntityFormModal';
import { useToast } from '@/app/ui/ToastProvider';

export default function CannedResponsesView() {
  const { addToast } = useToast();
  const [items, setItems] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [current, setCurrent] = useState<CannedResponse | null>(null);

  const [formShortcut, setFormShortcut] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('');

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const data = await getCannedResponses(q || undefined);
      setItems(data);
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur chargement.' });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const openAdd = () => {
    setFormShortcut(''); setFormTitle(''); setFormContent(''); setFormCategory('');
    setShowAddModal(true);
  };

  const openEdit = (item: CannedResponse) => {
    setCurrent(item);
    setFormShortcut(item.shortcut);
    setFormTitle(item.title);
    setFormContent(item.content);
    setFormCategory(item.category ?? '');
    setShowEditModal(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const saved = await createCannedResponse({
        shortcut: formShortcut,
        title: formTitle,
        content: formContent,
        category: formCategory || undefined,
      });
      setItems((prev) => [...prev, saved]);
      setShowAddModal(false);
      addToast({ type: 'success', message: 'Réponse prédéfinie ajoutée.' });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur ajout.' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    setLoading(true);
    try {
      const saved = await updateCannedResponse(current.id, {
        shortcut: formShortcut,
        title: formTitle,
        content: formContent,
        category: formCategory || undefined,
      });
      setItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)));
      setShowEditModal(false);
      setCurrent(null);
      addToast({ type: 'success', message: 'Réponse prédéfinie mise à jour.' });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur mise à jour.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer cette réponse prédéfinie ?')) return;
    setLoading(true);
    try {
      await deleteCannedResponse(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      addToast({ type: 'success', message: 'Réponse supprimée.' });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur suppression.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void load(search);
  };

  const formFields = (
    <>
      <div className="mb-4">
        <label className="mb-2 block text-sm font-bold text-gray-700">
          Raccourci <span className="text-gray-400 font-normal">(ex: /bonjour)</span>
        </label>
        <input
          type="text"
          className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
          value={formShortcut}
          onChange={(e) => setFormShortcut(e.target.value)}
          placeholder="/bonjour"
          required
        />
      </div>
      <div className="mb-4">
        <label className="mb-2 block text-sm font-bold text-gray-700">Titre</label>
        <input
          type="text"
          className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
          value={formTitle}
          onChange={(e) => setFormTitle(e.target.value)}
          placeholder="Salutation standard"
          required
        />
      </div>
      <div className="mb-4">
        <label className="mb-2 block text-sm font-bold text-gray-700">Contenu</label>
        <textarea
          className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
          rows={4}
          value={formContent}
          onChange={(e) => setFormContent(e.target.value)}
          placeholder="Bonjour, comment puis-je vous aider ?"
          required
        />
      </div>
      <div className="mb-4">
        <label className="mb-2 block text-sm font-bold text-gray-700">
          Catégorie <span className="text-gray-400 font-normal">(optionnel)</span>
        </label>
        <input
          type="text"
          className="w-full rounded border px-3 py-2 text-gray-700 shadow focus:outline-none"
          value={formCategory}
          onChange={(e) => setFormCategory(e.target.value)}
          placeholder="Accueil, SAV, Clôture..."
        />
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Réponses Prédéfinies</h2>
        <div className="flex items-center gap-2">
          <form onSubmit={handleSearch} className="flex items-center gap-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Recherche..."
              className="rounded border px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="submit" className="p-1.5 rounded bg-gray-100 hover:bg-gray-200" title="Rechercher">
              <Search className="w-4 h-4 text-gray-600" />
            </button>
          </form>
          <button
            type="button"
            onClick={() => void load()}
            title="Rafraîchir"
            className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={openAdd}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <PlusCircle className="h-4 w-4" />
            Ajouter
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Les agents peuvent déclencher une réponse en tapant son raccourci (ex: <code className="bg-gray-100 px-1 rounded">/bonjour</code>) dans le champ de saisie.
      </p>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <EntityTable
          items={items}
          loading={loading}
          emptyMessage="Aucune réponse prédéfinie trouvée."
          getRowKey={(item) => item.id}
          columns={[
            {
              header: 'Raccourci',
              render: (item) => (
                <span className="font-mono text-sm font-semibold text-green-700">{item.shortcut}</span>
              ),
            },
            { header: 'Titre', render: (item) => <span className="font-medium text-gray-900">{item.title}</span> },
            {
              header: 'Contenu',
              render: (item) => (
                <span className="max-w-xs truncate text-gray-600 text-sm">{item.content}</span>
              ),
            },
            {
              header: 'Catégorie',
              render: (item) => (
                <span className="text-gray-500 text-sm">{item.category ?? '—'}</span>
              ),
            },
            {
              header: 'Créé le',
              render: (item) => <span className="text-sm text-gray-500">{formatDateShort(item.createdAt)}</span>,
            },
            {
              header: 'Actions',
              render: (item) => (
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(item)} disabled={loading} className="rounded p-1 text-blue-600 hover:bg-blue-50">
                    <Edit className="h-4 w-4" />
                  </button>
                  <button onClick={() => void handleDelete(item.id)} disabled={loading} className="rounded p-1 text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>

      <EntityFormModal isOpen={showAddModal} title="Ajouter une réponse prédéfinie" onClose={() => setShowAddModal(false)}
        onSubmit={handleAdd} loading={loading} submitLabel="Ajouter" loadingLabel="Ajout...">
        {formFields}
      </EntityFormModal>

      <EntityFormModal isOpen={showEditModal && !!current} title="Modifier la réponse prédéfinie" onClose={() => { setShowEditModal(false); setCurrent(null); }}
        onSubmit={handleUpdate} loading={loading} submitLabel="Sauvegarder" loadingLabel="Sauvegarde...">
        {formFields}
      </EntityFormModal>
    </div>
  );
}
