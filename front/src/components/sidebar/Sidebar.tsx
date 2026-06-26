import React, { useState } from 'react';
import { Search, LogOut, Wifi, WifiOff, User, BarChart3, MessageSquare } from 'lucide-react';
import { Commercial, Conversation, Stats, ViewMode } from '@/types/chat';
import type { QuizPdf } from '@/lib/definitions';
import ConversationItem from './ConversationItem';
import { useChatStore } from '@/store/chatStore';
import UserHeader from './UserHeader';
import ConversationFilters from './ConversationFilters';
import ConversationList from './ConversationList';
import { useAuth } from '@/contexts/AuthProvider';
import { logger } from '@/lib/logger';
import { ContactSidebarPanel } from '@/components/contacts/ContactSidebarPanel';
import ActivityPanel from './ActivityPanel';

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
  onViewPdf?: (pdf: QuizPdf) => void
}

type ConversationsTab = 'liste' | 'activite';

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
  onViewPdf,
}) => {

  const { logout } = useAuth();
  const typingStatus = useChatStore((state) => state.typingStatus);
  const [conversationsTab, setConversationsTab] = useState<ConversationsTab>('liste');

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
        searchQuery={searchQuery ?? ''}
        onSearchChange={onSearchChange}
      />

      {viewMode === 'conversations' ? (
        <>
          {/* Onglets Liste / Activite */}
          <div className="flex border-b border-gray-200 bg-white">
            <button
              onClick={() => setConversationsTab('liste')}
              aria-pressed={conversationsTab === 'liste'}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                conversationsTab === 'liste'
                  ? 'text-green-700 border-b-2 border-green-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Conversations
            </button>
            <button
              onClick={() => setConversationsTab('activite')}
              aria-pressed={conversationsTab === 'activite'}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                conversationsTab === 'activite'
                  ? 'text-green-700 border-b-2 border-green-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Mon activite
            </button>
          </div>

          {conversationsTab === 'liste' ? (
            <>
              <ConversationFilters
                conversations={allConversations ?? conversations}
                totalUnread={totalUnread}
                filterStatus={filterStatus}
                setFilterStatus={setFilterStatus}
              />
              <ConversationList
                filteredConversations={conversations}
                filterStatus={filterStatus}
                selectedConversation={selectedConversation}
                onSelectConversation={onSelectConversation}
                selectedConv={''}
              />
            </>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <ActivityPanel commercialId={commercial.id} onViewPdf={onViewPdf} />
            </div>
          )}
        </>
      ) : (
        <ContactSidebarPanel searchQuery={searchQuery ?? ''} />
      )}
    </div>
  );

};

export default Sidebar;
