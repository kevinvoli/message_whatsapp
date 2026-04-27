'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Clock, Coffee, Home, Loader2, LogIn, RefreshCw } from 'lucide-react';
import {
  getToday,
  logEvent,
  DailyAttendanceSummary,
  AttendanceEventType,
  EVENT_LABELS,
  STATUS_LABELS,
  AttendanceStatus,
} from '@/lib/workAttendanceApi';

const STATUS_STYLE: Record<AttendanceStatus, { bg: string; text: string; dot: string }> = {
  not_clocked_in: { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400'   },
  working:        { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  on_break:       { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  done:           { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
};

/** Boutons d'action selon l'état courant. */
const NEXT_EVENTS: Record<AttendanceStatus, AttendanceEventType[]> = {
  not_clocked_in: ['arrivee'],
  working:        ['depart_pause', 'depart_maison'],
  on_break:       ['retour_pause'],
  done:           [],
};

const EVENT_ICON: Record<AttendanceEventType, React.ElementType> = {
  arrivee:       LogIn,
  depart_pause:  Coffee,
  retour_pause:  CheckCircle,
  depart_maison: Home,
};

const EVENT_COLOR: Record<AttendanceEventType, string> = {
  arrivee:       'bg-green-600 hover:bg-green-700',
  depart_pause:  'bg-amber-500 hover:bg-amber-600',
  retour_pause:  'bg-green-600 hover:bg-green-700',
  depart_maison: 'bg-blue-600 hover:bg-blue-700',
};

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function AttendancePanel() {
  const [summary, setSummary] = useState<DailyAttendanceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState<AttendanceEventType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSummary(await getToday()); }
    catch { /* silencieux */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleEvent = async (eventType: AttendanceEventType) => {
    setPosting(eventType);
    try {
      await logEvent(eventType);
      await load();
    } catch { /* silencieux */ }
    finally { setPosting(null); }
  };

  const status = summary?.status ?? 'not_clocked_in';
  const style  = STATUS_STYLE[status];
  const next   = NEXT_EVENTS[status];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-600" />
          <div>
            <p className="font-semibold text-gray-900 text-sm">Pointage</p>
            <p className="text-xs text-gray-400">
              {summary ? new Date(summary.workDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '—'}
            </p>
          </div>
        </div>
        <button onClick={() => void load()} disabled={loading} className="p-1 rounded hover:bg-gray-100 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Statut courant */}
        <div className={`rounded-xl px-4 py-3 flex items-center gap-3 ${style.bg}`}>
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
          <div>
            <p className={`text-sm font-semibold ${style.text}`}>{STATUS_LABELS[status]}</p>
            {summary && summary.minutesWorked > 0 && (
              <p className={`text-xs ${style.text} opacity-80`}>
                {formatMinutes(summary.minutesWorked)} travaillé(es)
                {summary.minutesOnBreak > 0 && ` · ${formatMinutes(summary.minutesOnBreak)} de pause`}
              </p>
            )}
          </div>
        </div>

        {/* Boutons d'action */}
        {next.length > 0 && (
          <div className="space-y-2">
            {next.map((evt) => {
              const Icon = EVENT_ICON[evt];
              return (
                <button
                  key={evt}
                  onClick={() => void handleEvent(evt)}
                  disabled={!!posting}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 ${EVENT_COLOR[evt]}`}
                >
                  {posting === evt
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Icon className="w-4 h-4" />
                  }
                  {EVENT_LABELS[evt]}
                </button>
              );
            })}
          </div>
        )}

        {status === 'done' && (
          <div className="flex flex-col items-center py-4 text-gray-400 gap-1">
            <CheckCircle className="w-8 h-8 text-blue-400" />
            <p className="text-xs text-center">Bonne journée ! Journée de travail terminée.</p>
          </div>
        )}

        {/* Historique du jour */}
        {summary && summary.events.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Événements du jour</p>
            <div className="space-y-1">
              {summary.events.map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-gray-400 w-12 text-right flex-shrink-0">{formatTime(e.eventAt)}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                  <span className="text-gray-700">{EVENT_LABELS[e.eventType]}</span>
                  {e.note && <span className="text-xs text-gray-400 truncate">({e.note})</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
