'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Users, RefreshCw, Loader2, X, Plus, AlertTriangle, ChevronDown,
} from 'lucide-react';
import {
  getGroups,
  getPlanningByDate,
  createAbsence,
  createReplacement,
  deletePlanning,
  getCalendarHealth,
} from '@/app/lib/api/commercial-groups.api';
import { CommercialGroup, CommercialPresenceItem, CommercialPlanningEntry, CalendarHealthItem } from '@/app/lib/definitions';

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}

function getBadge(commercial: CommercialPresenceItem, planning: CommercialPlanningEntry | undefined) {
  if (!planning) {
    return commercial.isWorkingToday
      ? { label: 'En service', className: 'bg-green-100 text-green-700' }
      : { label: 'Repos', className: 'bg-gray-100 text-gray-600' };
  }
  if (planning.type === 'absence') {
    return planning.linkedCommercialId
      ? { label: 'Remplacé', className: 'bg-orange-100 text-orange-700' }
      : { label: 'Absent', className: 'bg-orange-100 text-orange-700' };
  }
  return planning.overridePosteId
    ? { label: 'Remplaçant', className: 'bg-purple-100 text-purple-700' }
    : { label: 'Exceptionnel', className: 'bg-blue-100 text-blue-700' };
}

function getEffectivePoste(commercial: CommercialPresenceItem, planning: CommercialPlanningEntry | undefined): string {
  if (planning?.type === 'exceptional' && planning.overridePoste) {
    return `${planning.overridePoste.name} (${planning.overridePoste.code})`;
  }
  return commercial.poste?.name ?? '—';
}

// ─── Formulaire absence inline ────────────────────────────────────────────────

