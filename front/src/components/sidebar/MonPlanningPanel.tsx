'use client';

import React, { useState } from 'react';
import { CalendarDays, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

type TimeSlot = 'full' | 'morning' | 'afternoon';

const TIME_SLOT_OPTIONS: { value: TimeSlot; label: string }[] = [
  { value: 'full',      label: 'Journée entière' },
  { value: 'morning',   label: 'Matin seulement' },
  { value: 'afternoon', label: 'Après-midi seulement' },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function MonPlanningPanel() {
  const today = todayStr();
  const [dateStart, setDateStart] = useState(today);
  const [dateEnd, setDateEnd]     = useState(today);
  const [timeSlot, setTimeSlot]   = useState<TimeSlot>('full');
  const [reason, setReason]       = useState('');
  const [saving, setSaving]       = useState(false);
  const [result, setResult]       = useState<{ created: number; skipped: number } | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const handleSubmit = async () => {
    if (dateEnd < dateStart) { setError('La date de fin doit être ≥ à la date de début.'); return; }
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/planning/self/absence`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateStart, dateEnd, reason: reason.trim() || undefined, timeSlot }),
      });
      if (!res.ok) {
        const data = await res.json() as { message?: string };
        throw new Error(data.message ?? 'Erreur lors de la déclaration.');
      }
      const data = await res.json() as { created: number; skipped: number };
      setResult(data);
      setReason('');
      setDateStart(today);
      setDateEnd(today);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-indigo-500 flex-shrink-0" />
        <p className="text-xs font-semibold text-gray-800">Déclarer une absence</p>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-[10px] text-gray-500 mb-0.5">Du</label>
            <input
              type="date" value={dateStart} min={today}
              onChange={(e) => { setDateStart(e.target.value); if (e.target.value > dateEnd) setDateEnd(e.target.value); }}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] text-gray-500 mb-0.5">Au</label>
            <input
              type="date" value={dateEnd} min={dateStart}
              onChange={(e) => setDateEnd(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">Créneau</label>
          <select
            value={timeSlot} onChange={(e) => setTimeSlot(e.target.value as TimeSlot)}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
          >
            {TIME_SLOT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">Raison (optionnelle)</label>
          <input
            type="text" value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="ex : rendez-vous médical..."
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </div>
      )}

      {result && (
        <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 rounded px-2 py-1.5">
          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {result.created} jour{result.created > 1 ? 's' : ''} enregistré{result.created > 1 ? 's' : ''}
          {result.skipped > 0 ? `, ${result.skipped} ignoré${result.skipped > 1 ? 's' : ''} (déjà planifié)` : ''}
        </div>
      )}

      <button
        onClick={() => void handleSubmit()} disabled={saving}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
      >
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Envoyer la déclaration
      </button>
    </div>
  );
}
