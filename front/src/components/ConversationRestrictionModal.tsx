'use client';

import React, { useEffect } from 'react';
import { AlertCircle, MessageSquare, X } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { formatTime } from '@/lib/dateUtils';

const ConversationRestrictionModal: React.FC = () => {
  const restrictionTriggered = useChatStore((s) => s.restrictionTriggered);
  const restrictionUnresponded = useChatStore((s) => s.restrictionUnresponded);
  const restrictionConfig = useChatStore((s) => s.restrictionConfig);
  const dismissRestriction = useChatStore((s) => s.dismissRestriction);
  const closeRestrictionModal = useChatStore((s) => s.closeRestrictionModal);
  const currentChatId = useChatStore((s) => s.selectedConversation?.chat_id);

  // Fermeture automatique quand la restriction est levée
  useEffect(() => {
    // Pas d'action nécessaire : le modal disparaît via restrictionTriggered = false
  }, [restrictionTriggered]);

  const filteredUnresponded = restrictionUnresponded.filter(
    (conv) => conv.chat_id !== currentChatId,
  );

  if (!restrictionTriggered || filteredUnresponded.length === 0) return null;

  const minChars = restrictionConfig?.minResponseChars ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      // Pas de fermeture au clic sur l'overlay — modal bloquant
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-red-500 shrink-0" size={24} />
            <h2 className="text-lg font-semibold text-gray-900">Réponse requise</h2>
          </div>
          <button
            type="button"
            onClick={closeRestrictionModal}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Fermer et répondre à la conversation ouverte"
            title="Fermer — répondre à la conversation ouverte"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-gray-600 mb-5">
          Vous devez répondre aux conversations suivantes (minimum{' '}
          <span className="font-semibold text-red-600">{minChars} caractères</span>) avant de
          pouvoir en ouvrir une nouvelle :
        </p>

        <div className="space-y-3 mb-6 max-h-64 overflow-y-auto pr-1">
          {filteredUnresponded.map((conv) => (
            <div
              key={conv.chat_id}
              className="flex items-start justify-between gap-3 p-3 bg-red-50 border border-red-200 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {conv.contact_name}
                </p>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {conv.last_client_message.length > 80
                    ? `${conv.last_client_message.slice(0, 80)}…`
                    : conv.last_client_message}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Consulté à {formatTime(conv.accessed_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismissRestriction(conv.chat_id)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                aria-label={`Répondre à ${conv.contact_name}`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Répondre
              </button>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 text-center">
          Ce message disparaîtra automatiquement une fois toutes les conversations répondues.
        </p>
      </div>
    </div>
  );
};

export default ConversationRestrictionModal;
