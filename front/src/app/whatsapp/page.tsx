'use client';

import React, { useCallback, useEffect } from 'react';
import { Phone } from 'lucide-react';
import Sidebar from '@/components/sidebar/Sidebar';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatMessages from '@/components/chat/ChatMessages';
import ChatInput from '@/components/chat/ChatInput';
import { useAuth } from '@/hooks/useAuth';
import { useConversations } from '@/hooks/useConversations';
import { Conversation } from '@/types/chat';
import { useRouter } from 'next/navigation';

const WhatsAppPage = () => {
  const { commercial, initialized, logout } = useAuth();
  const router = useRouter();

  const {
    conversations,
    selectedConversation,
    messages,
    isLoadingMessages,
    isWebSocketConnected,
    error,
    selectConversation,
    sendMessage,
    reconnectWebSocket,
  } = useConversations();

  // Route protection
  useEffect(() => {
    if (initialized && !commercial) {
      router.replace('/login');
    }
  }, [initialized, commercial, router]);

  const handleSelectConversation = useCallback(
    (conversation: Conversation) => {
      selectConversation(conversation);
    },
    [selectConversation],
  );

  const handleSendMessage = useCallback(
    (text: string) => {
      if (!selectedConversation || !commercial) {
        console.error('Cannot send message: missing conversation or commercial.');
        return;
      }
      sendMessage(text);
    },
    [selectedConversation, commercial, sendMessage],
  );

  if (!commercial || !initialized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        commercial={commercial}
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
            
            {isLoadingMessages ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
                  <p className="text-gray-500">Chargement des messages...</p>
                </div>
              </div>
            ) : (
              <ChatMessages messages={messages} />
            )}
            
            <ChatInput
              onSendMessage={handleSendMessage}
              isConnected={isWebSocketConnected}
              disabled={isLoadingMessages}
            />
            
            {/* Debug panel */}
            {error && (
              <div className="bg-red-50 border-t border-red-200 p-3">
                <div className="flex justify-between items-center">
                  <span className="text-red-600 text-sm">{error}</span>
                  <button
                    onClick={reconnectWebSocket}
                    className="text-sm text-green-600 hover:text-green-800"
                  >
                    Reconnecter
                  </button>
                </div>
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