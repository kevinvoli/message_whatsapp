'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Bell, CheckCircle, XCircle, Clock, RefreshCw, ChevronDown, Plus, Calendar, User, ExternalLink } from 'lucide-react';
import { FollowUp, FollowUpStatus, FOLLOW_UP_TYPE_LABELS } from '@/types/chat';
import { getMyFollowUps, getDueToday, completeFollowUp, cancelFollowUp, rescheduleFollowUp } from '@/lib/followUpApi';
import { formatDate } from '@/lib/dateUtils';
import CreateFollowUpModal from './CreateFollowUpModal';

const RESULT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '— Choisir un résultat —' },
  { value: 'commande_passee', label: 'Commande passée' },
  { value: 'rappel_planifie', label: 'Client à rappeler' },
  { value: 'pas_interesse', label: 'Pas intéressé' },
  { value: 'injoignable', label: 'Injoignable' },
  { value: 'sans_suite', label: 'Sans suite' },
];

function formatOverdueDuration(scheduledAt: string): string {
  const diffMs = Date.now() - new Date(scheduledAt).getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays >= 1) return `${diffDays}j de retard`;
  if (diffH >= 1) return `${diffH}h de retard`;
  return 'Quelques minutes de retard';
}

const STATUS_LABELS: Record<FollowUpStatus, string> = {
  planifiee: 'Planifiée',
  en_retard: 'En retard',
  effectuee: 'Effectuée',
  annulee:   'Annulée',
};

const STATUS_COLORS: Record<FollowUpStatus, string> = {
  planifiee: 'bg-blue-100 text-blue-700',
  en_retard: 'bg-red-100 text-red-700',
  effectuee: 'bg-green-100 text-green-700',
  annulee:   'bg-gray-100 text-gray-500',
};

interface CompleteModalProps {
  followUp: FollowUp;
  onClose: () => void;
  onDone: () => void;
}

