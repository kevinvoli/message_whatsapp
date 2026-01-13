import React from 'react';
import { Search, LogOut, Wifi, WifiOff, User } from 'lucide-react';
import { Commercial, Conversation } from '@/types/chat';
import ConversationItem from './ConversationItem';

interface SidebarProps {
  commercial: Commercial;
  conversations: Conversation[];
  searchTerm: string;
  selectedConversation: Conversation | null;
  isConnected: boolean;
  onSearchChange: (term: string) => void;
  onSelectConversation: (conv: Conversation) => void;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  commercial,
  conversations,
  searchTerm,
  selectedConversation,
  isConnected,
  onSearchChange,
  onSelectConversation,
  onLogout
}) => {
  return (
    <div className="w-96 bg-white border-r border-gray-200 flex flex-col">
      <div className="bg-green-600 text-white p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-700 rounded-full flex items-center justify-center">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-semibold">{commercial.name}</h2>
              <div className="flex items-center gap-1 text-xs">
                {isConnected ? (
                  <>
                    <Wifi className="w-3 h-3" />
                    <span>Connecté</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3" />
                    <span>Déconnecté</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="p-2 hover:bg-green-700 rounded-full transition-colors"
            title="Déconnexion"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-green-200" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher une conversation..."
            className="w-full rounded-lg bg-green-700 py-2 pl-10 pr-4 text-white placeholder-green-200 focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4">
            <User className="w-16 h-16 mb-2" />
            <p className="text-center">Aucune conversation</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isSelected={selectedConversation?.id === conv.id}
              onClick={() => onSelectConversation(conv)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default Sidebar;