function AbsenceForm({ commercial, date, onConfirm, onCancel }: {
  commercial: CommercialPresenceItem;
  date: string;
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try { await onConfirm(reason.trim()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Erreur.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
      <p className="text-xs font-medium text-amber-800">
        Déclarer {commercial.name} absent le {date}
      </p>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Raison (optionnelle)"
        className="w-full border border-amber-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => void handleSubmit()}
          disabled={saving}
          className="px-3 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1"
        >
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          Confirmer
        </button>
        <button onClick={onCancel} className="px-3 py-1 text-xs text-gray-600 border border-gray-200 rounded hover:bg-gray-50">
          Annuler
        </button>
      </div>
    </div>
  );
}

// ─── Modal remplacement ───────────────────────────────────────────────────────

function ReplacementModal({ allCommercials, date, onConfirm, onClose }: {
  allCommercials: CommercialPresenceItem[];
  date: string;
  onConfirm: (replacedId: string, replacerId: string, reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [replacedId, setReplacedId] = useState('');
  const [replacerId, setReplacerId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!replacedId || !replacerId) { setError('Veuillez sélectionner les deux commerciaux.'); return; }
    if (replacedId === replacerId) { setError('Le remplaçant ne peut pas être identique à l\'absent.'); return; }
    setSaving(true);
    setError(null);
    try { await onConfirm(replacedId, replacerId, reason.trim()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Erreur lors de la création.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">Créer un remplacement</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          {[
            { label: 'Commercial absent *', value: replacedId, onChange: setReplacedId, options: allCommercials },
            { label: 'Remplaçant désigné *', value: replacerId, onChange: setReplacerId, options: allCommercials.filter((c) => c.id !== replacedId) },
          ].map(({ label, value, onChange, options }) => (
            <div key={label}>
              <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
              <div className="relative">
                <select
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none appearance-none pr-8"
                >
                  <option value="">-- Sélectionner --</option>
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.poste ? ` (${c.poste.name})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          ))}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
            <input type="text" value={date} readOnly className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Raison (optionnelle)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex : congé, maladie..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Annuler
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={saving || !replacedId || !replacerId}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmer le remplacement
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Ligne tableau ────────────────────────────────────────────────────────────

function CommercialRow({ commercial, planning, groupName, date, onRefresh }: {
  commercial: CommercialPresenceItem;
  planning: CommercialPlanningEntry | undefined;
  groupName: string;
  date: string;
  onRefresh: () => void;
}) {
  const [showAbsenceForm, setShowAbsenceForm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const badge = getBadge(commercial, planning);
  const effectivePoste = getEffectivePoste(commercial, planning);

  const handleDeclareAbsence = async (reason: string) => {
    await createAbsence({ commercialId: commercial.id, date, reason: reason || undefined });
    setShowAbsenceForm(false);
    onRefresh();
  };

  const handleDelete = async () => {
    if (!planning) return;
    if (!confirm(`Supprimer l'entrée de planning pour ${commercial.name} ?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deletePlanning(planning.id);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression.');
    } finally {
      setDeleting(false);
    }
  };

  const renderAction = () => {
    if (!planning) {
      return (
        <button
          onClick={() => setShowAbsenceForm((v) => !v)}
          className="px-3 py-1.5 text-xs bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 font-medium"
        >
          Déclarer absent
        </button>
      );
    }
    if (planning.type === 'exceptional' && planning.overridePosteId) {
      return (
        <span className="text-xs text-purple-600 italic">
          Remplace {planning.linkedCommercial?.name ?? '—'}
        </span>
      );
    }
    return (
      <button
        onClick={() => void handleDelete()}
        disabled={deleting}
        className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
        title="Annuler cet override"
      >
        {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
      </button>
    );
  };

  return (
    <>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3 text-sm text-gray-600">{groupName || <span className="text-gray-400 italic">—</span>}</td>
        <td className="px-4 py-3 text-sm font-medium text-gray-900">{commercial.name}</td>
        <td className="px-4 py-3 text-sm text-gray-600">{effectivePoste}</td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
        </td>
        <td className="px-4 py-3 text-right">{renderAction()}</td>
      </tr>
      {showAbsenceForm && (
        <tr>
          <td colSpan={5} className="px-4 pb-3">
            <AbsenceForm
              commercial={commercial}
              date={date}
              onConfirm={handleDeclareAbsence}
              onCancel={() => setShowAbsenceForm(false)}
            />
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Vue principale ───────────────────────────────────────────────────────────

export default function CommercialPlanningView() {
  const todayStr = toDateString(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [groups, setGroups]             = useState<CommercialGroup[]>([]);
  const [planning, setPlanning]         = useState<CommercialPlanningEntry[]>([]);
  const [calendarAlerts, setCalendarAlerts] = useState<CalendarHealthItem[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [showReplacementModal, setShowReplacementModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [g, p, health] = await Promise.all([
        getGroups(),
        getPlanningByDate(selectedDate),
        getCalendarHealth(),
      ]);
      setGroups(g);
      setPlanning(p);
      setCalendarAlerts(health);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { void load(); }, [load]);

  const allCommercials: CommercialPresenceItem[] = [];
  const groupNameMap = new Map<string, string>();
  for (const g of groups) {
    groupNameMap.set(g.id, g.name);
    for (const c of g.commercials ?? []) {
      if (!allCommercials.find((x) => x.id === c.id)) allCommercials.push(c);
    }
  }

  const planningByCommercial = new Map<string, CommercialPlanningEntry>();
  for (const entry of planning) planningByCommercial.set(entry.commercialId, entry);

  const handleReplacement = async (replacedId: string, replacerId: string, reason: string) => {
    await createReplacement({ replacedId, replacerId, date: selectedDate, reason: reason || undefined });
    setShowReplacementModal(false);
    void load();
  };

  const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Absences &amp; remplacements</p>
            <p className="text-xs text-gray-500 capitalize">{dateLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            onClick={() => setShowReplacementModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Remplacement
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Actualiser
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {calendarAlerts.length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-900">
              {calendarAlerts.length} groupe{calendarAlerts.length > 1 ? 's' : ''} sans calendrier valide dans 7 jours
            </p>
            <ul className="mt-1 space-y-0.5">
              {calendarAlerts.map((g) => (
                <li key={g.groupId} className="text-xs">
                  <span className="font-medium">{g.groupName}</span>
                  {g.lastDay
                    ? ` — dernier jour planifié : ${g.lastDay}`
                    : ' — aucun calendrier généré'}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-amber-700">
              Régénérez le calendrier depuis l'onglet Groupes → Calendrier.
            </p>
          </div>
        </div>
      )}

      {loading && allCommercials.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Chargement…
        </div>
      ) : allCommercials.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucun commercial trouvé. Vérifiez que des groupes sont configurés.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-medium text-gray-400 bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3">Groupe</th>
                <th className="text-left px-4 py-3">Commercial</th>
                <th className="text-left px-4 py-3">Poste effectif</th>
                <th className="text-left px-4 py-3">Statut</th>
                <th className="text-right px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allCommercials.map((commercial) => (
                <CommercialRow
                  key={commercial.id}
                  commercial={commercial}
                  planning={planningByCommercial.get(commercial.id)}
                  groupName={commercial.groupId ? (groupNameMap.get(commercial.groupId) ?? '') : ''}
                  date={selectedDate}
                  onRefresh={() => void load()}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showReplacementModal && (
        <ReplacementModal
          allCommercials={allCommercials}
          date={selectedDate}
          onConfirm={handleReplacement}
          onClose={() => setShowReplacementModal(false)}
        />
      )}
    </div>
  );
}
