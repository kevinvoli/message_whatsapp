'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const WhatsAppPage = () => {
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
  const isInitialFilterMount = useRef(true);

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
  // Utilise la valeur globale envoyée par le backend (inclut les conversations fermées
  // et toutes les conversations du poste, pas seulement celles visibles dans la liste)
  // Fallback sur le calcul local si le backend n'a pas encore envoyé TOTAL_UNREAD_UPDATE
  const totalUnread = totalUnreadFromStore || conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);

  // Recherche côté serveur : quand searchQuery change, recharger depuis le backend.
  // Debounce 300 ms pour éviter de spammer à chaque frappe.
  // On skip le premier render car WebSocketEvents.tsx gère le chargement initial.
  useEffect(() => {
    if (isInitialSearchMount.current) {
      isInitialSearchMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      loadConversations(searchQuery || undefined, filterStatus === 'unread');
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, loadConversations]);

  // Filtre "non lus" : rechargement côté serveur pour inclure toutes les conversations
  // non lues du poste, même au-delà de la limite de pagination (300).
  // Les autres filtres restent côté client.
  useEffect(() => {
    if (isInitialFilterMount.current) {
      isInitialFilterMount.current = false;
      return;
    }
    loadConversations(searchQuery || undefined, filterStatus === 'unread');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      switch (filterStatus) {
        case 'unread':  return conv.unreadCount > 0;
        // "Nouveaux" = le commercial n'a jamais répondu (last_poste_message_at null).
        // Ne pas se baser sur conv.status === 'attente' qui reflète l'état du poste
        // au moment du dispatch (online/offline), pas l'état "jamais traité".
        case 'nouveau': return !conv.last_poste_message_at;
        default:        return true; // 'all' et tout autre
      }
    });
  }, [conversations, filterStatus]);

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

export default WhatsAppPage;
