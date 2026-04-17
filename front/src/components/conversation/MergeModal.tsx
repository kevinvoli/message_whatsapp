'use client';
import React, { useState } from 'react';
import { X, Loader2, Merge, Search } from 'lucide-react';
import { Conversation } from '@/types/chat';
import { useChatStore } from '@/store/chatStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface MergeModalProps {
  sourceConversation: Conversation;
  onClose: () => void;
  onSuccess?: () => void;
}

export const MergeModal: React.FC<MergeModalProps> = ({
  sourceConversation,
  onClose,
  onSuccess,
}) => {
  const { conversations } = useChatStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredConversations = conversations
    .filter((c) => {
      if (c.chat_id === sourceConversation.chat_id) return false;
      if (c.status === 'fermé') return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.clientName.toLowerCase().includes(q) ||
        c.clientPhone.toLowerCase().includes(q)
      );
    })
    .slice(0, 20);

  const selectedTarget = filteredConversations.find((c) => c.chat_id === selectedTargetId);

  const handleMerge = async () => {
    if (!selectedTargetId) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/conversations/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          source_chat_id: sourceConversation.chat_id,
          target_chat_id: selectedTargetId,
          reason: reason.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Erreur lors de la fusion');
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la fusion');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Merge className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-gray-900">Fusionner la conversation</h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">Conversation source (sera archivée)</p>
          <p className="text-sm font-medium text-gray-900">{sourceConversation.clientName}</p>
          <p className="text-xs text-gray-500">{sourceConversation.clientPhone}</p>
        </div>

        {/* Recherche conversation cible */}
        <p className="text-sm font-medium text-gray-700 mb-2">
          Sélectionnez la conversation cible :
        </p>
        <div className="relative mb-2">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom ou téléphone..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-lg mb-4">
          {filteredConversations.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Aucune conversation trouvée</p>
          ) : (
            filteredConversations.map((conv) => (
              <button
                key={conv.chat_id}
                type="button"
                onClick={() => setSelectedTargetId(conv.chat_id)}
                className={`w-full text-left px-3 py-2.5 border-b border-gray-100 last:border-0 transition-colors ${
                  selectedTargetId === conv.chat_id
                    ? 'bg-purple-50 border-l-4 border-l-purple-500'
                    : 'hover:bg-gray-50'
                }`}
              >
                <p className="text-sm font-medium text-gray-900">{conv.clientName}</p>
                <p className="text-xs text-gray-500">{conv.clientPhone}</p>
              </button>
            ))
          )}
        </div>

        {selectedTarget && (
          <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-200 text-xs text-purple-800">
            Les messages de <strong>{sourceConversation.clientName}</strong> seront fusionnés dans{' '}
            <strong>{selectedTarget.clientName}</strong>. La conversation source sera archivée.
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Motif <span className="text-gray-400 font-normal">(optionnel)</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex : doublon, même client..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

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
            onClick={handleMerge}
            disabled={!selectedTargetId || submitting}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Fusionner
          </button>
        </div>
      </div>
    </div>
  );
};
