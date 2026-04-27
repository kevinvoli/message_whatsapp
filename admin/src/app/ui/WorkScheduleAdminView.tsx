'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Clock, Coffee, Edit2, Loader2, Plus, Trash2, X } from 'lucide-react';
import {
  getAllSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  WorkSchedule,
  CreateSchedulePayload,
  DayOfWeek,
  BreakSlot,
} from '../lib/api/work-schedule.api';
import {
  getTodayForAll,
  TodayAttendanceSummary,
  AttendanceStatus,
} from '../lib/api/work-attendance.api';
import { getCommerciaux } from '../lib/api/commerciaux.api';
import { Commercial } from '../lib/definitions';

const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  not_clocked_in: 'Non pointé',
  working:        'En service',
  on_break:       'En pause',
  done:           'Parti',
};
const ATTENDANCE_STATUS_STYLE: Record<AttendanceStatus, string> = {
  not_clocked_in: 'bg-gray-100 text-gray-600',
  working:        'bg-green-100 text-green-700',
  on_break:       'bg-amber-100 text-amber-700',
  done:           'bg-blue-100 text-blue-700',
};

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
}

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday:    'Lundi',
  tuesday:   'Mardi',
  wednesday: 'Mercredi',
  thursday:  'Jeudi',
  friday:    'Vendredi',
  saturday:  'Samedi',
  sunday:    'Dimanche',
};

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// ─── Formulaire modal ────────────────────────────────────────────────────────

interface FormState {
  type:         'commercial' | 'group';
  commercialId: string;
  groupId:      string;
  groupName:    string;
  dayOfWeek:    DayOfWeek;
  startTime:    string;
  endTime:      string;
  breakSlots:   BreakSlot[];
  isActive:     boolean;
}

const defaultForm = (): FormState => ({
  type:         'commercial',
  commercialId: '',
  groupId:      '',
  groupName:    '',
  dayOfWeek:    'monday',
  startTime:    '08:00',
  endTime:      '17:00',
  breakSlots:   [],
  isActive:     true,
});

interface ScheduleFormModalProps {
  initial:      FormState | null;
  editId:       string | null;
  commerciaux:  Commercial[];
  onClose:      () => void;
  onSaved:      () => void;
}

