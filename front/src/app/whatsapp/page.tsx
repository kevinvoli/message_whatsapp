'use client';

import React, { useCallback, useEffect } from 'react';
import { Phone } from 'lucide-react';
import Sidebar from '@/components/sidebar/Sidebar';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatMessages from '@/components/chat/ChatMessages';
import ChatInput from '@/components/chat/ChatInput';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useConversations } from '@/hooks/useConversations';
import { useRouter } from 'next/navigation';

const WhatsAppPage = () => {
  const { commercial,initialized, logout } = useAuth();
  const router = useRouter();

  // 🔐 protection route
  useEffect(() => {
     if (!initialized) return;
    if (!commercial) {
      router.replace('/login');
    }
  }, [initialized, commercial, router]);

  const { isConnected, sendMessage } = useWebSocket(commercial);
  const {
    conversations,
    selectedConversation,
    messages,
    searchTerm,
    filteredConversations,
    setSearchTerm,
    loadConversations,
    selectConversation,
    setMessages
  } = useConversations();

  useEffect(() => {
    if (commercial) {
      loadConversations(commercial.id);
    }
  }, [commercial]);

  const handleSendMessage = useCallback((text: string) => {
    if (!selectedConversation || !commercial) return;

    const newMsg = {
      id: 'msg_temp_' + Date.now(),
      text,
      timestamp: new Date(),
      from: 'commercial' as const,
      status: 'sending' as const
    };

    setMessages(prev => [...prev, newMsg]);

    sendMessage({
      type: 'send_message',
      conversationId: selectedConversation.id,
      clientPhone: selectedConversation.clientPhone,
      text,
      commercialId: commercial.id,
      timestamp: new Date()
    });
  }, [selectedConversation, commercial, sendMessage,
  setMessages,]);

  if (!commercial) return null;
  if (!initialized) {
  return null; // ou un loader
} // évite flicker

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar
        commercial={commercial}
        conversations={filteredConversations}
        searchTerm={searchTerm}
        selectedConversation={selectedConversation}
        isConnected={isConnected}
        onSearchChange={setSearchTerm}
        onSelectConversation={selectConversation}
        onLogout={logout}
      />

      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            <ChatHeader conversation={selectedConversation} />
            <ChatMessages messages={messages} />
            <ChatInput
              onSendMessage={handleSendMessage}
              isConnected={isConnected}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Phone className="w-20 h-20 mx-auto mb-4 opacity-50" />
              <p className="text-xl font-semibold">
                Sélectionnez une conversation
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppPage;
