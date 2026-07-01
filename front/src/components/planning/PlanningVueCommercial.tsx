'use client';
import { useState } from 'react';
import { usePlanningMois } from '@/hooks/usePlanningCommercial';

const TYPE_CLASSES: Record<string, string> = {
  absence: 'bg-amber-100 text-amber-700',
  exceptional: 'bg-blue-100 text-blue-700',
};

const SLOT_LABELS: Record<string, string> = {
  full: 'Journée',
  morning: 'Matin',
  afternoon: 'Après-midi',
};

export function PlanningVueCommercial() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const { entries, loading } = usePlanningMois(year, month);

  const entryByDate = Object.fromEntries(entries.map((e) => [e.date, e]));
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  function navigate(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const offset = (firstDay + 6) % 7;

  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthLabel = new Date(year, month - 1).toLocaleString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 w-full">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => navigate(-1)}
          className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          ‹
        </button>
        <span className="font-medium text-gray-800 capitalize text-sm">{monthLabel}</span>
        <button
          onClick={() => navigate(1)}
          className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-xs text-gray-400 mb-1 font-medium">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-6 text-sm">Chargement…</div>
      ) : (
        <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
          {cells.map((day, i) => {
            if (!day) return <span key={i} />;
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const entry = entryByDate[dateStr];
            const isToday = dateStr === todayStr;
            return (
              <span
                key={i}
                title={
                  entry
                    ? `${entry.type === 'absence' ? 'Absence' : 'Exceptionnel'} — ${SLOT_LABELS[entry.timeSlot] ?? ''}${entry.reason ? ` (${entry.reason})` : ''}`
                    : undefined
                }
                className={[
                  'rounded-full w-7 h-7 flex items-center justify-center mx-auto cursor-default',
                  isToday ? 'ring-2 ring-offset-1 ring-gray-400 font-bold' : '',
                  entry ? TYPE_CLASSES[entry.type] : 'text-gray-700 hover:bg-gray-50',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {day}
              </span>
            );
          })}
        </div>
      )}

      <div className="flex gap-4 mt-3 text-xs text-gray-500 border-t border-gray-100 pt-3">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-100 inline-block flex-shrink-0" />
          Absence
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-100 inline-block flex-shrink-0" />
          Exceptionnel
        </span>
      </div>
    </div>
  );
}
