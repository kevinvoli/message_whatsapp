'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  UserPlus,
  UserMinus,
  AlertTriangle,
  Loader2,
  X,
  ChevronDown,
} from 'lucide-react';
import {
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  addMember,
  removeMember,
} from '../lib/api/commercial-groups.api';
import { getPresence } from '../lib/api/commerciaux.api';
import { CommercialGroup, CommercialPresenceItem } from '../lib/definitions';

// ─── Modal création / modification ──────────────────────────────────────────

interface GroupFormModalProps {
  initial: { name: string; description: string } | null;
  editId:  string | null;
  onClose: () => void;
  onSaved: () => void;
}

function GroupFormModal({ initial, editId, onClose, onSaved }: GroupFormModalProps) {
  const [name, setName]           = useState(initial?.name ?? '');
  const [description, setDesc]    = useState(initial?.description ?? '');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Le nom est requis.'); return; }
    setSaving(true);
    setError(null);
    try {
      if (editId) {
        await updateGroup(editId, { name: name.trim(), description: description.trim() || undefined });
      } else {
        await createGroup({ name: name.trim(), description: description.trim() || undefined });
      }
      onSaved();
    } catch {
      setError('Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">
            {editId ? 'Modifier le groupe' : 'Nouveau groupe'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Fermer">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nom du groupe *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Equipe A"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              placeholder="Description optionnelle"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editId ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Panneau détail d'un groupe ──────────────────────────────────────────────

interface GroupDetailPanelProps {
  group: CommercialGroup;
  allPresence: CommercialPresenceItem[];
  onRefresh: () => void;
}

function GroupDetailPanel({ group, allPresence, onRefresh }: GroupDetailPanelProps) {
  const [selectedAdd, setSelectedAdd] = useState('');
  const [adding, setAdding]           = useState(false);
  const [removingId, setRemovingId]   = useState<string | null>(null);

  // Les membres sont dérivés directement depuis allPresence (déjà chargé dans le parent)
  const members   = allPresence.filter((p) => p.groupId === group.id);
  const available = allPresence.filter((p) => p.groupId === null);

  const handleAdd = async () => {
    if (!selectedAdd) return;
    setAdding(true);
    try {
      await addMember(group.id, selectedAdd);
      setSelectedAdd('');
      onRefresh();
    } catch { /* silencieux */ }
    finally { setAdding(false); }
  };

  const handleRemove = async (commercialId: string) => {
    setRemovingId(commercialId);
    try {
      await removeMember(group.id, commercialId);
      onRefresh();
    } catch { /* silencieux */ }
    finally { setRemovingId(null); }
  };

  return (
    <div className="mt-4 border-t border-gray-100 pt-4 space-y-4">
      <p className="text-sm font-semibold text-gray-700">Membres du groupe</p>

      {members.length === 0 ? (
        <p className="text-xs text-gray-400">Aucun membre pour l'instant.</p>
      ) : (
        <div className="space-y-1">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50">
              <div>
                <span className="text-sm font-medium text-gray-800">{m.name}</span>
                {m.phone && <span className="ml-2 text-xs text-gray-400">{m.phone}</span>}
              </div>
              <button
                onClick={() => void handleRemove(m.id)}
                disabled={removingId === m.id}
                aria-label={`Retirer ${m.name} du groupe`}
                className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
              >
                {removingId === m.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <UserMinus className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <select
            value={selectedAdd}
            onChange={(e) => setSelectedAdd(e.target.value)}
            aria-label="Sélectionner un commercial à ajouter"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none appearance-none pr-8"
          >
            <option value="">-- Ajouter un commercial --</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.phone ? ` (${c.phone})` : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
        <button
          onClick={() => void handleAdd()}
          disabled={!selectedAdd || adding}
          aria-label="Ajouter au groupe"
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Ajouter
        </button>
      </div>

      {available.length === 0 && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          Tous les commerciaux sans groupe sont déjà membres.
        </p>
      )}
    </div>
  );
}

// ─── Vue principale ──────────────────────────────────────────────────────────

export default function CommercialGroupsView() {
  const [groups, setGroups]           = useState<CommercialGroup[]>([]);
  const [presence, setPresence]       = useState<CommercialPresenceItem[]>([]);
  const [loading, setLoading]         = useState(false);
  const [showModal, setShowModal]     = useState(false);
  const [editGroup, setEditGroup]     = useState<CommercialGroup | null>(null);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [togglingId, setTogglingId]   = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<CommercialGroup | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, p] = await Promise.all([getGroups(), getPresence()]);
      setGroups(g);
      setPresence(p);
    } catch { /* silencieux */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const orphanCount = presence.filter((p) => p.groupId === null).length;

  const openCreate = () => { setEditGroup(null); setShowModal(true); };
  const openEdit   = (g: CommercialGroup) => { setEditGroup(g); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditGroup(null); };
  const onSaved    = () => { closeModal(); void load(); };

  const handleToggleActive = async (group: CommercialGroup) => {
    setConfirmDeactivate(null);
    setTogglingId(group.id);
    try {
      await updateGroup(group.id, { isActive: !group.isActive });
      void load();
    } catch { /* silencieux */ }
    finally { setTogglingId(null); }
  };

  const handleDelete = async (id: string) => {
    setTogglingId(id);
    try {
      await deleteGroup(id);
      void load();
    } catch { /* silencieux */ }
    finally { setTogglingId(null); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-indigo-600" />
          <h2 className="text-xl font-bold text-gray-900">Groupes commerciaux</h2>
          {orphanCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5" />
              {orphanCount} sans groupe
            </span>
          )}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
          aria-label="Créer un nouveau groupe"
        >
          <Plus className="w-4 h-4" /> Nouveau groupe
        </button>
      </div>

      {loading && groups.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Chargement…
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucun groupe configuré.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const memberCount = presence.filter((p) => p.groupId === group.id).length;
            const isExpanded  = expandedId === group.id;

            return (
              <div
                key={group.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{group.name}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        group.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {group.isActive ? 'Actif' : 'Inactif'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {memberCount} membre{memberCount > 1 ? 's' : ''}
                      </span>
                    </div>
                    {group.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{group.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : group.id)}
                      className="px-3 py-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 font-medium"
                      aria-label={isExpanded ? 'Masquer les membres' : 'Gérer les membres'}
                    >
                      {isExpanded ? 'Masquer' : 'Gérer les membres'}
                    </button>
                    <button
                      onClick={() => openEdit(group)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 rounded hover:bg-indigo-50"
                      aria-label={`Modifier ${group.name}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDeactivate(group)}
                      disabled={togglingId === group.id}
                      className={`p-1.5 rounded disabled:opacity-50 ${
                        group.isActive
                          ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                          : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                      }`}
                      aria-label={group.isActive ? `Désactiver ${group.name}` : `Activer ${group.name}`}
                    >
                      {togglingId === group.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5">
                    <GroupDetailPanel
                      group={group}
                      allPresence={presence}
                      onRefresh={load}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <GroupFormModal
          initial={editGroup ? { name: editGroup.name, description: editGroup.description ?? '' } : null}
          editId={editGroup?.id ?? null}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}

      {confirmDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-gray-900 text-sm">
                  {confirmDeactivate.isActive ? 'Désactiver ce groupe ?' : 'Activer ce groupe ?'}
                </p>
                {confirmDeactivate.isActive && (
                  <p className="text-xs text-gray-500 mt-1">
                    Ce groupe sera désactivé et ses membres libérés.
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeactivate(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={() => void handleToggleActive(confirmDeactivate)}
                className={`px-4 py-2 text-sm rounded-lg text-white ${
                  confirmDeactivate.isActive
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
