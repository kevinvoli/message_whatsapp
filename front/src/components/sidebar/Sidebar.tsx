import React, { useState } from 'react';
import { Search, LogOut, Wifi, WifiOff, User } from 'lucide-react';
import { Commercial, Contact, Conversation, Stats, ViewMode } from '@/types/chat';
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
  contacts: Contact[];
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
  contacts,
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

}) => {


  const { logout } = useAuth()
  const typingStatus = useChatStore((state) => state.typingStatus);

  const [searchQuery, setSearchQuery] = useState('');

  // Données (à remplacer par vos vraies données)
  logger.debug("Contacts loaded in sidebar", { count: contacts.length });


  const filteredConversations = conversations?.filter((conv) => {
    if (!searchQuery) return true;
    const query = searchQuery?.toLowerCase();
    return (
      conv.clientName?.toLowerCase()?.includes(query) ||
      conv.clientPhone?.includes(query) ||
      conv.lastMessage?.text?.toLowerCase()?.includes(query)
    );
  });

  // Filtrage des contacts basé sur la recherche
  const filteredContacts = contacts?.filter((contact) => {
    if (!searchQuery) return true;
    const query = searchQuery?.toLowerCase();
    return (
      contact?.name?.toLowerCase()?.includes(query) ||
      contact?.contact?.includes(query) ||
      contact?.call_notes?.toLowerCase()?.includes(query)
    );
  });

  // Handlers


  return (
    <div className="w-100 bg-white border-r border-gray-200 flex flex-col">
      <UserHeader
        conversation={conversations}
        totalUnread={totalUnread}
        setShowStats={setShowStats}
        showStats={showStats}
        commercial={commercial}
        isConnected={isConnected}
        onLogout={logout}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {viewMode === 'conversations' ? (
        <>
          <ConversationFilters
            conversations={conversations}
            totalUnread={totalUnread}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
          />
          <ConversationList
            filteredConversations={filteredConversations}
            selectedConversation={selectedConversation}
            onSelectConversation={onSelectConversation}
            selectedConv={''}
          />
        </>
      ) : (
        <ContactSidebarPanel searchQuery={searchQuery} />
      )}
    </div>

  );

};

export default Sidebar;
