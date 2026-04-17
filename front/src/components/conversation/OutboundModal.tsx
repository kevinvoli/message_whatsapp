'use client';
import React, { useState } from 'react';
import { X, Loader2, Phone, MessageSquarePlus } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface OutboundModalProps {
  onClose: () => void;
  onSuccess?: (chatId: string) => void;
}

export const OutboundModal: React.FC<OutboundModalProps> = ({ onClose, onSuccess }) => {
  const [phone, setPhone] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectConversation = useChatStore((s) => s.selectConversation);

  const handleSubmit = async () => {
    const trimmedPhone = phone.replace(/\s/g, '').trim();
    const trimmedText = text.trim();

    if (!trimmedPhone || !trimmedText) {
      setError('Numéro et message requis');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/conversations/outbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: trimmedPhone, text: trimmedText }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Erreur lors de la création');
      }

      const result = await res.json();
      selectConversation(result.chat_id);
      onSuccess?.(result.chat_id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) handleSubmit();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onKeyDown={handleKeyDown}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Nouvelle conversation</h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Numéro de téléphone
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ex : 33612345678 ou +33 6 12 34 56 78"
                autoFocus
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Sans le `+`, sans espaces ni tirets</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Message initial
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Bonjour, je vous contacte au sujet de..."
              rows={4}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 mt-3 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !phone.trim() || !text.trim()}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Envoyer
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">Ctrl+Entrée pour envoyer</p>
      </div>
    </div>
  );
};
