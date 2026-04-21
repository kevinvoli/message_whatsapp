"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Edit, Trash2, UserPlus, RefreshCw, Search, X, Briefcase, UserCheck, UserX } from 'lucide-react';
import { formatDate, formatDateShort } from '@/app/lib/dateUtils';
import { Client, ClientSummary, Commercial, ClientCategory, CertificationStatus } from '@/app/lib/definitions';
import { createClient, deleteClient, updateClient, getClients, searchClientsAdmin, assignPortfolio, unassignPortfolio } from '@/app/lib/api/clients.api';
import { getCommerciaux } from '@/app/lib/api/commerciaux.api';
import { EntityTable } from '@/app/ui/crud/EntityTable';
import { EntityFormModal } from '@/app/ui/crud/EntityFormModal';
import { Pagination } from '@/app/ui/Pagination';

const CATEGORY_LABELS: Record<string, { label: string; cls: string }> = {
  jamais_commande:         { label: 'Jamais commandé',  cls: 'bg-gray-100 text-gray-600' },
  commande_sans_livraison: { label: 'Sans livraison',   cls: 'bg-orange-100 text-orange-700' },
  commande_avec_livraison: { label: 'Livré',            cls: 'bg-green-100 text-green-700' },
  commande_annulee:        { label: 'Annulé',           cls: 'bg-red-100 text-red-700' },
};
const CERTIF_LABELS: Record<string, { label: string; cls: string }> = {
  non_verifie: { label: 'Non vérifié', cls: 'bg-gray-100 text-gray-500' },
  en_attente:  { label: 'En attente',  cls: 'bg-orange-100 text-orange-700' },
  certifie:    { label: '✓ Certifié', cls: 'bg-green-100 text-green-700' },
  rejete:      { label: 'Rejeté',     cls: 'bg-red-100 text-red-700' },
};

function CategoryBadge({ category }: { category?: string | null }) {
  if (!category) return <span className="text-gray-300 text-xs">—</span>;
  const m = CATEGORY_LABELS[category];
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${m?.cls ?? 'bg-gray-100 text-gray-600'}`}>{m?.label ?? category}</span>;
}
function CertifBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-gray-300 text-xs">—</span>;
  const m = CERTIF_LABELS[status];
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${m?.cls ?? 'bg-gray-100 text-gray-500'}`}>{m?.label ?? status}</span>;
}

interface ClientsViewProps {
  onRefresh?: () => void;
}

