'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import Sidebar from '@/components/sidebar/Sidebar';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatMessages from '@/components/chat/ChatMessages';
import ChatInput from '@/components/chat/ChatInput';
import { useAuth } from '@/contexts/AuthProvider';
import { useChatStore } from '@/store/chatStore';
import { useSocket } from '@/contexts/SocketProvider';
import { useRouter } from 'next/navigation';
import { Conversation } from '@/types/chat';
import { useStatsStore } from '@/store/stats.store';
import ChatMainArea from '@/components/chat/ChatMainArea';

const WhatsAppPage = () => {
  const { user, initialized } = useAuth();
  const router = useRouter();
  const {
    conversations,
    selectedConversation,
    messages,
    isLoading,
    error,
    selectConversation,
    sendMessage,
    onTypingStart,
    onTypingStop,
    loadConversations,
 
  } = useChatStore();
  const { isConnected: isWebSocketConnected } = useSocket();
const { stats } = useStatsStore();

  const [showStats, setShowStats] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  // Protection de route
  useEffect(() => {
    if (initialized && !user) {
      router.replace('/login');
    }
  }, [initialized, user, router]);

  // Gérer la sélection d'une conversation
  const handleSelectConversation = useCallback((conversation: Conversation) => {
    console.log("🎯 Sélection de la conversation:", conversation.clientName);
    selectConversation(conversation.chat_id);
  }, [selectConversation]);

  // Envoyer un message

    const totalMessages = selectedConversation ? selectedConversation.messages?.length : 0;
  const totalUnread = conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);

    const filteredConversations = conversations.filter(conv => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'unread') return conv.unreadCount > 0;
    if (filterStatus === 'nouveau') return conv.status === 'nouveau';
    if (filterStatus === 'urgent') return conv.priority === 'haute';
    return true;
  });

  if (!initialized || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        commercial={user}
        conversations={filteredConversations}
        searchTerm=""
        selectedConversation={selectedConversation}
        isConnected={isWebSocketConnected}
        onSearchChange={() => { }}
        onSelectConversation={handleSelectConversation}
        
        setFilterStatus={setFilterStatus}
        stats={stats} 
        filterStatus={filterStatus}
         totalUnread={totalUnread}
         setShowStats={setShowStats}
         showStats={showStats}
      />

      <ChatMainArea/>
    </div>
  );
};

export default WhatsAppPage;