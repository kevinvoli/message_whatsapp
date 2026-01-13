import React from 'react';
import { User } from 'lucide-react';
import { Conversation } from '@/types/chat';

interface ChatHeaderProps {
  conversation: Conversation;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ conversation }) => {
  return (
    <div className="flex items-center gap-3 border-b border-gray-200 bg-white p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
        <User className="h-6 w-6 text-green-600" />
      </div>
      <div>
        <h3 className="font-semibold text-gray-800">{conversation.clientName}</h3>
        <p className="text-sm text-gray-600">{conversation.clientPhone}</p>
      </div>
    </div>
  );
};

export default ChatHeader;