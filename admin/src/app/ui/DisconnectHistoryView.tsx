'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { DisconnectHistoryResponse } from '@/app/lib/definitions';
import {
  getDisconnectHistory,
  getDisconnectHistoryByCommercial,
  patchDisconnectReason,
} from '@/app/lib/api/commercial-groups.api';
import { formatDate } from '@/app/lib/dateUtils';
import { ChevronDown, ChevronRight, Loader2, Search } from 'lucide-react';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function toYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface ReasonEditorProps {
  logId: string;
  initialReason: string | null;
  onSaved: (logId: string, reason: string) => void;
  onCancel: () => void;
}

function ReasonEditor({ logId, initialReason, onSaved, onCancel }: ReasonEditorProps) {
  const [value, setValue] = useState(initialReason ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await patchDisconnectReason(logId, value.trim());
      onSaved(logId, value.trim());
    } catch { /* silencieux */ }
    finally { setSaving(false); }
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-indigo-50 rounded-lg border border-indigo-200">
      <input
        type="text"
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
        placeholder="Saisir une raison..."
        className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') void handleSave();
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus
      />
      <button
        onClick={() => void handleSave()}
        disabled={saving || !value.trim()}
        className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Sauvegarder'}
      </button>
      <button
        onClick={onCancel}
        className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
      >
        Annuler
      </button>
    </div>
  );
}

interface CommercialHistoryRowsProps {
  commercialId: string;
}

function CommercialHistoryRows({ commercialId }: CommercialHistoryRowsProps) {
  const [data, setData] = useState<DisconnectHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDisconnectHistoryByCommercial(commercialId, { limit: 20 })
      .then((result) => { if (!cancelled) setData(result); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [commercialId]);

  if (loading) {
    return (
      <tr>
        <td colSpan={7} className="px-4 py-3 bg-indigo-50">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
        </td>
      </tr>
    );
  }

  if (!data || data.entries.length === 0) {
    return (
      <tr>
        <td colSpan={7} className="px-4 py-3 bg-indigo-50 text-sm text-gray-400 italic">
          Aucun historique disponible.
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={7} className="px-4 py-2 bg-indigo-50 border-t border-indigo-100">
        <div className="text-xs font-medium text-indigo-700 uppercase tracking-wide mb-1">
          Historique — {data.entries[0].commercialName}
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left pr-4 pb-1 font-medium">Connexion</th>
              <th className="text-left pr-4 pb-1 font-medium">Déconnexion</th>
              <th className="text-left pr-4 pb-1 font-medium">Durée</th>
              <th className="text-left pb-1 font-medium">Raison</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => (
              <tr key={e.logId} className="border-t border-indigo-100">
                <td className="pr-4 py-1 text-gray-700">{formatDate(e.loginAt)}</td>
                <td className="pr-4 py-1 text-gray-700">
                  {e.logoutAt ? formatDate(e.logoutAt) : '—'}
                </td>
                <td className="pr-4 py-1 text-gray-700">{formatDuration(e.durationMinutes)}</td>
                <td className="py-1 text-gray-600">{e.disconnectReason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export default function DisconnectHistoryView() {
  const defaultTo = toYMD(new Date());
  const defaultFrom = toYMD(new Date(Date.now() - 7 * 86400000));

  const [fromDateInput, setFromDateInput] = useState(defaultFrom);
  const [toDateInput, setToDateInput] = useState(defaultTo);
  const [appliedFrom, setAppliedFrom] = useState(defaultFrom);
  const [appliedTo, setAppliedTo] = useState(defaultTo);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DisconnectHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [reasonEditLogId, setReasonEditLogId] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [localReasons, setLocalReasons] = useState<Map<string, string>>(new Map());

  const load = useCallback(async (p: number, from: string, to: string) => {
    setLoading(true);
    try {
      const result = await getDisconnectHistory({ from, to, page: p, limit: 50 });
      setData(result);
    } catch { /* silencieux */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load(page, appliedFrom, appliedTo);
  }, [load, page, appliedFrom, appliedTo]);

  const handleSearch = () => {
    setAppliedFrom(fromDateInput);
    setAppliedTo(toDateInput);
    setPage(1);
  };

  const handleReasonSaved = (logId: string, reason: string) => {
    setLocalReasons((prev) => {
      const next = new Map(prev);
      next.set(logId, reason);
      return next;
    });
    setReasonEditLogId(null);
  };

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const currentPage = data?.page ?? 1;
  const totalPages = Math.ceil(total / 50) || 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">Du</label>
          <input
            type="date"
            value={fromDateInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFromDateInput(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 whitespace-nowrap">Au</label>
          <input
            type="date"
            value={toDateInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToDateInput(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          aria-label="Rechercher les déconnexions"
        >
          {loading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Search className="w-3.5 h-3.5" />
          }
          Rechercher
        </button>
      </div>

      {loading && entries.length === 0 && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          Aucune déconnexion trouvée sur cette période.
        </div>
      )}

      {entries.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Commercial</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Connexion</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Déconnexion</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Durée</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Alerte le</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Raison</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {entries.map((row) => {
                const effectiveReason = localReasons.get(row.logId) ?? row.disconnectReason;
                const isReasonEditing = reasonEditLogId === row.logId;
                const isExpanded = expandedLogId === row.logId;

                return (
                  <React.Fragment key={row.logId}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <button
                          onClick={() => setExpandedLogId(isExpanded ? null : row.logId)}
                          className="flex items-center gap-1 text-left hover:text-indigo-600"
                          aria-label={`Voir l'historique de ${row.commercialName}`}
                        >
                          {isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                            : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
                          }
                          {row.commercialName}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(row.loginAt)}</td>
                      <td className="px-4 py-3">
                        {row.logoutAt
                          ? <span className="text-gray-600">{formatDate(row.logoutAt)}</span>
                          : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              Session toujours ouverte
                            </span>
                          )
                        }
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDuration(row.durationMinutes)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(row.alertedAt)}</td>
                      <td className="px-4 py-3">
                        {effectiveReason
                          ? <span className="text-gray-700 text-sm">{effectiveReason}</span>
                          : (
                            <button
                              onClick={() => setReasonEditLogId(row.logId)}
                              className="text-indigo-600 hover:underline text-xs"
                              aria-label={`Ajouter une raison pour ${row.commercialName}`}
                            >
                              Ajouter une raison
                            </button>
                          )
                        }
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setReasonEditLogId(isReasonEditing ? null : row.logId)}
                          className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 text-gray-600"
                          aria-label={`Modifier la raison pour ${row.commercialName}`}
                        >
                          {effectiveReason ? 'Modifier' : 'Éditer'}
                        </button>
                      </td>
                    </tr>
                    {isReasonEditing && (
                      <tr>
                        <td colSpan={7} className="px-4 py-2 bg-indigo-50">
                          <ReasonEditor
                            logId={row.logId}
                            initialReason={effectiveReason}
                            onSaved={handleReasonSaved}
                            onCancel={() => setReasonEditLogId(null)}
                          />
                        </td>
                      </tr>
                    )}
                    {isExpanded && <CommercialHistoryRows commercialId={row.commercialId} />}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Page {currentPage} · {total} résultat{total > 1 ? 's' : ''}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1 || loading}
              className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              aria-label="Page précédente"
            >
              Précédent
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={currentPage >= totalPages || loading}
              className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              aria-label="Page suivante"
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
