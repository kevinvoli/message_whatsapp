import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isConnected: boolean;
  disabled?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isConnected,
  disabled = false,
}) => {
  const [message, setMessage] = useState('');
  const { socket, selectedConversation } = useChatStore();
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Nettoie le timeout lorsque le composant est démonté
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const emitTypingEvent = (event: 'typing:start' | 'typing:stop') => {
    if (socket && selectedConversation) {
      socket.emit(event, { conversationId: selectedConversation.chat_id });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    // Si un timeout est déjà en cours, on ne fait rien (on a déjà émis 'typing:start')
    if (!typingTimeoutRef.current) {
      emitTypingEvent('typing:start');
    } else {
      clearTimeout(typingTimeoutRef.current);
    }

    // Crée un nouveau timeout pour émettre 'typing:stop' après 2 secondes d'inactivité
    typingTimeoutRef.current = setTimeout(() => {
      emitTypingEvent('typing:stop');
      typingTimeoutRef.current = null; // Réinitialise la référence
    }, 2000);
  };

  const handleSubmit = () => {
    if (message.trim() && !disabled && isConnected) {
      onSendMessage(message.trim());
      setMessage('');

      // Arrête l'événement de frappe après l'envoi
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      emitTypingEvent('typing:stop');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="bg-white border-t border-gray-200 p-4">
      <div className="flex items-end gap-2">
        <textarea
          value={message}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Tapez votre message..."
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none text-gray-500"
          rows={2}
          disabled={disabled || !isConnected}
        />
        <button
          onClick={handleSubmit}
          disabled={!message.trim() || disabled || !isConnected}
          className="bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
      {!isConnected && (
        <p className="text-xs text-red-500 mt-2">Connexion perdue. Tentative de reconnexion...</p>
      )}
    </div>
  );
};

export default ChatInput;