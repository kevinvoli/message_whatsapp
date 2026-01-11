import React, { useEffect, useRef } from 'react';
import { Clock, Check, CheckCheck } from 'lucide-react';
import { Message } from '@/types/chat';

interface ChatMessagesProps {
  messages: Message[];
}

const ChatMessages: React.FC<ChatMessagesProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

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

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.from === 'commercial' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-xl px-4 py-2 rounded-2xl ${
              msg.from === 'commercial'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-800'
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
            <div className={`flex items-center gap-1 mt-1 text-xs ${
              msg.from === 'commercial' ? 'text-green-100' : 'text-gray-500'
            }`}>
              <span>{formatTime(msg.timestamp)}</span>
              {msg.from === 'commercial' && renderStatusIcon(msg.status)}
            </div>
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatMessages;