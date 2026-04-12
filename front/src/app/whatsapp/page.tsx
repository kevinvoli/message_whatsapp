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
import { useRouter } from 'next/navigation';
import { CallStatus, Conversation, ViewMode } from '@/types/chat';
import { useStatsStore } from '@/store/stats.store';
import ChatMainArea from '@/components/chat/ChatMainArea';
import { ContactDetailView } from '@/components/contacts/ContactDetailView';
import { logger } from '@/lib/logger';

const WhatsAppPage = () => {
  const { user, initialized } = useAuth();
  const router = useRouter();
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
  const [filterStatus, setFilterStatus] = useState('all');

   const [viewMode, setViewMode] = useState<ViewMode>('conversations');
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
      loadConversations(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, loadConversations]);

  // Le filtre de statut reste côté client : le backend renvoie tous les statuts.
  // La recherche textuelle est désormais gérée par le serveur.
  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      switch (filterStatus) {
        case 'unread':  return conv.unreadCount > 0;
        // "Nouveaux" = le commercial n'a jamais répondu (last_poste_message_at null).
        // Ne pas se baser sur conv.status === 'attente' qui reflète l'état du poste
        // au moment du dispatch (online/offline), pas l'état "jamais traité".
        case 'nouveau': return !conv.last_poste_message_at;
        case 'urgent':  return conv.priority === 'haute';
        default:        return true; // 'all' et tout autre
      }
    });
  }, [conversations, filterStatus]);

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
        allConversations={conversations}
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
      />
      {viewMode === 'conversations' ? <ChatMainArea /> : <ContactDetailView onSwitchToConversations={() => setViewMode('conversations')} />}

      
    </div>
  );
};

export default WhatsAppPage;
