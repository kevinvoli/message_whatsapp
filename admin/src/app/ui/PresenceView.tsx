'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Users, CheckCircle2, XCircle, RefreshCw, Loader2 } from 'lucide-react';
import { getPresence, setWorkingToday } from '../lib/api/commerciaux.api';
import { getGroups } from '../lib/api/commercial-groups.api';
import { CommercialPresenceItem, CommercialGroup } from '../lib/definitions';
import { formatTime } from '../lib/dateUtils';

interface PosteGroup {
  posteId: string | null;
  posteName: string;
  commercials: CommercialPresenceItem[];
}

function buildPosteGroups(items: CommercialPresenceItem[]): PosteGroup[] {
  const map = new Map<string, PosteGroup>();

  for (const item of items) {
    const key = item.poste?.id ?? '__none__';
    if (!map.has(key)) {
      map.set(key, {
        posteId: item.poste?.id ?? null,
        posteName: item.poste?.name ?? 'Sans poste',
        commercials: [],
      });
    }
    map.get(key)!.commercials.push(item);
  }

  const groups = Array.from(map.values());
  groups.sort((a, b) => {
    if (a.posteId === null) return 1;
    if (b.posteId === null) return -1;
    return a.posteName.localeCompare(b.posteName);
  });
  return groups;
}

export default function PresenceView() {
  const [presence, setPresence]   = useState<CommercialPresenceItem[]>([]);
  const [groups, setGroups]       = useState<CommercialGroup[]>([]);
  const [loading, setLoading]     = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const groupMap = new Map(groups.map((g) => [g.id, g.name]));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, g] = await Promise.all([getPresence(), getGroups()]);
      setPresence(p);
      setGroups(g);
    } catch { /* silencieux */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = async (item: CommercialPresenceItem) => {
    setTogglingId(item.id);
    setPresence((prev) =>
      prev.map((p) =>
        p.id === item.id
          ? { ...p, isWorkingToday: !p.isWorkingToday, workingTodaySince: !p.isWorkingToday ? new Date().toISOString() : null }
          : p,
      ),
    );
    try {
      const updated = await setWorkingToday(item.id, !item.isWorkingToday);
      setPresence((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch {
      setPresence((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? { ...p, isWorkingToday: item.isWorkingToday, workingTodaySince: item.workingTodaySince }
            : p,
        ),
      );
    } finally {
      setTogglingId(null);
    }
  };

  const totalWorking = presence.filter((p) => p.isWorkingToday).length;
  const posteGroups  = buildPosteGroups(presence);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-indigo-600" />
          <h2 className="text-xl font-bold text-gray-900">Présence du jour</h2>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-700">
            {totalWorking} / {presence.length} en service
          </span>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          aria-label="Actualiser la liste de présence"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Actualiser
        </button>
      </div>

      {loading && presence.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Chargement…
        </div>
      ) : presence.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucun commercial trouvé.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posteGroups.map((group) => (
            <div
              key={group.posteId ?? '__none__'}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">
                  {group.posteId ? `Poste : ${group.posteName}` : 'Sans poste'}
                </span>
                <span className="ml-auto text-xs text-gray-400">
                  {group.commercials.filter((c) => c.isWorkingToday).length} / {group.commercials.length}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {group.commercials.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900 w-48">{item.name}</td>
                      <td className="px-4 py-3">
                        {item.isWorkingToday ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                            <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                              En service
                              {item.workingTodaySince
                                ? ` depuis ${formatTime(item.workingTodaySince)}`
                                : ''}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <XCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                              Absent
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {item.groupId && groupMap.has(item.groupId) ? (
                          <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                            {groupMap.get(item.groupId)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => void handleToggle(item)}
                          disabled={togglingId === item.id}
                          aria-label={item.isWorkingToday ? 'Marquer absent' : 'Marquer présent'}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                            item.isWorkingToday
                              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          {togglingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
                          ) : item.isWorkingToday ? (
                            'Marquer absent'
                          ) : (
                            'Marquer présent'
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
