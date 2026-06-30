'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import {
  getBreakSchedules,
  upsertBreakSchedule,
  deleteBreakSchedule,
} from '../../lib/api/commercial-groups.api';
import { SubGroupBreakSchedule } from '../../lib/definitions';

interface BreakSchedulePanelProps {
  subGroupId: string;
}

interface FormState {
  startTime: string;
  endTime: string;
  maxDurationMinutes: number;
  reminderIntervalMinutes: number;
  popupMessageText: string;
}

const DEFAULT_FORM: FormState = {
  startTime: '',
  endTime: '',
  maxDurationMinutes: 60,
  reminderIntervalMinutes: 5,
  popupMessageText: '',
};

function scheduleToForm(s: SubGroupBreakSchedule): FormState {
  return {
    startTime: s.startTime,
    endTime: s.endTime,
    maxDurationMinutes: s.maxDurationMinutes,
    reminderIntervalMinutes: s.reminderIntervalMinutes,
    popupMessageText: s.popupMessageText ?? '',
  };
}

export default function BreakSchedulePanel({ subGroupId }: BreakSchedulePanelProps) {
  const [schedule, setSchedule] = useState<SubGroupBreakSchedule | null>(null);
  const [form, setForm]         = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getBreakSchedules(subGroupId).then((list) => {
      if (cancelled) return;
      const existing = list[0] ?? null;
      setSchedule(existing);
      setForm(existing ? scheduleToForm(existing) : DEFAULT_FORM);
    }).catch((err: unknown) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [subGroupId]);

  const validate = (): string | null => {
    if (!form.startTime) return "L'heure de début est requise.";
    if (!form.endTime) return "L'heure de fin est requise.";
    if (form.endTime <= form.startTime) return "L'heure de fin doit être après l'heure de début.";
    if (form.maxDurationMinutes < 1) return 'La durée maximale doit être ≥ 1 minute.';
    if (form.reminderIntervalMinutes < 1) return "L'intervalle de rappel doit être ≥ 1 minute.";
    if (form.popupMessageText.length > 1000) return 'Le message ne peut pas dépasser 1000 caractères.';
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError(null);
    try {
      const saved = await upsertBreakSchedule(subGroupId, {
        startTime: form.startTime,
        endTime: form.endTime,
        maxDurationMinutes: form.maxDurationMinutes,
        reminderIntervalMinutes: form.reminderIntervalMinutes,
        popupMessageText: form.popupMessageText.trim() || null,
      });
      setSchedule(saved);
      setForm(scheduleToForm(saved));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!schedule) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteBreakSchedule(schedule.id);
      setSchedule(null);
      setForm(DEFAULT_FORM);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression.');
    } finally {
      setDeleting(false);
    }
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Heure de début *
          </label>
          <input
            type="time"
            value={form.startTime}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('startTime', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Heure de fin *
          </label>
          <input
            type="time"
            value={form.endTime}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('endTime', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Durée max (minutes) *
          </label>
          <input
            type="number"
            min={1}
            value={form.maxDurationMinutes}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setField('maxDurationMinutes', Math.max(1, parseInt(e.target.value, 10) || 1))
            }
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Rappel toutes les (minutes) *
          </label>
          <input
            type="number"
            min={1}
            value={form.reminderIntervalMinutes}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setField('reminderIntervalMinutes', Math.max(1, parseInt(e.target.value, 10) || 1))
            }
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Message popup{' '}
          <span className="font-normal text-gray-400">(optionnel, max 1000 caractères)</span>
        </label>
        <textarea
          rows={3}
          value={form.popupMessageText}
          maxLength={1000}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setField('popupMessageText', e.target.value)}
          placeholder="Message affiché aux commerciaux lors de la pause…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
        />
        <p className="text-xs text-gray-400 text-right mt-0.5">
          {form.popupMessageText.length}/1000
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => void handleSave()}
          disabled={saving || deleting}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </button>
        {schedule && (
          <button
            onClick={() => void handleDelete()}
            disabled={saving || deleting}
            className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Supprimer
          </button>
        )}
      </div>
    </div>
  );
}
