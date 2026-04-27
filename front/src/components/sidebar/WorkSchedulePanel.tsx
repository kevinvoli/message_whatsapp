'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Clock, Coffee, Loader2, RefreshCw } from 'lucide-react';
import { getMySchedule, WorkScheduleDay, DAY_LABELS, DayOfWeek } from '@/lib/workScheduleApi';

const TODAY_DAY = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() as DayOfWeek;

const DAY_ORDER: DayOfWeek[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];

export default function WorkSchedulePanel() {
  const [schedule, setSchedule] = useState<WorkScheduleDay[]>([]);
  const [loading, setLoading]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSchedule(await getMySchedule());
    } catch { /* silencieux */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const scheduledDays = new Map(schedule.map((d) => [d.dayOfWeek, d]));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-indigo-600" />
          <div>
            <p className="font-semibold text-gray-900 text-sm">Planning de la semaine</p>
            <p className="text-xs text-gray-400">{schedule.length} jour(s) configuré(s)</p>
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
          title="Rafraîchir"
        >
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto">
        {loading && schedule.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Chargement…
          </div>
        ) : schedule.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm gap-2 px-4 text-center">
            <CalendarDays className="w-8 h-8 text-gray-300" />
            <span>Aucun planning configuré. Contactez votre superviseur.</span>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {DAY_ORDER.map((day) => {
              const entry   = scheduledDays.get(day);
              const isToday = day === TODAY_DAY;

              return (
                <div
                  key={day}
                  className={`px-4 py-3 ${isToday ? 'bg-indigo-50' : ''} ${!entry ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-indigo-700' : 'text-gray-500'}`}>
                      {DAY_LABELS[day]}
                    </span>
                    {isToday && (
                      <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-medium">
                        Aujourd&apos;hui
                      </span>
                    )}
                    {entry?.source === 'group' && (
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                        Poste
                      </span>
                    )}
                  </div>

                  {entry ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-sm text-gray-800">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span className="font-medium">{entry.startTime}</span>
                        <span className="text-gray-400">–</span>
                        <span className="font-medium">{entry.endTime}</span>
                      </div>

                      {entry.breakSlots.length > 0 && (
                        <div className="space-y-0.5 pl-5">
                          {entry.breakSlots.map((b, i) => (
                            <div key={i} className="flex items-center gap-1 text-xs text-gray-500">
                              <Coffee className="w-3 h-3 text-amber-500" />
                              <span>Pause {b.start} – {b.end}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 pl-0.5">Repos</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
