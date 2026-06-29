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
  Power,
  ChevronRight,
} from 'lucide-react';
import {
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  addMember,
  removeMember,
  getSubGroups,
  getSubGroup,
  createSubGroup,
  deleteSubGroup,
  addSubGroupMember,
  removeSubGroupMember,
} from '../lib/api/commercial-groups.api';
import { getPresence } from '../lib/api/commerciaux.api';
import { CommercialGroup, CommercialPresenceItem, CommercialSubGroup } from '../lib/definitions';
import ScheduleConfigForm from './groups/ScheduleConfigForm';
import GroupScheduleCalendar from './groups/GroupScheduleCalendar';
import GroupPresenceTable from './groups/GroupPresenceTable';

// ─── Types ───────────────────────────────────────────────────────────────────

type GroupTab = 'groupes' | 'membres' | 'sous-groupes' | 'planning';

const TABS: { id: GroupTab; label: string; requiresGroup: boolean }[] = [
  { id: 'groupes',      label: 'Groupes',      requiresGroup: false },
  { id: 'membres',      label: 'Membres',      requiresGroup: true  },
  { id: 'sous-groupes', label: 'Sous-groupes', requiresGroup: true  },
  { id: 'planning',     label: 'Planning',     requiresGroup: true  },
];

// ─── Modal création / modification ──────────────────────────────────────────

interface GroupFormModalProps {
  initial: { name: string; description: string } | null;
  editId:  string | null;
  onClose: () => void;
  onSaved: () => void;
}

