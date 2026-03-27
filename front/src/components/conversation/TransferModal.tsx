'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, Loader2, Search, X } from 'lucide-react';

interface Poste {
  id: string;
  name: string;
  code: string;
}

interface TransferModalProps {
  chatId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const TransferModal: React.FC<TransferModalProps> = ({ chatId, onClose, onSuccess }) => {
  const [postes, setPostes] = useState<Poste[]>([]);
  const [filtered, setFiltered] = useState<Poste[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPoste, setSelectedPoste] = useState<Poste | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch(`${API_URL}/conversations/postes/available`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: Poste[]) => {
        setPostes(data);
        setFiltered(data);
      })
      .catch(() => setError('Impossible de charger les postes'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(postes.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)));
  }, [search, postes]);

  const handleConfirm = async () => {
    if (!selectedPoste) return;
    setSubmitting(true);
    setError('');
    try {
      const resp = await fetch(`${API_URL}/conversations/${encodeURIComponent(chatId)}/transfer`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_poste_id: selectedPoste.id, reason: reason.trim() || undefined }),
      });
      if (!resp.ok) throw new Error('Erreur lors du transfert');
      onSuccess();
      onClose();
    } catch {
      setError('Le transfert a échoué. Réessayez.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-green-600" />
            <h2 className="text-base font-semibold text-gray-900">Transférer la conversation</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Rechercher un poste..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>
        </div>

        {/* Poste list */}
        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-green-500" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucun poste trouvé</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedPoste(p)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between ${
                      selectedPoste?.id === p.id
                        ? 'bg-green-50 border border-green-300 text-green-800'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-gray-400">{p.code}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Reason */}
        <div className="px-5 pb-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">Raison (optionnel)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex : client demande spécialiste, absence agent..."
            rows={2}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>

        {error && (
          <p className="px-5 pb-2 text-xs text-red-600">{error}</p>
        )}

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!selectedPoste || submitting}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            Transférer
          </button>
        </div>
      </div>
    </div>
  );
};
