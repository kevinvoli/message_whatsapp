import React, { useEffect, useRef } from 'react';
import { Clock, Check, CheckCheck } from 'lucide-react';
import { Message } from '@/types/chat';

interface ChatMessagesProps {
  messages: Message[];
}

const ChatMessages: React.FC<ChatMessagesProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);



  const formatTime = (date: Date) => {
    try {
      // Vérifie si la date est valide avant de la formater
      const d = new Date(date);
      if (isNaN(d.getTime())) {
        return '--:--';
      }
      return d.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '--:--';
    }
  };

  console.log("dododododoodododododoodo",messages);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const renderStatusIcon = (status?: string) => {
    switch (status) {
      case 'sending':
        return <Clock className="w-3 h-3" />;
      case 'sent':
        return <Check className="w-3 h-3" />;
      case 'delivered':
        return <CheckCheck className="w-3 h-3" />;
      case 'read':
        return <CheckCheck className="w-3 h-3 text-blue-300" />;
      default:
        return null;
    }
  };

  // Si aucun message
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400">
          <p className="text-lg">Aucun message</p>
          <p className="text-sm mt-2">Envoyez le premier message pour démarrer la conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
      {messages.map((msg, index) => {
        // Validation des données
        const messageText = msg.text || "(Message sans texte)";
        const messageFrom = msg.from_me? 'commercial'  : 'client';
        // Utilise une date valide ou null. La fonction formatTime gérera le cas null.
        const messageTimestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
        // Crée un ID stable pour la clé en cas d'absence d'ID de message
        const messageId = msg.id || `msg-fallback-${index}`;

        return (
          <div
            key={messageId}
            className={`flex ${
              messageFrom === 'commercial' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-xl px-4 py-2 rounded-2xl ${
                messageFrom === 'commercial'
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-800 border border-gray-200'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{messageText}</p>
              <div className={`flex items-center gap-1 mt-1 text-xs ${
                messageFrom === 'commercial' ? 'text-green-100' : 'text-gray-500'
              }`}>
                <span>{formatTime(messageTimestamp)}</span>
                {messageFrom === 'commercial' && renderStatusIcon(msg.status)}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatMessages;