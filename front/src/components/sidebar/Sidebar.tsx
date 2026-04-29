import React, { useState } from 'react';
import { Search, LogOut, Wifi, WifiOff, User, Plus } from 'lucide-react';
import { Commercial, Conversation, Stats, ViewMode } from '@/types/chat';
import ConversationItem from './ConversationItem';
import { useChatStore } from '@/store/chatStore';
import UserHeader from './UserHeader';
import ConversationFilters from './ConversationFilters';
import ConversationList from './ConversationList';
import { useAuth } from '@/contexts/AuthProvider';
import { logger } from '@/lib/logger';
import { ContactSidebarPanel } from '@/components/contacts/ContactSidebarPanel';
import FollowUpPanel from '@/components/chat/FollowUpPanel';
import ObjectifsPanel from '@/components/chat/ObjectifsPanel';
import RankingPositionWidget from '@/components/chat/RankingPositionWidget';
import { OutboundModal } from '@/components/conversation/OutboundModal';
import BusinessMenusPanel from './BusinessMenusPanel';
import PrioritePostePanel from './PrioritePostePanel';
import ActionGateBanner from './ActionGateBanner';
import ActionQueuePanel from './ActionQueuePanel';
import DashboardPanel from './DashboardPanel';

interface SidebarProps {
  commercial: Commercial;
  conversations: Conversation[];
  allConversations?: Conversation[];
  filterStatus: string;
  searchTerm: string;
  selectedConversation: Conversation | null;
  isConnected: boolean;
  stats?: Stats | null;
  showStats: boolean;
  totalUnread: number;
  setFilterStatus: (status: string) => void;
  onSearchChange: (term: string) => void;
  onSelectConversation: (conv: Conversation) => void;
  setShowStats: (show: boolean) => void;

  viewMode?: ViewMode
  onViewModeChange?: (mode: ViewMode) => void
  searchQuery?: string

}

const Sidebar: React.FC<SidebarProps> = ({
  commercial,
  conversations,
  allConversations,
  searchTerm,
  selectedConversation,
  isConnected,
  showStats,
  setFilterStatus,
  totalUnread,
  stats,
  filterStatus,
  onSearchChange,
  onSelectConversation,
  setShowStats,
  viewMode,
  onViewModeChange,
  searchQuery,
}) => {
  const { logout } = useAuth();
  const typingStatus = useChatStore((state) => state.typingStatus);
  const conversationsFromStore = useChatStore((state) => state.conversations);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const [showOutbound, setShowOutbound] = useState(false);

  const handleOpenConversationById = React.useCallback((conversationId: string) => {
    const conv = conversationsFromStore.find((c) => c.id === conversationId);
    if (!conv) return;
    selectConversation(conv.chat_id);
    onViewModeChange?.('conversations');
  }, [conversationsFromStore, selectConversation, onViewModeChange]);

  // Handlers


  return (
    <div className="w-100 bg-white border-r border-gray-200 flex flex-col">
      <ActionGateBanner />
      <UserHeader
        conversation={allConversations ?? conversations}
        totalUnread={totalUnread}
        setShowStats={setShowStats}
        showStats={showStats}
        commercial={commercial}
        isConnected={isConnected}
        onLogout={logout}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        searchQuery={searchQuery ?? '' }
        onSearchChange={onSearchChange}
      />

      {viewMode === 'conversations' ? (
        <>
          <PrioritePostePanel />
          <div className="flex items-center border-b border-gray-100">
            <div className="flex-1">
              <ConversationFilters
                conversations={allConversations ?? conversations}
                totalUnread={totalUnread}
                filterStatus={filterStatus}
                setFilterStatus={setFilterStatus}
              />
            </div>
            <button
              onClick={() => setShowOutbound(true)}
              className="flex-shrink-0 mr-2 p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              title="Nouvelle conversation"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <ConversationList
            filteredConversations={conversations}
            filterStatus={filterStatus}
            selectedConversation={selectedConversation}
            onSelectConversation={onSelectConversation}
            selectedConv={''}
          />
        </>
      ) : viewMode === 'contacts' ? (
        <ContactSidebarPanel searchQuery={searchQuery ?? ''} />
      ) : viewMode === 'objectifs' ? (
        <ObjectifsPanel />
      ) : viewMode === 'ranking' ? (
        <RankingPositionWidget />
      ) : viewMode === 'menus-metier' ? (
        <BusinessMenusPanel />
      ) : viewMode === 'action-queue' ? (
        <ActionQueuePanel />
      ) : viewMode === 'dashboard' ? (
        <DashboardPanel />
      ) : (
        <FollowUpPanel onOpenConversation={handleOpenConversationById} />
      )}

      {showOutbound && (
        <OutboundModal onClose={() => setShowOutbound(false)} />
      )}
    </div>

  );

};

export default Sidebar;
