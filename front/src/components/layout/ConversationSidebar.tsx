'use client';

import React, { useCallback } from 'react';
import Sidebar from '@/components/sidebar/Sidebar';
import { useAuth } from '@/contexts/AuthProvider';
import { useSocket } from '@/contexts/SocketProvider';
import { useChatStore } from '@/store/chatStore';
import { useStatsStore } from '@/store/stats.store';
import { useConversationSearch } from '@/hooks/useConversationSearch';
import { useConversationFilters } from '@/hooks/useConversationFilters';
import { Conversation, ViewMode } from '@/types/chat';
import { logger } from '@/lib/logger';
import { useState } from 'react';

interface ConversationSidebarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

/**
 * Container : orchestre la barre latérale de conversations.
 * Gère la recherche (useConversationSearch), le filtre (useConversationFilters)
 * et la connexion aux stores, libérant page.tsx de cette logique.
 */
export function ConversationSidebar({ viewMode, onViewModeChange }: ConversationSidebarProps) {
  const { user } = useAuth();
  const { isConnected } = useSocket();
  const { conversations, selectedConversation, selectConversation, totalUnread: totalUnreadFromStore } = useChatStore();
  const { stats } = useStatsStore();
  const [showStats, setShowStats] = useState(false);

  const { searchQuery, setSearchQuery } = useConversationSearch();
  const { filterStatus, setFilterStatus, filteredConversations } = useConversationFilters(conversations);

  const totalUnread = totalUnreadFromStore || conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    logger.debug('Conversation selected', { chat_id: conversation.chat_id });
    selectConversation(conversation.chat_id);
  }, [selectConversation]);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    onViewModeChange(mode);
    setSearchQuery('');
  }, [onViewModeChange, setSearchQuery]);

  if (!user) return null;

  return (
    <Sidebar
      commercial={user}
      conversations={filteredConversations}
      allConversations={conversations}
      searchTerm=""
      selectedConversation={selectedConversation}
      isConnected={isConnected}
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
    />
  );
}