function GroupFormModal({ initial, editId, onClose, onSaved }: GroupFormModalProps) {
  const [name, setName]        = useState(initial?.name ?? '');
  const [description, setDesc] = useState(initial?.description ?? '');
  const [saving, setSaving]    = useState(false);
  const [error, setError]      = useState<string | null>(null);

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.');
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
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
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

// ─── Onglet membres ──────────────────────────────────────────────────────────

interface GroupDetailPanelProps {
  group: CommercialGroup;
  allPresence: CommercialPresenceItem[];
  onRefresh: () => void;
}

function GroupDetailPanel({ group, allPresence, onRefresh }: GroupDetailPanelProps) {
  const [selectedAdd, setSelectedAdd] = useState('');
  const [adding, setAdding]           = useState(false);
  const [removingId, setRemovingId]   = useState<string | null>(null);

  const members   = allPresence.filter((p) => p.group?.id === group.id);
  const available = allPresence.filter((p) => p.group === null);

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
    <div className="space-y-4">
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
                {removingId === m.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <UserMinus className="w-3.5 h-3.5" />}
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

// ─── Onglet sous-groupes ─────────────────────────────────────────────────────

interface SubGroupCardProps {
  sub: CommercialSubGroup;
  groupMembers: CommercialPresenceItem[];
  onDeleted: () => void;
}

function SubGroupCard({ sub, groupMembers, onDeleted }: SubGroupCardProps) {
  const [expanded, setExpanded]       = useState(false);
  const [members, setMembers]         = useState<{ id: string; name: string; phone?: string | null }[]>(sub.members ?? []);
  const [loadingMembers, setLoadingM] = useState(false);
  const [selectedAdd, setSelectedAdd] = useState('');
  const [adding, setAdding]           = useState(false);
  const [removingId, setRemovingId]   = useState<string | null>(null);
  const [deleting, setDeleting]       = useState(false);

  const loadMembers = async () => {
    setLoadingM(true);
    try {
      const detail = await getSubGroup(sub.id);
      setMembers(detail.members ?? []);
    } catch { /* silencieux */ }
    finally { setLoadingM(false); }
  };

  const handleExpand = async () => {
    if (!expanded) await loadMembers();
    setExpanded((v) => !v);
  };

  const handleAddMember = async () => {
    if (!selectedAdd) return;
    setAdding(true);
    try {
      await addSubGroupMember(sub.id, selectedAdd);
      setSelectedAdd('');
      await loadMembers();
    } catch { /* silencieux */ }
    finally { setAdding(false); }
  };

  const handleRemoveMember = async (commercialId: string) => {
    setRemovingId(commercialId);
    try {
      await removeSubGroupMember(sub.id, commercialId);
      await loadMembers();
    } catch { /* silencieux */ }
    finally { setRemovingId(null); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteSubGroup(sub.id);
      onDeleted();
    } catch { /* silencieux */ }
    finally { setDeleting(false); }
  };

  const memberIds = new Set(members.map((m) => m.id));
  const available = groupMembers.filter((p) => !memberIds.has(p.id));

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50">
        <button
          onClick={() => void handleExpand()}
          className="flex items-center gap-2 flex-1 text-left"
          aria-expanded={expanded}
        >
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? '' : '-rotate-90'}`} />
          <span className="text-sm font-medium text-gray-800">{sub.name}</span>
          <span className="text-xs text-gray-400">
            {members.length} membre{members.length > 1 ? 's' : ''}
          </span>
        </button>
        <button
          onClick={() => void handleDelete()}
          disabled={deleting}
          aria-label={`Supprimer ${sub.name}`}
          className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50 space-y-3">
          {loadingMembers ? (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" /> Chargement…
            </div>
          ) : members.length === 0 ? (
            <p className="text-xs text-gray-400">Aucun membre dans ce sous-groupe.</p>
          ) : (
            <div className="space-y-1">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-white">
                  <span className="text-sm text-gray-700">{m.name}</span>
                  <button
                    onClick={() => void handleRemoveMember(m.id)}
                    disabled={removingId === m.id}
                    aria-label={`Retirer ${m.name}`}
                    className="p-1 text-gray-400 hover:text-red-600 rounded disabled:opacity-50"
                  >
                    {removingId === m.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <UserMinus className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          )}
          {available.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <div className="relative flex-1">
                <select
                  value={selectedAdd}
                  onChange={(e) => setSelectedAdd(e.target.value)}
                  aria-label="Ajouter un membre du groupe"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none appearance-none pr-7"
                >
                  <option value="">-- Ajouter un membre du groupe --</option>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
              <button
                onClick={() => void handleAddMember()}
                disabled={!selectedAdd || adding}
                aria-label="Ajouter au sous-groupe"
                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 disabled:opacity-50"
              >
                {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                Ajouter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SubGroupsListProps {
  groupId: string;
  groupMembers: CommercialPresenceItem[];
}

function SubGroupsList({ groupId, groupMembers }: SubGroupsListProps) {
  const [subGroups, setSubGroups] = useState<CommercialSubGroup[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [newName, setNewName]     = useState('');
  const [adding, setAdding]       = useState(false);

  const loadSubGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSubGroups(await getSubGroups(groupId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { void loadSubGroups(); }, [loadSubGroups]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setError(null);
    try {
      await createSubGroup({ parentGroupId: groupId, name });
      setNewName('');
      await loadSubGroups();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {subGroups.length === 0 ? (
        <p className="text-xs text-gray-400">Aucun sous-groupe pour l'instant.</p>
      ) : (
        <div className="space-y-2">
          {subGroups.map((sub) => (
            <SubGroupCard
              key={sub.id}
              sub={sub}
              groupMembers={groupMembers}
              onDeleted={loadSubGroups}
            />
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <input
          value={newName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
          placeholder="Nom du nouveau sous-groupe"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') void handleAdd(); }}
        />
        <button
          onClick={() => void handleAdd()}
          disabled={!newName.trim() || adding}
          aria-label="Créer un sous-groupe"
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Créer
        </button>
      </div>
    </div>
  );
}

// ─── Vue principale ──────────────────────────────────────────────────────────

export default function CommercialGroupsView() {
  const [groups, setGroups]               = useState<CommercialGroup[]>([]);
  const [presence, setPresence]           = useState<CommercialPresenceItem[]>([]);
  const [loading, setLoading]             = useState(false);
  const [activeTab, setActiveTab]         = useState<GroupTab>('groupes');
  const [selectedGroup, setSelectedGroup] = useState<CommercialGroup | null>(null);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);
  const [showModal, setShowModal]           = useState(false);
  const [editGroup, setEditGroup]           = useState<CommercialGroup | null>(null);
  const [togglingId, setTogglingId]         = useState<string | null>(null);
  const [toggleActiveId, setToggleActiveId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete]   = useState<CommercialGroup | null>(null);
  const [deleteError, setDeleteError]       = useState<string | null>(null);

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

  const handleManage = (group: CommercialGroup) => {
    setSelectedGroup(group);
    setActiveTab('membres');
  };

  const handleBackToGroups = () => {
    setActiveTab('groupes');
  };

  const handleTabClick = (tab: GroupTab) => {
    if (TABS.find((t) => t.id === tab)?.requiresGroup && !selectedGroup) return;
    setActiveTab(tab);
  };

  const handleDelete = async (id: string) => {
    setTogglingId(id);
    setDeleteError(null);
    try {
      await deleteGroup(id);
      setConfirmDelete(null);
      void load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Erreur lors de la suppression.');
    } finally { setTogglingId(null); }
  };

  const handleToggleActive = async (group: CommercialGroup) => {
    setToggleActiveId(group.id);
    try {
      await updateGroup(group.id, { isActive: !group.isActive });
      void load();
    } catch { /* silencieux */ }
    finally { setToggleActiveId(null); }
  };

  return (
    <div className="space-y-0">
      {/* Barre d'onglets */}
      <div className="border-b border-gray-200 bg-white px-6">
        <div className="flex items-center gap-1">
          {TABS.map((tab) => {
            const disabled = tab.requiresGroup && !selectedGroup;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                disabled={disabled}
                className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : disabled
                      ? 'border-transparent text-gray-300 cursor-not-allowed'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                {tab.requiresGroup && selectedGroup && activeTab === tab.id && (
                  <span className="ml-1.5 text-xs text-indigo-400 font-normal">
                    — {selectedGroup.name}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Corps */}
      <div className="p-6">

        {/* ─── Onglet Groupes ─── */}
        {activeTab === 'groupes' && (
          <div className="space-y-6">
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
                <GroupPresenceTable groups={groups} />
                {groups.map((group) => {
                  const memberCount = presence.filter((p) => p.groupId === group.id).length;
                  return (
                    <div key={group.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                            onClick={() => handleManage(group)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 font-medium"
                            aria-label={`Gérer ${group.name}`}
                          >
                            Gérer <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEdit(group)}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 rounded hover:bg-indigo-50"
                            aria-label={`Modifier ${group.name}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => void handleToggleActive(group)}
                            disabled={toggleActiveId === group.id}
                            className={`p-1.5 rounded disabled:opacity-50 ${
                              group.isActive
                                ? 'text-green-600 hover:text-amber-600 hover:bg-amber-50'
                                : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                            }`}
                            aria-label={group.isActive ? `Désactiver ${group.name}` : `Activer ${group.name}`}
                            title={group.isActive ? 'Désactiver' : 'Activer'}
                          >
                            {toggleActiveId === group.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Power className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(group)}
                            disabled={togglingId === group.id}
                            className="p-1.5 rounded disabled:opacity-50 text-gray-400 hover:text-red-600 hover:bg-red-50"
                            aria-label={`Supprimer ${group.name}`}
                          >
                            {togglingId === group.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── Onglets groupe sélectionné ─── */}
        {activeTab !== 'groupes' && selectedGroup && (
          <div className="space-y-5">
            {/* Breadcrumb */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleBackToGroups}
                className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
              >
                ← Retour aux groupes
              </button>
              <span className="text-gray-300">|</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-800">{selectedGroup.name}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  selectedGroup.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {selectedGroup.isActive ? 'Actif' : 'Inactif'}
                </span>
              </div>
            </div>

            {activeTab === 'membres' && (
              <GroupDetailPanel group={selectedGroup} allPresence={presence} onRefresh={load} />
            )}

            {activeTab === 'sous-groupes' && (
              <SubGroupsList
                groupId={selectedGroup.id}
                groupMembers={presence.filter((p) => p.group?.id === selectedGroup.id)}
              />
            )}

            {activeTab === 'planning' && (
              <div className="space-y-6">
                <ScheduleConfigForm
                  groupId={selectedGroup.id}
                  initialWorkDaysCount={selectedGroup.workDaysCount}
                  initialFirstWorkDay={selectedGroup.firstWorkDay}
                  onScheduleGenerated={() => setScheduleRefreshKey((k) => k + 1)}
                />
                <GroupScheduleCalendar
                  groupId={selectedGroup.id}
                  refreshKey={scheduleRefreshKey}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modales */}
      {showModal && (
        <GroupFormModal
          initial={editGroup ? { name: editGroup.name, description: editGroup.description ?? '' } : null}
          editId={editGroup?.id ?? null}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-gray-900 text-sm">
                  Supprimer «&nbsp;{confirmDelete.name}&nbsp;» ?
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Cette action est irréversible. Les membres seront libérés et les sous-groupes supprimés.
                </p>
              </div>
            </div>
            {deleteError && (
              <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded mb-3">{deleteError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setConfirmDelete(null); setDeleteError(null); }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={() => void handleDelete(confirmDelete.id)}
                disabled={togglingId === confirmDelete.id}
                className="px-4 py-2 text-sm rounded-lg text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {togglingId === confirmDelete.id && <Loader2 className="w-4 h-4 animate-spin" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
