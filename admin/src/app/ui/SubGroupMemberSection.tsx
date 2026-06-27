'use client';

import React, { useState } from 'react';
import { UserMinus, UserPlus, ChevronDown, Loader2, AlertTriangle } from 'lucide-react';
import { CommercialSubGroup, CommercialPresenceItem } from '@/app/lib/definitions';
import { addSubGroupMember, removeSubGroupMember } from '@/app/lib/api/commercial-groups.api';

interface SubGroupMemberSectionProps {
  subGroup: CommercialSubGroup;
  parentMembers: CommercialPresenceItem[];
  onRefresh: () => void;
}

export default function SubGroupMemberSection({ subGroup, parentMembers, onRefresh }: SubGroupMemberSectionProps) {
  const [selectedAdd, setSelectedAdd] = useState('');
  const [adding, setAdding]           = useState(false);
  const [removingId, setRemovingId]   = useState<string | null>(null);

  const members   = subGroup.members ?? [];
  const memberIds = new Set(members.map((m) => m.id));
  const available = parentMembers.filter((p) => !memberIds.has(p.id));

  const handleAdd = async () => {
    if (!selectedAdd) return;
    setAdding(true);
    try {
      await addSubGroupMember(subGroup.id, selectedAdd);
      setSelectedAdd('');
      onRefresh();
    } catch { /* silencieux */ }
    finally { setAdding(false); }
  };

  const handleRemove = async (commercialId: string) => {
    setRemovingId(commercialId);
    try {
      await removeSubGroupMember(subGroup.id, commercialId);
      onRefresh();
    } catch { /* silencieux */ }
    finally { setRemovingId(null); }
  };

  if (!subGroup.members) {
    return (
      <p className="text-xs text-gray-400">
        {subGroup.memberCount} membre{subGroup.memberCount !== 1 ? 's' : ''} — chargez le détail pour les gérer.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-600">Membres ({members.length})</p>

      {members.length === 0 ? (
        <p className="text-xs text-gray-400">Aucun membre dans ce sous-groupe.</p>
      ) : (
        <div className="space-y-1">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50">
              <span className="text-sm font-medium text-gray-800">{m.name}</span>
              <button
                onClick={() => void handleRemove(m.id)}
                disabled={removingId === m.id}
                aria-label={`Retirer ${m.name} du sous-groupe`}
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
            <option value="">-- Ajouter un membre --</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
        <button
          onClick={() => void handleAdd()}
          disabled={!selectedAdd || adding}
          aria-label="Ajouter au sous-groupe"
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Ajouter
        </button>
      </div>

      {available.length === 0 && members.length > 0 && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          Tous les membres du groupe parent sont déjà dans ce sous-groupe.
        </p>
      )}
    </div>
  );
}
