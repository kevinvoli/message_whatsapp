import React, { useState } from 'react';
import { Search, LogOut, Wifi, WifiOff, User } from 'lucide-react';
import { Commercial, Contact, Conversation, Stats, ViewMode } from '@/types/chat';
import ConversationItem from './ConversationItem';
import { useChatStore } from '@/store/chatStore';
import UserHeader from './UserHeader';
import ConversationFilters from './ConversationFilters';
import ConversationList from './ConversationList';
import { useAuth } from '@/contexts/AuthProvider';

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
  console.log("contacte charge ", contacts);


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
        <><ConversationFilters
          conversations={conversations}
          totalUnread={totalUnread}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus} />
          <ConversationList
            filteredConversations={conversations}
            selectedConversation={selectedConversation}
            onSelectConversation={onSelectConversation} selectedConv={''} />
        </>
      )
        : (
          filteredContacts?.map((contact) => (
            <div
              key={contact.id}
              className="p-4 bg-white border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
                  {contact.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {contact.name}
                  </h3>
                  <p className="text-sm text-gray-600 truncate">
                    {contact.contact}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${contact.call_status === 'appelé'
                        ? 'bg-green-100 text-green-800'
                        : contact.call_status === 'à_appeler'
                          ? 'bg-blue-100 text-blue-800'
                          : contact.call_status === 'rappeler'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                    >
                      {contact.call_status.replace('_', ' ')}
                    </span>
                    {contact.priority && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${contact.priority === 'haute'
                          ? 'bg-red-100 text-red-800'
                          : contact.priority === 'moyenne'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                          }`}
                      >
                        {contact.priority}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

          )))}
    </div>

  );

};

export default Sidebar;