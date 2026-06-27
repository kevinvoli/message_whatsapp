'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Users, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  Calendar, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';
import { getPresenceHistory } from '../lib/api/commercial-groups.api';
import { setWorkingToday } from '../lib/api/commerciaux.api';
import { PresenceEntry, PresenceHistoryResponse } from '../lib/definitions';
import { formatTime, formatDateShort } from '../lib/dateUtils';

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayString(): string {
  return toDateString(new Date());
}

function formatConnectedMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function sortEntries(entries: PresenceEntry[]): PresenceEntry[] {
  return [...entries].sort((a, b) => {
    if (a.firstLoginAt && !b.firstLoginAt) return -1;
    if (!a.firstLoginAt && b.firstLoginAt) return 1;
    if (!a.firstLoginAt && !b.firstLoginAt) {
      if (a.planningStatus === 'absent' && b.planningStatus !== 'absent') return -1;
      if (a.planningStatus !== 'absent' && b.planningStatus === 'absent') return 1;
    }
    return a.commercialName.localeCompare(b.commercialName);
  });
}

interface GroupedEntries {
  groupName: string;
  entries: PresenceEntry[];
}

function groupByGroup(entries: PresenceEntry[]): GroupedEntries[] {
  const map = new Map<string, PresenceEntry[]>();
  for (const entry of entries) {
    const key = entry.groupName ?? 'Sans groupe';
    const existing = map.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      map.set(key, [entry]);
    }
  }
  return Array.from(map.entries()).map(([groupName, ents]) => ({
    groupName,
    entries: sortEntries(ents),
  }));
}

interface PlanningBadgeProps {
  status: PresenceEntry['planningStatus'];
}

function PlanningBadge({ status }: PlanningBadgeProps) {
  if (status === 'absent') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
        Absent declaré
      </span>
    );
  }
  if (status === 'exceptional') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        Exceptionnel
      </span>
    );
  }
  if (status === 'normal') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        Planifié
      </span>
    );
  }
  return <span className="text-gray-400">—</span>;
}

interface PresenceBadgeProps {
  entry: PresenceEntry;
}

function PresenceBadge({ entry }: PresenceBadgeProps) {
  if (entry.groupIsWorkDay === false) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        Repos
      </span>
    );
  }
  if (entry.firstLoginAt) {
    if (entry.planningStatus === 'absent') {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
            Présent (absent déclaré)
          </span>
        </div>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        Présent
      </span>
    );
  }
  if (entry.planningStatus === 'absent') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        Absent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      Non connecté
    </span>
  );
}

interface PresenceTableProps {
  entries: PresenceEntry[];
  togglingId: string | null;
  isToday: boolean;
  onToggle: (entry: PresenceEntry) => void;
}

