'use client';

import React, { useCallback, useEffect } from 'react';
import { Phone } from 'lucide-react';
import Sidebar from '@/components/sidebar/Sidebar';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatMessages from '@/components/chat/ChatMessages';
import ChatInput from '@/components/chat/ChatInput';
import { useAuth } from '@/contexts/AuthProvider';
import { useChatStore } from '@/store/chatStore';
import { useSocket } from '@/contexts/SocketProvider';
import { useRouter } from 'next/navigation';
import { Conversation } from '@/types/chat';

const WhatsAppPage = () => {
  const { user, initialized, logout } = useAuth();
  const router = useRouter();
  const {
    conversations,
    selectedConversation,
    messages,
    isLoading,
    error,
    selectConversation,
    sendMessage,
    loadConversations,
  } = useChatStore();
  const { isConnected: isWebSocketConnected } = useSocket();


  
  // Protection de route
  useEffect(() => {
    if (initialized && !user) {
      router.replace('/login');
    }
  }, [initialized, user, router]);

    // Gérer la sélection d'une conversation
    const handleSelectConversation = useCallback((conversation: Conversation) => {
        console.log("🎯 Sélection de la conversation:", conversation.clientName);
        selectConversation(conversation.chat_id);
      }, [selectConversation]);

  // Envoyer un message
  const handleSendMessage = useCallback(async (text: string) => {

    if (!selectedConversation) {
      console.error('❌ Impossible d\'envoyer: aucune conversation sélectionnée');
      return;
    }
    console.log("conversation selectionne",selectedConversation);
    
    sendMessage(text);
  }, [selectedConversation, sendMessage]);

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
        conversations={conversations}
        searchTerm=""
        selectedConversation={selectedConversation}
        isConnected={isWebSocketConnected}
        onSearchChange={() => {}}
        onSelectConversation={handleSelectConversation}
        onLogout={logout}
      />

      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            <ChatHeader conversation={selectedConversation} />

            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
                  <p className="text-gray-500">Chargement...</p>
                </div>
              </div>
            ) : (
              <ChatMessages messages={messages} />
            )}
            
            <ChatInput
              onSendMessage={handleSendMessage}
              isConnected={isWebSocketConnected}
              disabled={isLoading}
            />

            {/* Affiche une erreur s'il y en a une */}
            {error && (
              <div className="bg-red-100 border-t border-red-200 p-2 text-center">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Phone className="w-20 h-20 mx-auto mb-4 opacity-50" />
              <p className="text-xl font-semibold">
                {conversations.length === 0 
                  ? 'Aucune conversation disponible' 
                  : 'Sélectionnez une conversation'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppPage;