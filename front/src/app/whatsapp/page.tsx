'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Phone } from 'lucide-react';
import Sidebar from '@/components/sidebar/Sidebar';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatMessages from '@/components/chat/ChatMessages';
import ChatInput from '@/components/chat/ChatInput';
import { useAuth } from '@/contexts/AuthProvider';
import { useChatStore } from '@/store/chatStore';
import { useSocket } from '@/contexts/SocketProvider';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { CallStatus, Conversation, ViewMode } from '@/types/chat';
import { useStatsStore } from '@/store/stats.store';
import ChatMainArea from '@/components/chat/ChatMainArea';
import { ContactDetailView } from '@/components/contacts/ContactDetailView';
import { logger } from '@/lib/logger';

const VALID_FILTER_STATUSES = ['all', 'unread', 'nouveau'];

const WhatsAppPageContent = () => {
  const { user, initialized } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const {
    conversations,
    selectedConversation,
    selectConversation,
    totalUnread: totalUnreadFromStore,
    loadConversations,
  } = useChatStore();
  const conversationsUnread = useChatStore((s) => s.conversationsUnread);
  const conversationsNouveau = useChatStore((s) => s.conversationsNouveau);
  const loadUnreadConversations = useChatStore((s) => s.loadUnreadConversations);
  const loadNouveauConversations = useChatStore((s) => s.loadNouveauConversations);
  
  const { isConnected: isWebSocketConnected } = useSocket();
  const { stats } = useStatsStore();

  const [showStats, setShowStats] = useState(false);
  const rawFilter = searchParams.get('filter') ?? 'all';
  const [filterStatus, setFilterStatus] = useState(
    VALID_FILTER_STATUSES.includes(rawFilter) ? rawFilter : 'all'
  );
  const rawView = searchParams.get('view') as ViewMode;
  const [viewMode, setViewMode] = useState<ViewMode>(
    rawView === 'contacts' ? 'contacts' : 'conversations'
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Évite un double chargement au montage (WebSocketEvents.tsx gère le premier via refreshAfterConnect)
  const isInitialSearchMount = useRef(true);

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
  // totalUnread est mis à jour dans setUnreadConversations via conversationsUnread.length.
  // Fallback sur totalUnreadFromStore pendant le chargement initial.
  const totalUnread = totalUnreadFromStore;

  // Recherche côté serveur : quand searchQuery change, recharger les 3 onglets depuis le backend.
  // Debounce 300 ms pour éviter de spammer à chaque frappe.
  // On skip le premier render car WebSocketEvents.tsx gère le chargement initial.
  useEffect(() => {
    if (isInitialSearchMount.current) {
      isInitialSearchMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const search = searchQuery || undefined;
      loadConversations(search);
      loadUnreadConversations(search);
      loadNouveauConversations(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, loadConversations, loadUnreadConversations, loadNouveauConversations]);

  const filteredConversations = useMemo(() => {
    switch (filterStatus) {
      case 'unread':  return conversationsUnread;
      case 'nouveau': return conversationsNouveau;
      default:        return conversations;
    }
  }, [filterStatus, conversations, conversationsUnread, conversationsNouveau]);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setSearchQuery('');
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', mode);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, pathname, router]);

  const handleSetFilterStatus = useCallback((status: string) => {
    setFilterStatus(status);
    const params = new URLSearchParams(searchParams.toString());
    params.set('filter', status);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, pathname, router]);

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
        allConversations={conversations}
        searchTerm=""
        selectedConversation={selectedConversation}
        isConnected={isWebSocketConnected}
        onSelectConversation={handleSelectConversation}

        setFilterStatus={handleSetFilterStatus}
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
      {viewMode === 'conversations' ? <ChatMainArea /> : <ContactDetailView onSwitchToConversations={() => handleViewModeChange('conversations')} />}

      
    </div>
  );
};

const WhatsAppPage = () => (
  <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div></div>}>
    <WhatsAppPageContent />
  </Suspense>
);

export default WhatsAppPage;