function ScheduleFormModal({ initial, editId, commerciaux, onClose, onSaved }: ScheduleFormModalProps) {
  const [form, setForm]   = useState<FormState>(initial ?? defaultForm());
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const addBreak = () => set({ breakSlots: [...form.breakSlots, { start: '12:00', end: '13:00' }] });
  const removeBreak = (i: number) =>
    set({ breakSlots: form.breakSlots.filter((_, idx) => idx !== i) });
  const updateBreak = (i: number, field: 'start' | 'end', val: string) =>
    set({ breakSlots: form.breakSlots.map((b, idx) => idx === i ? { ...b, [field]: val } : b) });

  const handleSubmit = async () => {
    if (!form.dayOfWeek || !form.startTime || !form.endTime) {
      setError('Jour, heure début et fin sont requis.');
      return;
    }
    if (form.type === 'commercial' && !form.commercialId) {
      setError('Sélectionnez un commercial.');
      return;
    }
    if (form.type === 'group' && !form.groupId) {
      setError('Saisissez un identifiant de groupe (posteId).');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: CreateSchedulePayload = {
        commercialId: form.type === 'commercial' ? form.commercialId : null,
        groupId:      form.type === 'group' ? form.groupId : null,
        groupName:    form.type === 'group' ? (form.groupName || null) : null,
        dayOfWeek:    form.dayOfWeek,
        startTime:    form.startTime,
        endTime:      form.endTime,
        breakSlots:   form.breakSlots.length > 0 ? form.breakSlots : null,
        isActive:     form.isActive,
      };
      if (editId) {
        await updateSchedule(editId, payload);
      } else {
        await createSchedule(payload);
      }
      onSaved();
    } catch {
      setError('Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">
            {editId ? 'Modifier un créneau' : 'Nouveau créneau'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Type */}
          <div className="flex gap-3">
            {(['commercial', 'group'] as const).map((t) => (
              <button
                key={t}
                onClick={() => set({ type: t })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  form.type === t
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {t === 'commercial' ? 'Par commercial' : 'Par groupe (poste)'}
              </button>
            ))}
          </div>

          {/* Cible */}
          {form.type === 'commercial' ? (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Commercial</label>
              <select
                value={form.commercialId}
                onChange={(e) => set({ commercialId: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">-- Sélectionner --</option>
                {commerciaux.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.email}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">ID Groupe (posteId)</label>
                <input
                  value={form.groupId}
                  onChange={(e) => set({ groupId: e.target.value })}
                  placeholder="uuid du poste"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nom groupe</label>
                <input
                  value={form.groupName}
                  onChange={(e) => set({ groupName: e.target.value })}
                  placeholder="ex: Equipe A"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Jour + Horaires */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Jour</label>
              <select
                value={form.dayOfWeek}
                onChange={(e) => set({ dayOfWeek: e.target.value as DayOfWeek })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>{DAY_LABELS[d]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Début</label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => set({ startTime: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fin</label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => set({ endTime: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Pauses */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Pauses</label>
              <button
                onClick={addBreak}
                className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Ajouter
              </button>
            </div>
            {form.breakSlots.map((b, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <Coffee className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <input
                  type="time"
                  value={b.start}
                  onChange={(e) => updateBreak(i, 'start', e.target.value)}
                  className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-400 focus:outline-none"
                />
                <span className="text-xs text-gray-400">–</span>
                <input
                  type="time"
                  value={b.end}
                  onChange={(e) => updateBreak(i, 'end', e.target.value)}
                  className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-400 focus:outline-none"
                />
                <button onClick={() => removeBreak(i)} className="p-1 text-red-400 hover:text-red-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Actif */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set({ isActive: e.target.checked })}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            <span className="text-sm text-gray-700">Actif</span>
          </label>

          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editId ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Onglet pointages ────────────────────────────────────────────────────────

function AttendanceTab({ commercialMap }: { commercialMap: Map<string, string> }) {
  const [rows, setRows]       = useState<TodayAttendanceSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await getTodayForAll()); }
    catch { /* silencieux */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-green-600" />
          <h3 className="text-base font-semibold text-gray-900">Pointages d&apos;aujourd&apos;hui</h3>
        </div>
        <button onClick={() => void load()} disabled={loading} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <span className="text-xs text-gray-500">↻ Actualiser</span>}
        </button>
      </div>

      {rows.length === 0 && !loading ? (
        <p className="text-sm text-gray-400 text-center py-12">Aucun pointage enregistré aujourd&apos;hui.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Commercial</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Temps travaillé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.commercialId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {commercialMap.get(r.commercialId) ?? r.commercialId}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ATTENDANCE_STATUS_STYLE[r.status]}`}>
                      {ATTENDANCE_STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.minutesWorked > 0 ? formatMinutes(r.minutesWorked) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Vue principale ─────────────────────────────────────────────────────────

export default function WorkScheduleAdminView() {
  const [activeTab, setActiveTab]     = useState<'schedules' | 'attendance'>('schedules');
  const [schedules, setSchedules]     = useState<WorkSchedule[]>([]);
  const [commerciaux, setCommerciaux] = useState<Commercial[]>([]);
  const [loading, setLoading]         = useState(false);
  const [showModal, setShowModal]     = useState(false);
  const [editItem, setEditItem]       = useState<WorkSchedule | null>(null);
  const [deletingId, setDeletingId]   = useState<string | null>(null);

  const commercialMap = new Map(commerciaux.map((c) => [c.id, c.name]));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([getAllSchedules(), getCommerciaux()]);
      setSchedules(s);
      setCommerciaux(c);
    } catch { /* silencieux */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditItem(null); setShowModal(true); };
  const openEdit   = (s: WorkSchedule) => { setEditItem(s); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditItem(null); };
  const onSaved    = () => { closeModal(); void load(); };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteSchedule(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } catch { /* silencieux */ }
    finally { setDeletingId(null); }
  };

  const buildInitial = (s: WorkSchedule): FormState => ({
    type:         s.commercialId ? 'commercial' : 'group',
    commercialId: s.commercialId ?? '',
    groupId:      s.groupId ?? '',
    groupName:    s.groupName ?? '',
    dayOfWeek:    s.dayOfWeek,
    startTime:    s.startTime,
    endTime:      s.endTime,
    breakSlots:   s.breakSlots ?? [],
    isActive:     s.isActive,
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header + Onglets */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-6 h-6 text-indigo-600" />
          <h2 className="text-xl font-bold text-gray-900">Temps de travail</h2>
        </div>
        {activeTab === 'schedules' && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Nouveau créneau
          </button>
        )}
      </div>

      <div className="flex border-b border-gray-200">
        {([['schedules', 'Plannings'], ['attendance', 'Pointages du jour']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'attendance' && <AttendanceTab commercialMap={commercialMap} />}

      {/* Table plannings */}
      {activeTab === 'schedules' && (loading ? (
        <div className="flex items-center justify-center h-32 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Chargement…
        </div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucun planning configuré.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cible</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Jour</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Horaires</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pauses</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {schedules.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {s.commercialId ? (
                      <div>
                        <p className="font-medium text-gray-900">{commercialMap.get(s.commercialId) ?? s.commercialId}</p>
                        <p className="text-xs text-gray-400">Commercial individuel</p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium text-gray-900">{s.groupName ?? s.groupId}</p>
                        <p className="text-xs text-gray-400">Groupe / Poste</p>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-700">{DAY_LABELS[s.dayOfWeek]}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {s.startTime} – {s.endTime}
                  </td>
                  <td className="px-4 py-3">
                    {s.breakSlots && s.breakSlots.length > 0 ? (
                      <div className="space-y-0.5">
                        {s.breakSlots.map((b, i) => (
                          <div key={i} className="flex items-center gap-1 text-xs text-gray-500">
                            <Coffee className="w-3 h-3 text-amber-500" />
                            {b.start} – {b.end}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {s.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(s)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 rounded hover:bg-indigo-50"
                        title="Modifier"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => void handleDelete(s.id)}
                        disabled={deletingId === s.id}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                        title="Supprimer"
                      >
                        {deletingId === s.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {showModal && (
        <ScheduleFormModal
          initial={editItem ? buildInitial(editItem) : null}
          editId={editItem?.id ?? null}
          commerciaux={commerciaux}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
