'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Filter, Loader2 } from 'lucide-react';
import { getGroups, getGroupSchedule } from '../../lib/api/commercial-groups.api';
import { CommercialGroup } from '../../lib/definitions';

const PALETTE = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-red-500',
  'bg-amber-500',
  'bg-cyan-500',
  'bg-lime-500',
];

const DAYS_HEADER = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function lundiDow(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export default function GroupsCalendarView() {
  const today = new Date();
  const [currentYear, setCurrentYear]   = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [groups, setGroups]             = useState<CommercialGroup[]>([]);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [schedules, setSchedules]       = useState<Map<string, Map<string, boolean>>>(new Map());
  const [loadingGroups, setLoadingGroups]       = useState(true);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [dropdownOpen, setDropdownOpen]         = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoadingGroups(true);
    getGroups()
      .then((g) => {
        setGroups(g);
        setSelectedIds(new Set(g.map((x) => x.id)));
      })
      .catch(() => {})
      .finally(() => setLoadingGroups(false));
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const loadSchedules = useCallback(async () => {
    if (selectedIds.size === 0) {
      setSchedules(new Map());
      return;
    }
    setLoadingSchedules(true);
    const from = toDateStr(new Date(currentYear, currentMonth, 1));
    const to   = toDateStr(new Date(currentYear, currentMonth + 1, 0));

    const results = await Promise.allSettled(
      [...selectedIds].map(async (id) => {
        const data = await getGroupSchedule(id, from, to);
        const map  = new Map<string, boolean>();
        for (const d of data) map.set(d.date, d.isWorkDay);
        return [id, map] as [string, Map<string, boolean>];
      }),
    );

    const next = new Map<string, Map<string, boolean>>();
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const [id, map] = r.value;
        next.set(id, map);
      }
    }
    setSchedules(next);
    setLoadingSchedules(false);
  }, [selectedIds, currentYear, currentMonth]);

  useEffect(() => { void loadSchedules(); }, [loadSchedules]);

  const toggleGroup = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  };

  const monthLabel  = new Date(currentYear, currentMonth, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const todayStr    = toDateStr(today);
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const startPad    = lundiDow(new Date(currentYear, currentMonth, 1));

  const cells: (number | null)[] = [
    ...Array<null>(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedGroups = groups.filter((g) => selectedIds.has(g.id));

  const triggerLabel =
    selectedIds.size === groups.length
      ? 'Tous les groupes'
      : `${selectedIds.size} groupe${selectedIds.size > 1 ? 's' : ''} sélectionné${selectedIds.size > 1 ? 's' : ''}`;

  if (loadingGroups) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Chargement des groupes…
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-gray-400">
        Aucun groupe configuré. Créez des groupes dans l&apos;onglet &quot;Groupes commerciaux&quot;.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Filtre groupes — dropdown multi-select ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">Groupes affichés</span>
        </div>

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center justify-between w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-gray-300 transition-colors"
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
          >
            <span>{triggerLabel}</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-xl shadow-lg w-full min-w-[200px]">
              <div className="flex gap-3 px-3 pt-3 pb-2 border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set(groups.map((g) => g.id)))}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Tous
                </button>
                <span className="text-gray-300 text-xs">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-gray-400 hover:underline"
                >
                  Aucun
                </button>
              </div>

              <ul role="listbox" aria-multiselectable="true" className="py-1 max-h-60 overflow-y-auto">
                {groups.map((g, idx) => {
                  const dot      = PALETTE[idx % PALETTE.length];
                  const checked  = selectedIds.has(g.id);
                  return (
                    <li key={g.id} role="option" aria-selected={checked}>
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.id)}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={checked}
                          className="w-3.5 h-3.5 accent-indigo-600 flex-shrink-0 pointer-events-none"
                        />
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
                        <span className="text-gray-700">{g.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ── Calendrier + Légende côte à côte ── */}
      <div className="flex flex-col md:flex-row gap-4 items-start">
        {/* Calendrier */}
        <div className="flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              aria-label="Mois précédent"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <span className="text-base font-semibold text-gray-800 capitalize">{monthLabel}</span>
              {loadingSchedules && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            </div>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              aria-label="Mois suivant"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {selectedGroups.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              Sélectionnez au moins un groupe pour afficher le planning.
            </div>
          ) : (
            <div className="p-4">
              <div className="grid grid-cols-7 mb-1">
                {DAYS_HEADER.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, idx) => {
                  if (day === null) return <div key={`pad-${idx}`} />;

                  const dateStr = toDateStr(new Date(currentYear, currentMonth, day));
                  const isToday = dateStr === todayStr;

                  return (
                    <div
                      key={dateStr}
                      className={`min-h-[3.5rem] rounded-lg p-1.5 border ${
                        isToday
                          ? 'border-indigo-400 bg-indigo-50/60'
                          : 'border-gray-100 bg-gray-50/40'
                      }`}
                    >
                      <p className={`text-xs font-semibold mb-1 ${isToday ? 'text-indigo-600' : 'text-gray-500'}`}>
                        {day}
                      </p>
                      <div className="flex flex-wrap gap-0.5">
                        {selectedGroups.map((g) => {
                          const gIdx     = groups.indexOf(g);
                          const dot      = PALETTE[gIdx % PALETTE.length];
                          const groupMap = schedules.get(g.id);
                          if (!groupMap) return null;
                          const isWork = groupMap.get(dateStr);
                          if (isWork === undefined) return null;
                          return (
                            <span
                              key={g.id}
                              title={`${g.name} — ${isWork ? 'En service' : 'Repos'}`}
                              className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                                isWork ? dot : 'bg-gray-200'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Légende */}
        {selectedGroups.length > 0 && (
          <div className="w-44 flex-shrink-0 bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Légende</p>
            <div className="flex flex-col gap-2">
              {selectedGroups.map((g) => {
                const gIdx = groups.indexOf(g);
                const dot  = PALETTE[gIdx % PALETTE.length];
                return (
                  <div key={g.id} className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${dot}`} />
                    <span className="text-xs text-gray-600">{g.name}</span>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 mt-1 pt-1 border-t border-gray-100">
                <span className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-200" />
                <span className="text-xs text-gray-400">Repos</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
