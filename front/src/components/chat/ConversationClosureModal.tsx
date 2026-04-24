"use client";

import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, X, XCircle, AlertTriangle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

interface Blocker {
  code: string;
  label: string;
  severity: 'error' | 'warning';
}

interface ClosureReadiness {
  ok: boolean;
  blockers: Blocker[];
}

interface Props {
  chatId: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const CODE_ACTIONS: Record<string, string> = {
  RAPPORT_INCOMPLET:          'Compléter le rapport GICOP (onglet dossier)',
  RESULTAT_MANQUANT:          'Renseigner le résultat de la conversation',
  PROCHAINE_ACTION_MANQUANTE: 'Indiquer la prochaine action dans le rapport',
  RELANCE_REQUISE:            'Planifier une relance via le panneau relances',
  DOSSIER_INCOMPLET:          'Compléter le dossier client',
};

export default function ConversationClosureModal({ chatId, onConfirm, onCancel }: Props) {
  const [readiness, setReadiness]   = useState<ClosureReadiness | null>(null);
  const [loading, setLoading]       = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_URL}/conversations/${chatId}/closure-readiness`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() as Promise<ClosureReadiness> : null)
      .then((data) => { if (!cancelled && data) setReadiness(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [chatId]);

  const handleConfirm = async () => {
    if (!readiness?.ok) return;
    setConfirming(true);
    setCloseError(null);
    try {
      const res = await fetch(`${API_URL}/conversations/${chatId}/close`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        setCloseError(body.message ?? 'Erreur lors de la fermeture');
        return;
      }
      onConfirm();
    } catch {
      setCloseError('Erreur réseau — réessayez');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-500" />
            <span className="font-semibold text-gray-900">Fermer la conversation</span>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Vérification des conditions…</span>
            </div>
          )}

          {!loading && readiness?.ok && (
            <div className="flex items-start gap-3 py-3">
              <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Toutes les conditions sont remplies</p>
                <p className="text-xs text-gray-500 mt-0.5">La conversation peut être fermée.</p>
              </div>
            </div>
          )}

          {!loading && readiness && !readiness.ok && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600 mb-3">
                La fermeture est bloquée. Veuillez corriger les points suivants :
              </p>
              {readiness.blockers.map((b) => (
                <div
                  key={b.code}
                  className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-100"
                >
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-red-800">{b.label}</p>
                    {CODE_ACTIONS[b.code] && (
                      <p className="text-xs text-red-600 mt-0.5">{CODE_ACTIONS[b.code]}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 space-y-2">
          {closeError && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700">{closeError}</p>
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => void handleConfirm()}
              disabled={loading || !readiness?.ok || confirming}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {confirming && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Fermer la conversation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
