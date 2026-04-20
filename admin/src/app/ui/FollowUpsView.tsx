'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Bell, CheckCircle, Loader2, RefreshCw, User, X, XCircle } from 'lucide-react';
import {
  FollowUp,
  FollowUpStatus,
  FOLLOW_UP_STATUS_COLORS,
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_TYPE_LABELS,
  FollowUpType,
} from '@/app/lib/definitions';
import {
  cancelFollowUpAdmin,
  completeFollowUpAdmin,
  getFollowUpsAdmin,
} from '@/app/lib/api/followup.api';
import { getCommerciaux } from '@/app/lib/api/commerciaux.api';
import { Commercial } from '@/app/lib/definitions';
import { formatDate, formatDateShort } from '@/app/lib/dateUtils';

// ─── Complete modal ────────────────────────────────────────────────────────────

interface CompleteModalProps {
  followUp: FollowUp;
  onDone: () => void;
  onClose: () => void;
}

function CompleteModal({ followUp, onDone, onClose }: CompleteModalProps) {
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState(followUp.notes ?? '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await completeFollowUpAdmin(followUp.id, { result: result || undefined, notes: notes || undefined });
      onDone();
    } catch {
      // silent — reload will show state
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Marquer comme effectuée</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Résultat</label>
          <input
            value={result}
            onChange={(e) => setResult(e.target.value)}
            placeholder="ex: Client rappelé, commande passée..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────────

interface CardProps {
  followUp: FollowUp;
  onComplete: (f: FollowUp) => void;
  onCancel: (id: string) => void;
}

function FollowUpCard({ followUp, onComplete, onCancel }: CardProps) {
  const isLate = followUp.status === 'en_retard';
  const isDone = followUp.status === 'effectuee' || followUp.status === 'annulee';

  return (
    <div
      className={`rounded-xl border p-4 space-y-2 ${
        isLate ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">
            {followUp.contact_name ?? '—'}
            {followUp.contact_phone && (
              <span className="ml-1 text-gray-400 font-normal">{followUp.contact_phone}</span>
            )}
          </p>
          {followUp.commercial_name && (
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
              <User className="w-3 h-3" />
              {followUp.commercial_name}
            </p>
          )}
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
            FOLLOW_UP_STATUS_COLORS[followUp.status]
          }`}
        >
          {FOLLOW_UP_STATUS_LABELS[followUp.status]}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="px-2 py-0.5 bg-gray-100 rounded-full">
          {FOLLOW_UP_TYPE_LABELS[followUp.type as FollowUpType] ?? followUp.type}
        </span>
        <span>Prévu le {formatDateShort(new Date(followUp.scheduled_at))}</span>
      </div>

      {followUp.notes && (
        <p className="text-xs text-gray-500 italic">{followUp.notes}</p>
      )}

      {!isDone && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onComplete(followUp)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Effectuée
          </button>
          <button
            onClick={() => onCancel(followUp.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 text-xs font-medium hover:bg-gray-200 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main view ─────────────────────────────────────────────────────────────────

const STATUS_FILTERS: Array<{ value: FollowUpStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Toutes' },
  { value: 'en_retard', label: 'En retard' },
  { value: 'planifiee', label: 'Planifiées' },
  { value: 'effectuee', label: 'Effectuées' },
  { value: 'annulee', label: 'Annulées' },
];

export default function FollowUpsView() {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FollowUpStatus | 'all'>('all');
  const [filterCommercialId, setFilterCommercialId] = useState('');
  const [commerciaux, setCommerciaux] = useState<Commercial[]>([]);
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getFollowUpsAdmin({
        status: filterStatus === 'all' ? undefined : filterStatus,
        commercial_id: filterCommercialId || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setFollowUps(result.data);
      setTotal(result.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterCommercialId, page]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    getCommerciaux().then(setCommerciaux).catch(() => {});
  }, []);

  const handleCancel = async (id: string) => {
    await cancelFollowUpAdmin(id).catch(() => {});
    void load();
  };

  const handleCompleted = () => {
    setCompleting(null);
    void load();
  };

  const overdueCount = followUps.filter((f) => f.status === 'en_retard').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-orange-500" />
            Relances
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} relance{total !== 1 ? 's' : ''} au total
            {overdueCount > 0 && (
              <span className="ml-2 text-red-600 font-medium">
                · {overdueCount} en retard
              </span>
            )}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Actualiser
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Status pills */}
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setFilterStatus(f.value); setPage(0); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterStatus === f.value
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Commercial filter */}
        <select
          value={filterCommercialId}
          onChange={(e) => { setFilterCommercialId(e.target.value); setPage(0); }}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
        >
          <option value="">Tous les commerciaux</option>
          {commerciaux.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Late warning banner */}
      {filterStatus === 'all' && overdueCount > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">
            {overdueCount} relance{overdueCount !== 1 ? 's sont' : ' est'} en retard et nécessite{overdueCount !== 1 ? 'nt' : ''} une action immédiate.
          </p>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
        </div>
      ) : followUps.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>Aucune relance trouvée</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {followUps.map((f) => (
            <FollowUpCard
              key={f.id}
              followUp={f}
              onComplete={setCompleting}
              onCancel={handleCancel}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 disabled:opacity-40 hover:bg-gray-50"
          >
            Précédent
          </button>
          <span className="text-sm text-gray-500">
            Page {page + 1} / {Math.ceil(total / PAGE_SIZE)}
          </span>
          <button
            disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 disabled:opacity-40 hover:bg-gray-50"
          >
            Suivant
          </button>
        </div>
      )}

      {/* Complete modal */}
      {completing && (
        <CompleteModal
          followUp={completing}
          onDone={handleCompleted}
          onClose={() => setCompleting(null)}
        />
      )}
    </div>
  );
}
