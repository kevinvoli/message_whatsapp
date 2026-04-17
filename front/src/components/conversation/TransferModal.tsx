'use client';
import React, { useEffect, useState } from 'react';
import { X, ArrowRight, Loader2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface Poste {
  id: string;
  name: string;
  code: string;
  description?: string;
}

interface TransferModalProps {
  chatId: string;
  currentPosteId?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  chatId,
  currentPosteId,
  onClose,
  onSuccess,
}) => {
  const [postes, setPostes] = useState<Poste[]>([]);
  const [selectedPosteId, setSelectedPosteId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (currentPosteId) params.set('exclude_poste_id', currentPosteId);

    fetch(`${API_URL}/conversations/${encodeURIComponent(chatId)}/transfer/targets?${params}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setPostes(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Impossible de charger les postes disponibles');
        setLoading(false);
      });
  }, [chatId, currentPosteId]);

  const handleTransfer = async () => {
    if (!selectedPosteId) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_URL}/conversations/${encodeURIComponent(chatId)}/transfer`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            target_poste_id: selectedPosteId,
            reason: reason.trim() || undefined,
          }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Erreur lors du transfert');
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du transfert');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">Transférer la conversation</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-green-500" />
          </div>
        ) : postes.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">
            Aucun poste disponible pour le transfert
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-3">Sélectionnez le poste de destination :</p>
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto pr-1">
              {postes.map((poste) => (
                <button
                  key={poste.id}
                  type="button"
                  onClick={() => setSelectedPosteId(poste.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    selectedPosteId === poste.id
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ArrowRight
                      className={`w-4 h-4 flex-shrink-0 ${
                        selectedPosteId === poste.id ? 'text-green-600' : 'text-gray-400'
                      }`}
                    />
                    <span className="font-medium text-sm text-gray-900">{poste.name}</span>
                    <span className="text-xs text-gray-400 ml-auto font-mono">{poste.code}</span>
                  </div>
                  {poste.description && (
                    <p className="text-xs text-gray-500 mt-0.5 pl-6 truncate">{poste.description}</p>
                  )}
                </button>
              ))}
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Motif{' '}
                <span className="text-gray-400 font-normal">(optionnel)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Raison du transfert..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none text-gray-700"
              />
            </div>
          </>
        )}

        {error && (
          <p className="text-sm text-red-600 mb-3 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleTransfer}
            disabled={!selectedPosteId || submitting || loading}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Transférer
          </button>
        </div>
      </div>
    </div>
  );
};
