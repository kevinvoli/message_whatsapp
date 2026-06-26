'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, X, Clock } from 'lucide-react';
import { SubGroupBreakSchedule } from '@/app/lib/definitions';
import { getBreakSchedules, upsertBreakSchedule, deleteBreakSchedule } from '@/app/lib/api/commercial-groups.api';

interface BreakScheduleFormProps {
  subGroupId: string;
  onClose: () => void;
}

interface FormState {
  startTime: string;
  endTime: string;
  reminderIntervalMinutes: number;
  popupMessageText: string;
  popupAudioAssetId: string;
  maxDurationMinutes: number;
}

const EMPTY_FORM: FormState = {
  startTime: '',
  endTime: '',
  reminderIntervalMinutes: 5,
  popupMessageText: '',
  popupAudioAssetId: '',
  maxDurationMinutes: 60,
};

export default function BreakScheduleForm({ subGroupId, onClose }: BreakScheduleFormProps) {
  const [schedules, setSchedules] = useState<SubGroupBreakSchedule[]>([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm]           = useState<FormState>(EMPTY_FORM);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBreakSchedules(subGroupId);
      setSchedules(data);
    } catch {
      setError('Impossible de charger les plages de pause.');
    } finally {
      setLoading(false);
    }
  }, [subGroupId]);

  useEffect(() => { void load(); }, [load]);

  const handleChange = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.startTime || !form.endTime) {
      setError('Heure de début et de fin requises.');
      return;
    }
    if (form.startTime >= form.endTime) {
      setError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertBreakSchedule(subGroupId, {
        startTime: form.startTime,
        endTime: form.endTime,
        reminderIntervalMinutes: form.reminderIntervalMinutes,
        popupMessageText: form.popupMessageText.trim() || null,
        popupAudioAssetId: form.popupAudioAssetId.trim() || null,
        maxDurationMinutes: form.maxDurationMinutes,
      });
      setForm(EMPTY_FORM);
      void load();
    } catch {
      setError("Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteBreakSchedule(id);
      void load();
    } catch { /* silencieux */ }
    finally { setDeletingId(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-semibold text-gray-900">Plages de pause</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100"
            aria-label="Fermer"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-16 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement…
            </div>
          ) : schedules.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plages configurées</p>
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-4 py-3 bg-indigo-50 rounded-lg"
                >
                  <div>
                    <span className="text-sm font-medium text-indigo-900">
                      {s.startTime} – {s.endTime}
                    </span>
                    <span className="ml-3 text-xs text-indigo-600">
                      durée max {s.maxDurationMinutes} min · rappel /{s.reminderIntervalMinutes} min
                    </span>
                    {s.popupMessageText && (
                      <p className="text-xs text-indigo-500 mt-0.5 truncate max-w-xs">{s.popupMessageText}</p>
                    )}
                  </div>
                  <button
                    onClick={() => void handleDelete(s.id)}
                    disabled={deletingId === s.id}
                    aria-label="Supprimer cette plage"
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                  >
                    {deletingId === s.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-2">Aucune plage configurée.</p>
          )}

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ajouter une plage</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Heure de début *</label>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={handleChange('startTime')}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Heure de fin *</label>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={handleChange('endTime')}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Rappel toutes les (min)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={form.reminderIntervalMinutes}
                  onChange={handleChange('reminderIntervalMinutes')}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Durée max (min)</label>
                <input
                  type="number"
                  min={1}
                  max={480}
                  value={form.maxDurationMinutes}
                  onChange={handleChange('maxDurationMinutes')}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Message popup</label>
              <textarea
                value={form.popupMessageText}
                onChange={handleChange('popupMessageText')}
                rows={2}
                placeholder="Message affiché lors de la pause (optionnel)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">ID asset audio (médiathèque)</label>
              <input
                type="text"
                value={form.popupAudioAssetId}
                onChange={handleChange('popupAudioAssetId')}
                placeholder="UUID de l'asset audio (optionnel)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
            )}

            <button
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Ajouter la plage
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