function PresenceTable({ entries, togglingId, isToday, onToggle }: PresenceTableProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
          <th className="px-5 py-2 font-medium">Commercial</th>
          <th className="px-4 py-2 font-medium">Groupe</th>
          <th className="px-4 py-2 font-medium">1ère connexion</th>
          <th className="px-4 py-2 font-medium">Sessions</th>
          <th className="px-4 py-2 font-medium">Temps connecté</th>
          <th className="px-4 py-2 font-medium">Statut planning</th>
          <th className="px-4 py-2 font-medium">Présence</th>
          {isToday && <th className="px-5 py-2 font-medium text-right">Correction</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {entries.map((entry) => (
          <tr key={entry.commercialId} className="hover:bg-gray-50">
            <td className="px-5 py-3 font-medium text-gray-900">{entry.commercialName}</td>
            <td className="px-4 py-3 text-xs text-gray-500">
              {entry.groupName ? (
                <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                  {entry.groupName}
                </span>
              ) : '—'}
            </td>
            <td className="px-4 py-3">
              {entry.firstLoginAt ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                  Présent depuis {formatTime(entry.firstLoginAt)}
                </span>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </td>
            <td className="px-4 py-3 text-gray-700 text-center">{entry.sessionCount}</td>
            <td className="px-4 py-3 text-gray-700">
              {entry.totalConnectedMinutes > 0
                ? formatConnectedMinutes(entry.totalConnectedMinutes)
                : '—'}
            </td>
            <td className="px-4 py-3">
              <PlanningBadge status={entry.planningStatus} />
            </td>
            <td className="px-4 py-3">
              <PresenceBadge entry={entry} />
            </td>
            {isToday && (
              <td className="px-5 py-3 text-right">
                <button
                  onClick={() => onToggle(entry)}
                  disabled={togglingId === entry.commercialId}
                  aria-label={entry.isWorkingToday ? 'Marquer absent' : 'Marquer présent'}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                    entry.isWorkingToday
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {togglingId === entry.commercialId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
                  ) : entry.isWorkingToday ? (
                    'Marquer absent'
                  ) : (
                    'Marquer présent'
                  )}
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PresenceView() {
  const [selectedDate, setSelectedDate] = useState<string>(todayString());
  const [data, setData] = useState<PresenceHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isToday = selectedDate === todayString();

  const load = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const result = await getPresenceHistory(date);
      setData(result);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(selectedDate);
  }, [load, selectedDate]);

  useEffect(() => {
    if (!isToday) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      void load(selectedDate);
    }, 60_000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isToday, load, selectedDate]);

  function navigateDay(delta: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    const next = toDateString(d);
    if (next > todayString()) return;
    setSelectedDate(next);
  }

  const handleToggle = async (entry: PresenceEntry) => {
    setTogglingId(entry.commercialId);
    try {
      await setWorkingToday(entry.commercialId, !entry.isWorkingToday);
      await load(selectedDate);
    } catch {
    } finally {
      setTogglingId(null);
    }
  };

  const entries = data?.entries ?? [];
  const presentCount = entries.filter((e) => e.firstLoginAt !== null).length;
  const grouped = groupByGroup(entries);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-indigo-600" />
          <h2 className="text-xl font-bold text-gray-900">Présence du jour</h2>
          {data && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-700">
              {presentCount} présents / {entries.length} commerciaux
            </span>
          )}
        </div>
        <button
          onClick={() => void load(selectedDate)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          aria-label="Actualiser la liste de présence"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Actualiser
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => navigateDay(-1)}
          aria-label="Jour précédent"
          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={selectedDate}
            max={todayString()}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              if (e.target.value <= todayString()) {
                setSelectedDate(e.target.value);
              }
            }}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            aria-label="Sélectionner une date"
          />
          <span className="text-sm text-gray-500">{formatDateShort(selectedDate)}</span>
        </div>
        <button
          onClick={() => navigateDay(1)}
          disabled={selectedDate >= todayString()}
          aria-label="Jour suivant"
          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {!isToday && (
          <button
            onClick={() => setSelectedDate(todayString())}
            className="px-3 py-1.5 rounded-lg border border-indigo-200 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
          >
            Aujourd'hui
          </button>
        )}
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center h-32 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Chargement…
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucune donnée de présence pour cette date.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ groupName, entries: groupEntries }) => (
            <div
              key={groupName}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">{groupName}</span>
                <span className="ml-auto text-xs text-gray-400">
                  {groupEntries.filter((e) => e.firstLoginAt !== null).length} présents / {groupEntries.length}
                </span>
              </div>
              <div className="overflow-x-auto">
                <PresenceTable
                  entries={groupEntries}
                  togglingId={togglingId}
                  isToday={isToday}
                  onToggle={handleToggle}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {isToday && entries.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setCorrectionOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            aria-expanded={correctionOpen}
          >
            <span>Correction manuelle (impact dispatcher)</span>
            {correctionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {correctionOpen && (
            <div className="border-t border-gray-100">
              <div className="px-5 py-3 flex items-start gap-2 bg-amber-50 border-b border-amber-100">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  Modifier isWorkingToday impacte l'assignation des conversations en temps réel.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                      <th className="px-5 py-2 font-medium">Commercial</th>
                      <th className="px-4 py-2 font-medium">Groupe</th>
                      <th className="px-4 py-2 font-medium">Statut actuel</th>
                      <th className="px-5 py-2 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortEntries(entries).map((entry) => (
                      <tr key={entry.commercialId} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">{entry.commercialName}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {entry.groupName ? (
                            <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                              {entry.groupName}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {entry.isWorkingToday ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              En service
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                              Absent
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => void handleToggle(entry)}
                            disabled={togglingId === entry.commercialId}
                            aria-label={entry.isWorkingToday ? 'Marquer absent' : 'Marquer présent'}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                              entry.isWorkingToday
                                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                            }`}
                          >
                            {togglingId === entry.commercialId ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
                            ) : entry.isWorkingToday ? (
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
