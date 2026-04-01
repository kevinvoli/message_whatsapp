'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Phone } from 'lucide-react';
import Sidebar from '@/components/sidebar/Sidebar';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatMessages from '@/components/chat/ChatMessages';
import ChatInput from '@/components/chat/ChatInput';
import { useAuth } from '@/contexts/AuthProvider';
import { useChatStore } from '@/store/chatStore';
import { useSocket } from '@/contexts/SocketProvider';
import { useRouter } from 'next/navigation';
import { CallStatus, Conversation, ViewMode } from '@/types/chat';
import { useStatsStore } from '@/store/stats.store';
import ChatMainArea from '@/components/chat/ChatMainArea';
import { useContactStore } from '@/store/contactStore';
import { ContactDetailView } from '@/components/contacts/ContactDetailView';
import { logger } from '@/lib/logger';

const WhatsAppPage = () => {
  const { user, initialized } = useAuth();
  const router = useRouter();
  const { contacts, setContacts } = useContactStore();
  const {
    conversations,
    selectedConversation,
    selectConversation,

    // messages,
    // isLoading,
    // error,
    // sendMessage,
    // onTypingStart,
    // onTypingStop,
    // loadConversations,

  } = useChatStore();
  
  const { isConnected: isWebSocketConnected } = useSocket();
  const { stats } = useStatsStore();

  const [showStats, setShowStats] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

   const [viewMode, setViewMode] = useState<ViewMode>('conversations');
    const [searchQuery, setSearchQuery] = useState('');

  // Protection de route
  useEffect(() => {
    if (initialized && !user) {
      router.replace('/login');
    }
  }, [initialized, user, router]);

  // Gérer la sélection d'une conversation
  const handleSelectConversation = useCallback((conversation: Conversation) => {
    logger.debug('Conversation selected', {
      chat_id: conversation.chat_id,
    });
    selectConversation(conversation.chat_id);
  }, [selectConversation]);

  // Envoyer un message

  
  const totalMessages = selectedConversation ? selectedConversation.messages?.length : 0;
  const totalUnread = conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      const matchesStatus =
        filterStatus === 'all' ? true :
        filterStatus === 'unread' ? conv.unreadCount > 0 :
        filterStatus === 'nouveau' ? conv.status === 'nouveau' :
        filterStatus === 'urgent' ? conv.priority === 'haute' : true;

      const matchesSearch = !searchQuery
        ? true
        : conv.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          conv.clientPhone?.includes(searchQuery) ||
          (conv.lastMessage?.text ?? '').toLowerCase().includes(searchQuery.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }, [conversations, filterStatus, searchQuery]);

    // Filtrage des contacts basé sur la recherche
    const filteredContacts = contacts.filter((contact) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            contact.name.toLowerCase().includes(query) ||
            contact.contact.includes(query) ||
            contact.call_notes?.toLowerCase().includes(query)
        );
    });

    const handleViewModeChange = (mode: ViewMode) => {
        setViewMode(mode);
        setSearchQuery(''); // Réinitialiser la recherche lors du changement de vue
    };

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
        onSelectConversation={handleSelectConversation}

        setFilterStatus={setFilterStatus}
        stats={stats}
        filterStatus={filterStatus}
        totalUnread={totalUnread}
        setShowStats={setShowStats}
        showStats={showStats}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        contacts={contacts}

      />
      {viewMode === 'conversations' ? <ChatMainArea /> : <ContactDetailView onSwitchToConversations={() => setViewMode('conversations')} />}

      
    </div>
  );
};

export default WhatsAppPage;