function CompleteModal({ followUp, onClose, onDone }: CompleteModalProps) {
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!result) {
      setError('Veuillez choisir un résultat.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await completeFollowUp(followUp.id, { result, notes: notes || undefined });
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Marquer comme effectuée</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Résultat <span className="text-red-500">*</span>
            </label>
            <select
              value={result}
              onChange={(e) => {
                setResult(e.target.value);
                if (e.target.value) setError(null);
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              required
            >
              {RESULT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle className="w-4 h-4" />
            {saving ? 'Enregistrement…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface CancelModalProps {
  followUp: FollowUp;
  onClose: () => void;
  onDone: () => void;
}

function CancelModal({ followUp, onClose, onDone }: CancelModalProps) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await cancelFollowUp(followUp.id, reason || undefined);
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Annuler la relance</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4">
          <label className="block text-xs font-medium text-gray-700 mb-1">Motif (optionnel)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: Client non disponible, doublon…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Retour
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            {saving ? 'Annulation…' : 'Confirmer l\'annulation'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface RescheduleModalProps {
  followUp: FollowUp;
  onClose: () => void;
  onDone: () => void;
}

function RescheduleModal({ followUp, onClose, onDone }: RescheduleModalProps) {
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!date) { setError('Veuillez choisir une date.'); return; }
    setSaving(true);
    setError(null);
    try {
      await rescheduleFollowUp(followUp.id, new Date(date).toISOString());
      onDone();
      onClose();
    } catch {
      setError('Erreur lors de la reprogrammation.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">Reprogrammer la relance</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4">
          <label className="block text-xs font-medium text-gray-700 mb-1">Nouvelle date et heure</label>
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Clock className="w-4 h-4" />
            {saving ? 'Enregistrement…' : 'Reprogrammer'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface FollowUpPanelProps {
  onOpenConversation?: (conversationId: string) => void;
}

export default function FollowUpPanel({ onOpenConversation }: FollowUpPanelProps = {}) {
  const [dueToday, setDueToday] = useState<FollowUp[]>([]);
  const [all, setAll] = useState<FollowUp[]>([]);
  const [filterStatus, setFilterStatus] = useState<FollowUpStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [cancelling, setCancelling] = useState<FollowUp | null>(null);
  const [rescheduling, setRescheduling] = useState<FollowUp | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [todayRes, allRes] = await Promise.all([
        getDueToday(),
        getMyFollowUps(filterStatus === 'all' ? undefined : filterStatus),
      ]);
      setDueToday(todayRes);
      setAll(allRes.data);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = () => { void load(); };
    window.addEventListener('followup:reminder', handler);
    return () => window.removeEventListener('followup:reminder', handler);
  }, [load]);

  const filtered = showAll ? all : all.slice(0, 20);

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-green-600" />
          <h2 className="text-base font-semibold text-gray-900">Mes relances</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700"
            title="Nouvelle relance"
          >
            <Plus className="w-3.5 h-3.5" />
            Nouvelle
          </button>
          <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100" title="Rafraîchir">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Section dues aujourd'hui */}
        {dueToday.length > 0 && (
          <div className="px-4 pt-4">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              À traiter aujourd'hui ({dueToday.length})
            </p>
            <div className="space-y-2">
              {dueToday.map((fu) => (
                <FollowUpCard
                  key={fu.id}
                  followUp={fu}
                  onComplete={() => setCompleting(fu)}
                  onCancel={() => setCancelling(fu)}
                  onReschedule={() => setRescheduling(fu)}
                  onOpenConversation={onOpenConversation}
                  highlight
                />
              ))}
            </div>
          </div>
        )}

        {/* Filtre statut */}
        <div className="px-4 pt-4 pb-2 flex gap-1.5 flex-wrap">
          {(['all', 'planifiee', 'en_retard', 'effectuee', 'annulee'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filterStatus === s
                  ? 'bg-green-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? 'Toutes' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Liste complète */}
        <div className="px-4 pb-4 space-y-2">
          {loading && all.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">Chargement…</div>
          ) : all.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">Aucune relance</div>
          ) : (
            <>
              {filtered.map((fu) => (
                <FollowUpCard
                  key={fu.id}
                  followUp={fu}
                  onComplete={() => setCompleting(fu)}
                  onCancel={() => setCancelling(fu)}
                  onReschedule={() => setRescheduling(fu)}
                  onOpenConversation={onOpenConversation}
                />
              ))}
              {all.length > 20 && !showAll && (
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full flex items-center justify-center gap-1 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  <ChevronDown className="w-4 h-4" />
                  Voir les {all.length - 20} suivantes
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {completing && (
        <CompleteModal
          followUp={completing}
          onClose={() => setCompleting(null)}
          onDone={load}
        />
      )}

      {cancelling && (
        <CancelModal
          followUp={cancelling}
          onClose={() => setCancelling(null)}
          onDone={load}
        />
      )}

      {rescheduling && (
        <RescheduleModal
          followUp={rescheduling}
          onClose={() => setRescheduling(null)}
          onDone={load}
        />
      )}

      {showCreate && (
        <CreateFollowUpModal
          onClose={() => setShowCreate(false)}
          onDone={load}
        />
      )}
    </div>
  );
}

interface CardProps {
  followUp: FollowUp;
  onComplete: () => void;
  onCancel: () => void;
  onReschedule: () => void;
  onOpenConversation?: (conversationId: string) => void;
  highlight?: boolean;
}

function FollowUpCard({ followUp: fu, onComplete, onCancel, onReschedule, onOpenConversation, highlight }: CardProps) {
  const isDone = fu.status === 'effectuee' || fu.status === 'annulee';
  return (
    <div className={`bg-white rounded-lg border p-3 ${highlight ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[fu.status]}`}>
              {STATUS_LABELS[fu.status]}
            </span>
            <span className="text-xs text-gray-500">{FOLLOW_UP_TYPE_LABELS[fu.type]}</span>
          </div>
          {fu.contact_name ? (
            <div className="flex items-center gap-1 mt-1">
              <User className="w-3 h-3 text-gray-400 flex-shrink-0" />
              <span className="text-xs font-medium text-gray-800 truncate">{fu.contact_name}</span>
              {fu.contact_phone && (
                <span className="text-xs text-gray-400 truncate">· {fu.contact_phone}</span>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic mt-0.5">Contact non lié</p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            <Clock className="w-3 h-3 inline mr-1" />
            {formatDate(fu.scheduled_at)}
          </p>
          {fu.status === 'en_retard' && (
            <p className="text-xs font-semibold text-red-600 mt-0.5">
              ⚠ {formatOverdueDuration(fu.scheduled_at)}
            </p>
          )}
          {fu.notes && (
            <p className="text-xs text-gray-600 mt-1 truncate">{fu.notes}</p>
          )}
          {fu.conversation_id && onOpenConversation && (
            <button
              onClick={() => onOpenConversation(fu.conversation_id!)}
              title="Voir la conversation"
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-1.5"
            >
              <ExternalLink className="w-3 h-3" />
              Voir la conversation
            </button>
          )}
        </div>
        {!isDone && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onComplete}
              title="Marquer comme effectuée"
              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
            <button
              onClick={onReschedule}
              title="Reprogrammer"
              className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Calendar className="w-4 h-4" />
            </button>
            <button
              onClick={onCancel}
              title="Annuler"
              className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
