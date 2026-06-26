'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Users, ChevronDown, Loader2 } from 'lucide-react';
import { CommercialGroup } from '@/app/lib/definitions';
import { getGroups } from '@/app/lib/api/commercial-groups.api';
import SubGroupsManager from '@/app/ui/SubGroupsManager';

export default function SubGroupsGroupSelector() {
  const [groups, setGroups]         = useState<CommercialGroup[]>([]);
  const [loading, setLoading]       = useState(false);
  const [selectedId, setSelectedId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getGroups();
      setGroups(data);
    } catch { /* silencieux */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedGroup = groups.find((g) => g.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Users className="w-5 h-5 text-indigo-600 flex-shrink-0" />
        <h3 className="text-sm font-semibold text-gray-800">Sélectionner un groupe</h3>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement des groupes…
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun groupe disponible.</p>
      ) : (
        <div className="relative max-w-sm">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
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

      {selectedGroup && (
        <div className="mt-4">
          <SubGroupsManager
            groupId={selectedGroup.id}
            groupName={selectedGroup.name}
            inline
          />
        </div>
      )}
    </div>
  );
}