export default function ClientsView({ onRefresh }: ClientsViewProps) {
  const [activeTab, setActiveTab] = useState<'annuaire' | 'portefeuille'>('annuaire');

  // ── Annuaire tab ─────────────────────────────────────────────────────────────
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentClient, setCurrentClient] = useState<Client | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formChatId, setFormChatId] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  // ── Portefeuille tab ─────────────────────────────────────────────────────────
  const [portfolio, setPortfolio] = useState<ClientSummary[]>([]);
  const [portfolioTotal, setPortfolioTotal] = useState(0);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioSearch, setPortfolioSearch] = useState('');
  const [filterCommercialId, setFilterCommercialId] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [commerciaux, setCommerciaux] = useState<Commercial[]>([]);
  const [assigningClient, setAssigningClient] = useState<ClientSummary | null>(null);
  const [assignTarget, setAssignTarget] = useState('');
  const portfolioOffset = useRef(0);

  const loadPage = useCallback(async (l: number, o: number, s?: string) => {
    setLoading(true);
    try {
      const result = await getClients(l, o, s);
      setClients(result.data);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPage(limit, offset, searchQuery); }, [loadPage, limit, offset, searchQuery]);

  const loadPortfolio = useCallback(async () => {
    setPortfolioLoading(true);
    try {
      const result = await searchClientsAdmin({
        search: portfolioSearch || undefined,
        portfolio_owner_id: filterCommercialId || undefined,
        category: filterCategory || undefined,
        limit: 50,
        offset: portfolioOffset.current,
      });
      setPortfolio(result.data);
      setPortfolioTotal(result.total);
    } finally {
      setPortfolioLoading(false);
    }
  }, [portfolioSearch, filterCommercialId]);

  useEffect(() => {
    if (activeTab === 'portefeuille') {
      void loadPortfolio();
      getCommerciaux().then(setCommerciaux).catch(() => {});
    }
  }, [activeTab, loadPortfolio]);

  const handleAssign = async () => {
    if (!assigningClient || !assignTarget) return;
    try {
      await assignPortfolio(assigningClient.id, assignTarget);
    } catch { /* ignore */ }
    setAssigningClient(null);
    setAssignTarget('');
    void loadPortfolio();
  };

  const handleUnassign = async (contactId: string) => {
    try { await unassignPortfolio(contactId); } catch { /* ignore */ }
    void loadPortfolio();
  };

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setOffset(0);
      setSearchQuery(value);
    }, 1000);
  }

  function clearSearch() {
    setSearchInput('');
    setSearchQuery('');
    setOffset(0);
  }

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
      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([['annuaire', 'Annuaire clients'], ['portefeuille', 'Portefeuille']] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'portefeuille' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-blue-600" />
                Portefeuille clients
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">{portfolioTotal} client{portfolioTotal !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={loadPortfolio} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
              <RefreshCw className="w-4 h-4" />
              Actualiser
            </button>
          </div>

          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={portfolioSearch}
                onChange={(e) => setPortfolioSearch(e.target.value)}
                placeholder="Rechercher..."
                className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 w-56"
              />
            </div>
            <select
              value={filterCommercialId}
              onChange={(e) => setFilterCommercialId(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">Tous les commerciaux</option>
              <option value="none">Sans responsable</option>
              {commerciaux.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">Toutes catégories</option>
              <option value="jamais_commande">Jamais commandé</option>
              <option value="commande_sans_livraison">Sans livraison</option>
              <option value="commande_avec_livraison">Livré</option>
              <option value="commande_annulee">Annulé</option>
            </select>
          </div>

          {/* Portfolio table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Téléphone</th>
                  <th className="px-4 py-3">Catégorie</th>
                  <th className="px-4 py-3">Certification</th>
                  <th className="px-4 py-3">Responsable</th>
                  <th className="px-4 py-3">Prochaine relance</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {portfolioLoading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Chargement...</td></tr>
                ) : portfolio.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Aucun client trouvé</td></tr>
                ) : portfolio.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600">{c.phone}</td>
                    <td className="px-4 py-3">
                      <CategoryBadge category={(c as ClientSummary & { client_category?: ClientCategory }).client_category} />
                    </td>
                    <td className="px-4 py-3">
                      <CertifBadge status={(c as ClientSummary & { certification_status?: CertificationStatus }).certification_status} />
                    </td>
                    <td className="px-4 py-3">
                      {c.portfolio_owner_name ? (
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                          {c.portfolio_owner_name}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">Non assigné</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {c.next_follow_up ? formatDateShort(c.next_follow_up) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setAssigningClient(c); setAssignTarget(c.portfolio_owner_id ?? ''); }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-600 text-xs hover:bg-blue-100"
                        >
                          <UserCheck className="w-3 h-3" />
                          Assigner
                        </button>
                        {c.portfolio_owner_id && (
                          <button
                            onClick={() => handleUnassign(c.id)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 text-gray-500 text-xs hover:bg-gray-200"
                          >
                            <UserX className="w-3 h-3" />
                            Retirer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assign modal */}
      {assigningClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">Assigner un responsable</h3>
            <p className="text-sm text-gray-600">Client : <strong>{assigningClient.name}</strong></p>
            <select
              value={assignTarget}
              onChange={(e) => setAssignTarget(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">Choisir un commercial</option>
              {commerciaux.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setAssigningClient(null)} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleAssign} disabled={!assignTarget} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'annuaire' && (<>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Gestion des Clients</h2>
        <div className="flex items-center gap-3">
          {/* Champ de recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Rechercher par nom, téléphone…"
              className="pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
            {searchInput && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Effacer la recherche"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button type="button" onClick={() => void loadPage(limit, offset, searchQuery)}
            title="Rafraîchir" aria-label="Rafraîchir"
            className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={openAddModal} disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
            <UserPlus className="h-4 w-4" />
            Ajouter un client
          </button>
        </div>
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
            { header: 'Catégorie', render: (c) => <CategoryBadge category={c.client_category} /> },
            { header: 'Certification', render: (c) => <CertifBadge status={c.certification_status} /> },
            {
              header: 'Statut',
              render: (c) => (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${c.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {c.is_active ? 'Actif' : 'Inactif'}
                </span>
              ),
            },
            { header: 'Créé le', render: (c) => <span className="text-sm font-medium text-blue-900">{formatDate(c.createdAt)}</span> },
            { header: 'Modifié le', render: (c) => <span className="text-sm text-gray-500">{formatDate(c.updatedAt)}</span> },
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
      </>)}
    </div>
  );
}
