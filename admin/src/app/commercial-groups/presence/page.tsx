'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  RefreshCw,
  Loader2,
  X,
  Plus,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import {
  getGroups,
  getPlanningByDate,
  createAbsence,
  createReplacement,
  deletePlanning,
} from '@/app/lib/api/commercial-groups.api';
import { checkAdminAuth } from '@/app/lib/api/auth.api';
import { CommercialGroup, CommercialPresenceItem, CommercialPlanningEntry } from '@/app/lib/definitions';

// ─── Utilitaire date locale ──────────────────────────────────────────────────

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}

// ─── Logique badge ───────────────────────────────────────────────────────────

interface BadgeInfo {
  label: string;
  className: string;
}

function getBadge(
  commercial: CommercialPresenceItem,
  planning: CommercialPlanningEntry | undefined,
): BadgeInfo {
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
  // exceptional
  return planning.overridePosteId
    ? { label: 'Remplaçant', className: 'bg-purple-100 text-purple-700' }
    : { label: 'Exceptionnel', className: 'bg-blue-100 text-blue-700' };
}

function getEffectivePoste(
  commercial: CommercialPresenceItem,
  planning: CommercialPlanningEntry | undefined,
): string {
  if (planning?.type === 'exceptional' && planning.overridePoste) {
    return `${planning.overridePoste.name} (${planning.overridePoste.code})`;
  }
  if (commercial.poste) {
    return commercial.poste.name;
  }
  return '—';
}

// ─── Modal déclaration d'absence ─────────────────────────────────────────────

interface AbsenceFormProps {
  commercial: CommercialPresenceItem;
  date: string;
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}

function AbsenceForm({ commercial, date, onConfirm, onCancel }: AbsenceFormProps) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la déclaration.');
    } finally {
      setSaving(false);
    }
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
          aria-label="Confirmer l'absence"
        >
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          Confirmer
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs text-gray-600 border border-gray-200 rounded hover:bg-gray-50"
          aria-label="Annuler"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

// ─── Modal remplacement ───────────────────────────────────────────────────────

interface ReplacementModalProps {
  allCommercials: CommercialPresenceItem[];
  date: string;
  onConfirm: (replacedId: string, replacerId: string, reason: string) => Promise<void>;
  onClose: () => void;
}

