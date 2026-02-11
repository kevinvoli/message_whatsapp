import React from 'react';
import ConversationItem from './ConversationItem';
import { Conversation } from '@/types/chat';
import { useChatStore } from '@/store/chatStore';


interface ConversationListProps {
    filteredConversations: Conversation[];
    selectedConv: string;
     selectedConversation: Conversation | null;
     onSelectConversation: (conv: Conversation) => void;
}

export default function ConversationList({ filteredConversations, selectedConv , selectedConversation,onSelectConversation}: ConversationListProps) {

      const typingStatus = useChatStore((state) => state.typingStatus);
      console.log();
      
    return (
        <div className="flex-1 overflow-y-auto">
            {filteredConversations?.map(conv => (
               
                <ConversationItem
              key={conv.id}
              conversation={conv}
              isSelected={selectedConversation?.id === conv.id}
              isTyping={!!typingStatus[conv.chat_id]} // 👈 ICI
              onClick={() => onSelectConversation(conv)}
            />                  
            ))}
        </div>
    );
}
