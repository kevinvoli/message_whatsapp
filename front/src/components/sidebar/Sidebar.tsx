import React from 'react';
import { Search, LogOut, Wifi, WifiOff, User } from 'lucide-react';
import { Commercial, Conversation, Stats, ViewMode } from '@/types/chat';
import ConversationItem from './ConversationItem';
import { useChatStore } from '@/store/chatStore';
import UserHeader from './UserHeader';
import ConversationFilters from './ConversationFilters';
import ConversationList from './ConversationList';
import { useAuth } from '@/contexts/AuthProvider';
import { logger } from '@/lib/logger';
import { ContactSidebarPanel } from '@/components/contacts/ContactSidebarPanel';

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
  // onLogout,
  setShowStats,
  viewMode,
  onViewModeChange,
  searchQuery,

}) => {


  const { logout } = useAuth()
  const typingStatus = useChatStore((state) => state.typingStatus);

  // Handlers


  return (
    <div className="w-100 bg-white border-r border-gray-200 flex flex-col">
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
          <ConversationFilters
            conversations={allConversations ?? conversations}
            totalUnread={totalUnread}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
          />
          <ConversationList
            filteredConversations={conversations}
            selectedConversation={selectedConversation}
            onSelectConversation={onSelectConversation}
            selectedConv={''}
          />
        </>
      ) : (
        <ContactSidebarPanel searchQuery={searchQuery ?? ''} />
      )}
    </div>

  );

};

export default Sidebar;
