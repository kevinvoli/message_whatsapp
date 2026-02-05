import React from 'react';
import { User } from 'lucide-react';
import { Conversation } from '@/types/chat';
import { useChatStore } from '@/store/chatStore';

interface ChatHeaderProps {
  conversation: Conversation;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ conversation }) => {
  const isTyping = useChatStore((state) => state.typingStatus[conversation.chat_id]);

  return (
    <div className="bg-white border-b border-gray-200 p-4 flex items-center gap-3">
      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center relative">
        <User className="w-6 h-6 text-green-600" />
        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${conversation.status === 'actif' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
      </div>
      <div>
        <h3 className="font-semibold text-gray-800">{conversation.clientName}</h3>
        {isTyping ? (
          <p className="text-sm text-green-600 animate-pulse font-medium italic">En train d'écrire...</p>
        ) : (
          <p className="text-sm text-gray-600">{conversation.clientPhone}</p>
        )}
      </div>
    </div>
  );
};

export default ChatHeader;