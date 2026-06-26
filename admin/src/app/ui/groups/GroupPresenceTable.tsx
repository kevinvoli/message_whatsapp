'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getGroupSchedule } from '../../lib/api/commercial-groups.api';
import { CommercialGroup } from '../../lib/definitions';

interface GroupPresenceTableProps {
  groups: CommercialGroup[];
}

type PresenceStatus = 'work' | 'rest' | 'unconfigured';

interface GroupStatus {
  groupId: string;
  status: PresenceStatus;
}

/** Formate une date JS en 'YYYY-MM-DD' sans décalage timezone */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}

export default function GroupPresenceTable({ groups }: GroupPresenceTableProps) {
  const [statuses, setStatuses] = useState<GroupStatus[]>([]);
  const [loading, setLoading]   = useState(false);

  const today = new Date();
  const todayStr = toDateString(today);

  const dateLabel = today.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  useEffect(() => {
    if (groups.length === 0) return;

    setLoading(true);

    Promise.allSettled(
      groups.map(async (g) => {
        const data = await getGroupSchedule(g.id, todayStr, todayStr);
        const entry = data.find((d) => d.date === todayStr);
        if (data.length === 0 || !entry) {
          return { groupId: g.id, status: 'unconfigured' as PresenceStatus };
        }
        return { groupId: g.id, status: entry.isWorkDay ? ('work' as PresenceStatus) : ('rest' as PresenceStatus) };
      }),
    ).then((results) => {
      const resolved: GroupStatus[] = results.map((r, idx) => {
        if (r.status === 'fulfilled') return r.value;
        return { groupId: groups[idx].id, status: 'unconfigured' as PresenceStatus };
      });
      setStatuses(resolved);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  if (groups.length === 0) return null;

  const getStatus = (groupId: string): PresenceStatus => {
    return statuses.find((s) => s.groupId === groupId)?.status ?? 'unconfigured';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">
          Presence aujourd'hui —{' '}
          <span className="font-normal text-gray-500 capitalize">{dateLabel}</span>
        </p>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs font-medium text-gray-400 bg-gray-50 border-b border-gray-100">
            <th className="text-left px-5 py-2 font-medium">Groupe</th>
            <th className="text-left px-5 py-2 font-medium">Statut</th>
            <th className="text-left px-5 py-2 font-medium">Membres</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {groups.map((group) => {
            const status = getStatus(group.id);
            const members = (group.commercials ?? []).map((c) => c.name).join(', ') || '—';

            return (
              <tr key={group.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-800">{group.name}</td>
                <td className="px-5 py-3">
                  {status === 'work' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      En service
                    </span>
                  )}
                  {status === 'rest' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                      Repos
                    </span>
                  )}
                  {status === 'unconfigured' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">
                      Non configure
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-gray-500 text-xs">{members}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