function ReplacementModal({ allCommercials, date, onConfirm, onClose }: ReplacementModalProps) {
  const [replacedId, setReplacedId] = useState('');
  const [replacerId, setReplacerId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!replacedId || !replacerId) {
      setError('Veuillez sélectionner les deux commerciaux.');
      return;
    }
    if (replacedId === replacerId) {
      setError('Le remplaçant ne peut pas être le même que l\'absent.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(replacedId, replacerId, reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création du remplacement.');
    } finally {
      setSaving(false);
    }
  };

  const replacerOptions = allCommercials.filter((c) => c.id !== replacedId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">Créer un remplacement</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100"
            aria-label="Fermer le modal"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Commercial absent *
            </label>
            <div className="relative">
              <select
                value={replacedId}
                onChange={(e) => setReplacedId(e.target.value)}
                aria-label="Commercial absent"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none appearance-none pr-8"
              >
                <option value="">-- Sélectionner --</option>
                {allCommercials.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.poste ? ` (${c.poste.name})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Remplaçant désigné *
            </label>
            <div className="relative">
              <select
                value={replacerId}
                onChange={(e) => setReplacerId(e.target.value)}
                aria-label="Remplaçant désigné"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none appearance-none pr-8"
              >
                <option value="">-- Sélectionner --</option>
                {replacerOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.poste ? ` (${c.poste.name})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
            <input
              type="text"
              value={date}
              readOnly
              className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Raison (optionnelle)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex : congé, maladie..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
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

// ─── Ligne du tableau ─────────────────────────────────────────────────────────

interface CommercialRowProps {
  commercial: CommercialPresenceItem;
  planning: CommercialPlanningEntry | undefined;
  groupName: string;
  date: string;
  onAbsenceDeclared: () => void;
  onDeleted: () => void;
}

function CommercialRow({
  commercial,
  planning,
  groupName,
  date,
  onAbsenceDeclared,
  onDeleted,
}: CommercialRowProps) {
  const [showAbsenceForm, setShowAbsenceForm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const badge = getBadge(commercial, planning);
  const effectivePoste = getEffectivePoste(commercial, planning);

  const handleDeclareAbsence = async (reason: string) => {
    await createAbsence({ commercialId: commercial.id, date, reason: reason || undefined });
    setShowAbsenceForm(false);
    onAbsenceDeclared();
  };

  const handleDelete = async () => {
    if (!planning) return;
    if (!confirm(`Supprimer l'entrée de planning pour ${commercial.name} ?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deletePlanning(planning.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression.');
    } finally {
      setDeleting(false);
    }
  };

  const renderAction = () => {
    if (!planning) {
      // En service ou Repos
      return (
        <button
          onClick={() => setShowAbsenceForm((v) => !v)}
          className="px-3 py-1.5 text-xs bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 font-medium"
          aria-label={`Déclarer ${commercial.name} absent`}
        >
          Déclarer absent
        </button>
      );
    }

    if (planning.type === 'absence') {
      // Absent ou Remplacé
      return (
        <button
          onClick={() => void handleDelete()}
          disabled={deleting}
          className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
          aria-label="Supprimer cette entrée de planning"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
        </button>
      );
    }

    if (planning.type === 'exceptional') {
      if (planning.overridePosteId) {
        // Remplaçant — afficher le nom du commercial remplacé
        return (
          <span className="text-xs text-purple-600 italic">
            Remplace {planning.linkedCommercial?.name ?? '—'}
          </span>
        );
      }
      // Exceptionnel
      return (
        <button
          onClick={() => void handleDelete()}
          disabled={deleting}
          className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
          aria-label="Supprimer cette entrée de planning"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
        </button>
      );
    }

    return null;
  };

  return (
    <>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3 text-sm text-gray-600">
          {groupName || <span className="text-gray-400 italic">Sans groupe</span>}
        </td>
        <td className="px-4 py-3 text-sm font-medium text-gray-900">{commercial.name}</td>
        <td className="px-4 py-3 text-sm text-gray-600">{effectivePoste}</td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          {renderAction()}
        </td>
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

// ─── Page principale ──────────────────────────────────────────────────────────

export default function PlanningPresencePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  const todayStr = toDateString(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const [groups, setGroups]     = useState<CommercialGroup[]>([]);
  const [planning, setPlanning] = useState<CommercialPlanningEntry[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const [showReplacementModal, setShowReplacementModal] = useState(false);

  // Vérification auth admin
  useEffect(() => {
    checkAdminAuth().then((ok) => {
      if (!ok) {
        router.replace('/login');
      } else {
        setAuthChecked(true);
      }
    }).catch(() => router.replace('/login'));
  }, [router]);

  // Chargement données
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [g, p] = await Promise.all([
        getGroups(),
        getPlanningByDate(selectedDate),
      ]);
      setGroups(g);
      setPlanning(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (authChecked) void load();
  }, [authChecked, load]);

  // Construction de la liste de tous les commerciaux depuis les groupes
  const allCommercials: CommercialPresenceItem[] = [];
  const groupNameMap = new Map<string, string>();

  for (const g of groups) {
    groupNameMap.set(g.id, g.name);
    for (const c of g.commercials ?? []) {
      if (!allCommercials.find((x) => x.id === c.id)) {
        allCommercials.push(c);
      }
    }
  }

  // Index planning par commercialId
  const planningByCommercial = new Map<string, CommercialPlanningEntry>();
  for (const entry of planning) {
    planningByCommercial.set(entry.commercialId, entry);
  }

  const handleReplacement = async (replacedId: string, replacerId: string, reason: string) => {
    await createReplacement({
      replacedId,
      replacerId,
      date: selectedDate,
      reason: reason || undefined,
    });
    setShowReplacementModal(false);
    void load();
  };

  const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* En-tête */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-indigo-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Vue présence du jour</h1>
              <p className="text-sm text-gray-500 capitalize">{dateLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              aria-label="Sélectionner une date"
            />
            <button
              onClick={() => setShowReplacementModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
              aria-label="Créer un remplacement"
            >
              <Plus className="w-4 h-4" />
              Créer un remplacement
            </button>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              aria-label="Actualiser"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Actualiser
            </button>
          </div>
        </div>

        {/* Erreur globale */}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Tableau */}
        {loading && allCommercials.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Chargement…
          </div>
        ) : allCommercials.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200 text-gray-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Aucun commercial trouvé. Vérifiez que des groupes sont configurés.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-medium text-gray-400 bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium">Groupe</th>
                  <th className="text-left px-4 py-3 font-medium">Commercial</th>
                  <th className="text-left px-4 py-3 font-medium">Poste effectif</th>
                  <th className="text-left px-4 py-3 font-medium">Statut</th>
                  <th className="text-right px-4 py-3 font-medium">Action</th>
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
                    onAbsenceDeclared={() => void load()}
                    onDeleted={() => void load()}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal remplacement */}
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
