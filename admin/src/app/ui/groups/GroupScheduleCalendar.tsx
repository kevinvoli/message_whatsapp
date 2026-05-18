'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { getGroupSchedule } from '../../lib/api/commercial-groups.api';
import { GroupScheduleDayItem } from '../../lib/definitions';

interface GroupScheduleCalendarProps {
  groupId: string;
  refreshKey?: number;
}

const JOURS_SEMAINE = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

/** Formate une date JS en 'YYYY-MM-DD' sans décalage timezone */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}

/** Retourne 0 (lundi) … 6 (dimanche) depuis un objet Date */
function lundiBasedDayOfWeek(d: Date): number {
  // getDay() : 0=dim, 1=lun … 6=sam
  return (d.getDay() + 6) % 7;
}

export default function GroupScheduleCalendar({ groupId, refreshKey }: GroupScheduleCalendarProps) {
  const today = new Date();
  const [currentYear, setCurrentYear]   = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed
  const [data, setData]                 = useState<GroupScheduleDayItem[]>([]);
  const [loading, setLoading]           = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Charger les 3 mois autour du mois courant affiché
      const firstOfMonth = new Date(currentYear, currentMonth, 1);
      const from = toDateString(firstOfMonth);
      // Fin : dernier jour du mois courant + 2 mois supplémentaires
      const lastDate = new Date(currentYear, currentMonth + 3, 0);
      const to = toDateString(lastDate);
      const result = await getGroupSchedule(groupId, from, to);
      setData(result);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [groupId, currentYear, currentMonth]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const goToPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const monthLabel = new Date(currentYear, currentMonth, 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

  const todayStr = toDateString(today);

  // Construction de la grille
  const firstOfMonth   = new Date(currentYear, currentMonth, 1);
  const daysInMonth    = new Date(currentYear, currentMonth + 1, 0).getDate();
  const startPadding   = lundiBasedDayOfWeek(firstOfMonth); // cases vides en début

  // Map date → isWorkDay pour accès O(1)
  const scheduleMap = new Map<string, boolean>();
  for (const item of data) {
    scheduleMap.set(item.date, item.isWorkDay);
  }

  // Cases de la grille : null = padding, number = numéro du jour
  const cells: (number | null)[] = [
    ...Array<null>(startPadding).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Compléter à un multiple de 7
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return (
    <div className="mt-4 border border-gray-200 rounded-lg p-4 bg-white space-y-3">
      {/* En-tête navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={goToPrevMonth}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          aria-label="Mois précédent"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-gray-800 capitalize">{monthLabel}</span>
        <button
          onClick={goToNextMonth}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          aria-label="Mois suivant"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-28 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement…
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">
          Aucun planning généré — cliquez sur Generer 3 mois
        </div>
      ) : (
        <>
          {/* Grille des jours */}
          <div className="grid grid-cols-7 gap-px text-center">
            {/* En-têtes colonnes */}
            {JOURS_SEMAINE.map((j) => (
              <div key={j} className="text-xs font-medium text-gray-400 py-1">
                {j}
              </div>
            ))}

            {/* Cases */}
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={`pad-${idx}`} className="h-9" />;
              }

              const dateStr = toDateString(new Date(currentYear, currentMonth, day));
              const isWorkDay = scheduleMap.get(dateStr);
              const isToday   = dateStr === todayStr;
              const hasData   = scheduleMap.has(dateStr);

              let cellClass =
                'h-9 w-9 mx-auto flex items-center justify-center rounded-full text-xs font-medium border ';

              if (!hasData) {
                // Jour du mois mais sans donnée planning
                cellClass += 'bg-white border-gray-100 text-gray-300';
              } else if (isWorkDay) {
                cellClass += 'bg-green-100 text-green-800 border-green-300';
              } else {
                cellClass += 'bg-gray-50 text-gray-400 border-gray-100';
              }

              if (isToday) {
                cellClass += ' ring-2 ring-indigo-500';
              }

              return (
                <div key={dateStr} className="py-0.5 flex items-center justify-center">
                  <div className={cellClass}>{day}</div>
                </div>
              );
            })}
          </div>

          {/* Légende */}
          <div className="flex items-center gap-4 pt-1 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full bg-green-100 border border-green-300" />
              <span className="text-xs text-gray-500">Travail</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full bg-gray-50 border border-gray-200" />
              <span className="text-xs text-gray-500">Repos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full border border-gray-200 ring-2 ring-indigo-500" />
              <span className="text-xs text-gray-500">Aujourd'hui</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
