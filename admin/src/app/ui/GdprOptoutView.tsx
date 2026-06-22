'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Shield, Trash2, RotateCcw } from 'lucide-react';
import { GdprOptout } from '@/app/lib/definitions';
import { getGdprOptouts, anonymizeGdprOptout, revokeGdprOptout } from '@/app/lib/api/gdpr.api';
import { useToast } from '@/app/ui/ToastProvider';
import { formatDate } from '@/app/lib/dateUtils';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:  { label: 'Opt-out actif', cls: 'bg-red-100 text-red-700'    },
  revoked: { label: 'Révoqué',       cls: 'bg-gray-100 text-gray-600'  },
};

export default function GdprOptoutView() {
  const [optouts, setOptouts] = useState<GdprOptout[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getGdprOptouts();
      setOptouts(data);
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erreur lors du chargement des opt-outs.',
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const handleAnonymize = async (phone: string) => {
    if (!confirm(`Anonymiser définitivement le contact ${phone} ? Cette action est irréversible.`)) return;
    setActionLoading(`anonymize-${phone}`);
    try {
      await anonymizeGdprOptout(phone);
      addToast({ type: 'success', message: `Contact ${phone} anonymisé.` });
      await load();
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : "Erreur lors de l'anonymisation.",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevoke = async (phone: string) => {
    if (!confirm(`Révoquer l'opt-out de ${phone} ? Le contact pourra à nouveau recevoir des messages.`)) return;
    setActionLoading(`revoke-${phone}`);
    try {
      await revokeGdprOptout(phone);
      addToast({ type: 'success', message: `Opt-out de ${phone} révoqué.` });
      await load();
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erreur lors de la révocation.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">GDPR — Opt-out contacts</h1>
              <p className="text-sm text-gray-500">{optouts.length} entrée(s) enregistrée(s)</p>
            </div>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            aria-label="Actualiser la liste"
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {loading && optouts.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            Chargement…
          </div>
        ) : optouts.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            Aucun opt-out enregistré.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Téléphone</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date opt-out</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date révocation</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {optouts.map((entry) => {
                  const badge = STATUS_BADGE[entry.status] ?? STATUS_BADGE.active;
                  const isAnonymizing = actionLoading === `anonymize-${entry.phone}`;
                  const isRevoking   = actionLoading === `revoke-${entry.phone}`;
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-gray-900">{entry.phone}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(entry.optOutAt)}</td>
                      <td className="px-4 py-3 text-gray-500">{entry.revokedAt ? formatDate(entry.revokedAt) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {entry.status === 'active' && (
                            <button
                              onClick={() => void handleRevoke(entry.phone)}
                              disabled={actionLoading !== null}
                              aria-label={`Révoquer l'opt-out de ${entry.phone}`}
                              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <RotateCcw className={`w-3 h-3 ${isRevoking ? 'animate-spin' : ''}`} />
                              Révoquer
                            </button>
                          )}
                          <button
                            onClick={() => void handleAnonymize(entry.phone)}
                            disabled={actionLoading !== null}
                            aria-label={`Anonymiser le contact ${entry.phone}`}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 className={`w-3 h-3 ${isAnonymizing ? 'animate-pulse' : ''}`} />
                            Anonymiser
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
