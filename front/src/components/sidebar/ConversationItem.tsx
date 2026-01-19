import React from 'react';
import { User } from 'lucide-react';
import { Conversation } from '@/types/chat';

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

const ConversationItem: React.FC<ConversationItemProps> = ({ 
  conversation, isSelected, onClick }) => {
  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    
    if (diff < 86400000) {
      return new Date(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 604800000) {
      return new Date(date).toLocaleDateString('fr-FR', { weekday: 'short' });
    } else {
      return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    }
  };

  return (
    <div
      onClick={onClick}
      className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
        isSelected ? 'bg-green-50' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
          <User className="w-6 h-6 text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-gray-800 truncate">{conversation.clientName}</h3>
            <span className="text-xs text-gray-500">
              {conversation.lastMessage ? formatTime(conversation.lastMessage.timestamp) : formatTime(new Date())}
            </span>
          </div>
          <p className="text-sm text-gray-600 truncate">{conversation.clientPhone}</p>
          <p className="text-sm text-gray-500 truncate mt-1">
            {conversation.lastMessage ? conversation.lastMessage.text : 'Aucun message pour le moment'}
          </p>
        </div>
        {conversation.unreadCount > 0 && (
          <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
            {conversation.unreadCount}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationItem;