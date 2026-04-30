"use client";

import React, { useState, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { initiateOutboundConversation } from '@/app/lib/api/conversations.api';
import { useToast } from './ToastProvider';
import { Channel } from '@/app/lib/definitions';

interface OutboundMessageModalProps {
  onClose: () => void;
  onSuccess?: (chatId: string) => void;
  channels?: Channel[];
}

export default function OutboundMessageModal({
  onClose,
  onSuccess,
  channels = [],
}: OutboundMessageModalProps) {
  const { addToast } = useToast();
  const [channelId, setChannelId] = useState(channels[0]?.channel_id ?? '');
  const [recipient, setRecipient] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (channels.length > 0 && !channelId) {
      setChannelId(channels[0].channel_id);
    }
  }, [channels, channelId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelId || !recipient.trim() || !text.trim()) {
      addToast({ type: 'error', message: 'Tous les champs sont requis' });
      return;
    }
    // Nettoyer le numero : supprimer +, espaces, tirets, parentheses
    const cleanRecipient = recipient.replace(/[\s+\-()]/g, '');
    setLoading(true);
    try {
      const result = await initiateOutboundConversation({
        channel_id: channelId,
        recipient: cleanRecipient,
        text: text.trim(),
      });
      addToast({ type: 'success', message: 'Message envoye avec succes' });
      onSuccess?.(result.chat_id);
      onClose();
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : "Erreur lors de l'envoi",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Nouveau message sortant
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {channels.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Canal
              </label>
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                {channels.map((ch) => (
                  <option key={ch.channel_id} value={ch.channel_id}>
                    {ch.label ?? ch.channel_id} ({ch.provider ?? 'whapi'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Numero de telephone
            </label>
            <input
              type="tel"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="ex: +225 07 12 34 56 78"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Format international avec ou sans le +
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Votre message..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
              {loading ? 'Envoi...' : 'Envoyer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
