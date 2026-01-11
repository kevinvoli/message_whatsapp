'use client'

import React, { useCallback } from 'react';
import { Phone } from 'lucide-react';
import Sidebar from '@/components/sidebar/Sidebar';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatMessages from '@/components/chat/ChatMessages';
import ChatInput from '@/components/chat/ChatInput';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useConversations } from '@/hooks/useConversations';
import { LoginFormData } from '@/types/chat';
import LoginForm from '@/components/auth/loginForm';

const WhatsAppPage = () => {
  const { commercial, login, logout } = useAuth();
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

  const handleLogin = async (formData: LoginFormData) => {
    try {
      const commercial = await login(formData.email, formData.password);
      loadConversations(commercial.id);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleSendMessage = useCallback((text: string) => {
    if (!selectedConversation || !commercial) return;

    const message = {
      type: 'send_message' as const,
      conversationId: selectedConversation.id,
      clientPhone: selectedConversation.clientPhone,
      text: text,
      commercialId: commercial.id,
      timestamp: new Date()
    };

    // Optimistic update
    const newMsg = {
      id: 'msg_temp_' + Date.now(),
      text: text,
      timestamp: new Date(),
      from: 'commercial' as const,
      status: 'sending' as const
    };
    
    setMessages(prev => [...prev, newMsg]);
    
    // Envoyer via WebSocket
    sendMessage(message);
  }, [selectedConversation, commercial, sendMessage, setMessages]);

  if (!commercial) {
    return <LoginForm onLogin={handleLogin} />;
  }

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
              disabled={!selectedConversation}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Phone className="w-20 h-20 mx-auto mb-4 opacity-50" />
              <p className="text-xl font-semibold">Sélectionnez une conversation</p>
              <p className="text-sm mt-2">Choisissez une conversation dans la liste pour commencer</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppPage;