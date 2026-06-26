'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, CalendarDays } from 'lucide-react';
import { getPlanningMonth, getGroups } from '@/app/lib/api/commercial-groups.api';
import { CommercialPlanningEntry, CommercialGroup } from '@/app/lib/definitions';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
  const d = new Date(year, month - 1, 1).getDay(); // 0=dim
  return d === 0 ? 6 : d - 1; // convertit en lun=0 … dim=6
}

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// ─── Légende / badge ─────────────────────────────────────────────────────────

function EntryBadge({ entry }: { entry: CommercialPlanningEntry }) {
  const isAbsence = entry.type === 'absence';
  const isReplacement = isAbsence && entry.linkedCommercialId;
  const isReplacer = !isAbsence && entry.overridePosteId;

  const cls = isReplacement
    ? 'bg-orange-100 text-orange-700'
    : isAbsence
    ? 'bg-red-100 text-red-700'
    : isReplacer
    ? 'bg-purple-100 text-purple-700'
    : 'bg-blue-100 text-blue-700';

  const label = isReplacement
    ? `${entry.commercial?.name ?? '—'} → remplacé`
    : isAbsence
    ? `${entry.commercial?.name ?? '—'} absent`
    : isReplacer
    ? `${entry.commercial?.name ?? '—'} remplaçant`
    : `${entry.commercial?.name ?? '—'} exceptionnel`;

  return (
    <span
      className={`block truncate text-[10px] px-1 py-0.5 rounded font-medium ${cls}`}
      title={label}
    >
      {label}
    </span>
  );
}

// ─── Cellule jour ─────────────────────────────────────────────────────────────

function DayCell({
  day, year, month, entries, isToday,
}: {
  day: number;
  year: number;
  month: number;
  entries: CommercialPlanningEntry[];
  isToday: boolean;
}) {
  return (
    <div
      className={`min-h-[72px] p-1 border border-gray-100 ${
        isToday ? 'bg-indigo-50 border-indigo-200' : 'bg-white'
      }`}
    >
      <p className={`text-xs font-semibold mb-0.5 ${isToday ? 'text-indigo-600' : 'text-gray-500'}`}>
        {day}
      </p>
      <div className="space-y-0.5 overflow-hidden max-h-16">
        {entries.slice(0, 3).map((e) => (
          <EntryBadge key={e.id} entry={e} />
        ))}
        {entries.length > 3 && (
          <span className="text-[10px] text-gray-400">+{entries.length - 3} autres</span>
        )}
      </div>
    </div>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────

export default function CalendarMonthView() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [entries, setEntries]   = useState<CommercialPlanningEntry[]>([]);
  const [groups, setGroups]     = useState<CommercialGroup[]>([]);
  const [filterGroup, setFilterGroup] = useState<string>('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [e, g] = await Promise.all([getPlanningMonth(year, month), getGroups()]);
      setEntries(e);
      setGroups(g);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement.');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { void load(); }, [load]);

  const prevMonth = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  };

  // Groupe name → commercial ids
  const groupCommercialIds = new Set<string>();
  if (filterGroup) {
    const g = groups.find((g) => g.id === filterGroup);
    for (const c of g?.commercials ?? []) groupCommercialIds.add(c.id);
  }

  const filteredEntries = filterGroup
    ? entries.filter((e) => groupCommercialIds.has(e.commercialId))
    : entries;

  // Indexer les entrées par jour
  const byDay = new Map<number, CommercialPlanningEntry[]>();
  for (const e of filteredEntries) {
    const d = parseInt(e.date.slice(8, 10), 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(e);
  }

  const totalDays  = daysInMonth(year, month);
  const startIndex = firstDayOfWeek(year, month); // lun=0
  const cells: (number | null)[] = [
    ...Array<null>(startIndex).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const absences    = filteredEntries.filter((e) => e.type === 'absence').length;
  const replacements = filteredEntries.filter((e) => e.type === 'exceptional' && e.overridePosteId).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-indigo-600" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Calendrier mensuel</p>
            <p className="text-xs text-gray-500">
              {absences} absence{absences > 1 ? 's' : ''} · {replacements} remplacement{replacements > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtre groupe */}
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="">Tous les groupes</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>

          {/* Navigation mois */}
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <span className="px-3 py-1.5 text-sm font-medium text-gray-800 min-w-[130px] text-center">
              {MONTHS_FR[month - 1]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Légende */}
      <div className="flex gap-3 text-[11px] flex-wrap">
        {[
          { cls: 'bg-red-100 text-red-700',    label: 'Absent' },
          { cls: 'bg-orange-100 text-orange-700', label: 'Remplacé' },
          { cls: 'bg-purple-100 text-purple-700', label: 'Remplaçant' },
          { cls: 'bg-blue-100 text-blue-700',  label: 'Exceptionnel' },
        ].map(({ cls, label }) => (
          <span key={label} className={`px-2 py-0.5 rounded font-medium ${cls}`}>{label}</span>
        ))}
      </div>

      {/* Grille calendrier */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Chargement…
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Jours de la semaine */}
          <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
            {DAYS_FR.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-medium text-gray-500">
                {d}
              </div>
            ))}
          </div>

          {/* Cellules */}
          <div className="grid grid-cols-7">
            {cells.map((day, idx) =>
              day === null ? (
                <div key={`empty-${idx}`} className="min-h-[72px] bg-gray-50 border border-gray-100" />
              ) : (
                <DayCell
                  key={day}
                  day={day}
                  year={year}
                  month={month}
                  entries={byDay.get(day) ?? []}
                  isToday={todayStr === `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`}
                />
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
