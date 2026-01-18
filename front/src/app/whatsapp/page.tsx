'use client';

import React, { useCallback, useEffect } from 'react';
import { Phone } from 'lucide-react';
import Sidebar from '@/components/sidebar/Sidebar';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatMessages from '@/components/chat/ChatMessages';
import ChatInput from '@/components/chat/ChatInput';
import { useAuth } from '@/contexts/AuthProvider';
import { useConversations } from '@/hooks/useConversations'; // Utilisez le hook refactoré
import { useRouter } from 'next/navigation';

const WhatsAppPage = () => {
  const { user, initialized, logout } = useAuth();
  const router = useRouter();
  
  // Utilisez le hook refactoré
  const {
    conversations,
    messages,
    selectedConversationId,
    isLoading,
    error,
    isConnected,
    selectConversation,
    sendMessage,
  } = useConversations();

  // Protection de route
  useEffect(() => {
    if (initialized && !user) {
      router.replace("/login");
    }
  }, [initialized, user, router]);

  const selectedConversation = conversations.find(
    (c) => c.chat_id === selectedConversationId
  );

  // Envoyer un message
  const handleSendMessage = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage]
  );

  if (!user || !initialized) {
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
        selectedConversationId={selectedConversationId}
        isConnected={isConnected}
        onSearchChange={() => {}}
        onSelectConversation={selectConversation}
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
              isConnected={isConnected}
              disabled={isLoading}
            />

            {/* Debug panel */}
            {error && (
              <div className="bg-red-50 border-t border-red-200 p-3">
                <div className="flex justify-between items-center">
                  <span className="text-red-600 text-sm">{error}</span>
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