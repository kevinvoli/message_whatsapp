'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Users, ChevronDown, Loader2, Plus, X, Clock, ShieldOff,
} from 'lucide-react';
import { CommercialGroup, CommercialSubGroup, CommercialPresenceItem } from '@/app/lib/definitions';
import {
  getGroups,
  getSubGroups,
  getSubGroup,
  createSubGroup,
} from '@/app/lib/api/commercial-groups.api';
import { getPresence } from '@/app/lib/api/commerciaux.api';
import SubGroupMemberSection from '@/app/ui/SubGroupMemberSection';
import BreakScheduleForm from '@/app/ui/BreakScheduleForm';
import BreakExclusionsPanel from '@/app/ui/BreakExclusionsPanel';

// ─── Types locaux ────────────────────────────────────────────────────────────

type DetailTab = 'membres' | 'pauses' | 'exclusions';

interface TabConfig {
  id: DetailTab;
  label: string;
  icon: React.ElementType;
}

const TABS: TabConfig[] = [
  { id: 'membres',    label: 'Membres',        icon: Users },
  { id: 'pauses',     label: 'Plages de pause', icon: Clock },
  { id: 'exclusions', label: 'Exclusions',      icon: ShieldOff },
];

// ─── Modal création sous-groupe ──────────────────────────────────────────────

interface SubGroupFormModalProps {
  parentGroupId: string;
  onClose: () => void;
  onSaved: () => void;
}

function SubGroupFormModal({ parentGroupId, onClose, onSaved }: SubGroupFormModalProps) {
  const [name, setName]        = useState('');
  const [description, setDesc] = useState('');
  const [saving, setSaving]    = useState(false);
  const [error, setError]      = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Le nom est requis.'); return; }
    setSaving(true);
    setError(null);
    try {
      await createSubGroup({
        parentGroupId,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">Nouveau sous-groupe</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Fermer">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nom *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Équipe matin"
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
              Créer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────

export default function SubGroupsGroupSelector() {
  const [groups, setGroups]             = useState<CommercialGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');

  const [subGroups, setSubGroups]   = useState<CommercialSubGroup[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [presence, setPresence]     = useState<CommercialPresenceItem[]>([]);

  const [activeSubGroupId, setActiveSubGroupId]   = useState<string | null>(null);
  const [subGroupDetail, setSubGroupDetail]       = useState<CommercialSubGroup | null>(null);
  const [loadingDetail, setLoadingDetail]         = useState(false);
  const [activeTab, setActiveTab]                 = useState<DetailTab>('membres');

  const [showCreate, setShowCreate] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true);
    try {
      const data = await getGroups();
      setGroups(data);
    } catch { /* silencieux */ }
    finally { setLoadingGroups(false); }
  }, []);

  useEffect(() => { void loadGroups(); }, [loadGroups]);

  const loadSubGroups = useCallback(async (groupId: string) => {
    setLoadingSubs(true);
    setActiveSubGroupId(null);
    setSubGroupDetail(null);
    try {
      const [sgs, p] = await Promise.all([getSubGroups(groupId), getPresence()]);
      setSubGroups(sgs);
      setPresence(p);
    } catch { /* silencieux */ }
    finally { setLoadingSubs(false); }
  }, []);

  useEffect(() => {
    if (selectedGroupId) {
      void loadSubGroups(selectedGroupId);
    } else {
      setSubGroups([]);
      setActiveSubGroupId(null);
      setSubGroupDetail(null);
    }
  }, [selectedGroupId, loadSubGroups]);

  const loadDetail = useCallback(async (subId: string) => {
    setLoadingDetail(true);
    try {
      const detail = await getSubGroup(subId);
      setSubGroupDetail(detail);
    } catch { /* silencieux */ }
    finally { setLoadingDetail(false); }
  }, []);

  const handleSelectSubGroup = (subId: string) => {
    if (activeSubGroupId === subId) {
      setActiveSubGroupId(null);
      setSubGroupDetail(null);
    } else {
      setActiveSubGroupId(subId);
      setSubGroupDetail(null);
      setActiveTab('membres');
      void loadDetail(subId);
    }
  };

  const handleDetailRefresh = () => {
    if (activeSubGroupId) void loadDetail(activeSubGroupId);
  };

  const selectedGroup   = groups.find((g) => g.id === selectedGroupId);
  const parentMembers   = presence.filter((p) => p.groupId === selectedGroupId);

  return (
    <div className="space-y-5">
      {/* Sélecteur de groupe */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-indigo-600 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-gray-800">Sélectionner un groupe</h3>
        </div>

        {loadingGroups ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement des groupes…
          </div>
        ) : groups.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun groupe disponible.</p>
        ) : (
          <div className="relative max-w-sm">
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              aria-label="Choisir un groupe pour gérer ses sous-groupes"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none appearance-none pr-8 bg-white"
            >
              <option value="">-- Choisir un groupe --</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}{g.isActive ? '' : ' (inactif)'}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Liste des sous-groupes */}
      {selectedGroupId && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Sous-groupes{selectedGroup ? ` — ${selectedGroup.name}` : ''}
            </h4>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700"
              aria-label="Créer un sous-groupe"
            >
              <Plus className="w-3.5 h-3.5" /> Créer
            </button>
          </div>

          {loadingSubs ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
            </div>
          ) : subGroups.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucun sous-groupe configuré.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {subGroups.map((sg) => (
                <button
                  key={sg.id}
                  onClick={() => handleSelectSubGroup(sg.id)}
                  aria-pressed={activeSubGroupId === sg.id}
                  aria-label={`Sélectionner le sous-groupe ${sg.name}`}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                    activeSubGroupId === sg.id
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                  }`}
                >
                  <span>{sg.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-normal ${
                    activeSubGroupId === sg.id
                      ? 'bg-indigo-500 text-indigo-100'
                      : sg.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {sg.memberCount}
                  </span>
                  {sg.breakSchedules.length > 0 && (
                    <Clock className={`w-3.5 h-3.5 ${activeSubGroupId === sg.id ? 'text-indigo-200' : 'text-indigo-400'}`} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Panneau de détail */}
      {activeSubGroupId && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900">
                {subGroupDetail?.name ?? '…'}
              </h4>
              {subGroupDetail && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  subGroupDetail.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {subGroupDetail.isActive ? 'Actif' : 'Inactif'}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  aria-selected={activeTab === id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === id
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5">
            {activeTab === 'membres' ? (
              loadingDetail || !subGroupDetail ? (
                <div className="flex items-center justify-center h-16 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement…
                </div>
              ) : (
                <SubGroupMemberSection
                  subGroup={subGroupDetail}
                  parentMembers={parentMembers}
                  onRefresh={handleDetailRefresh}
                />
              )
            ) : activeTab === 'pauses' ? (
              <BreakScheduleForm
                subGroupId={activeSubGroupId}
                inline
              />
            ) : (
              <BreakExclusionsPanel
                subGroupId={activeSubGroupId}
                inline
              />
            )}
          </div>
        </div>
      )}

      {/* Modal création */}
      {showCreate && selectedGroupId && (
        <SubGroupFormModal
          parentGroupId={selectedGroupId}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            void loadSubGroups(selectedGroupId);
          }}
        />
      )}
    </div>
  );
}
