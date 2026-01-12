'use client';

import React, { useCallback, useEffect, useState } from 'react';
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
  const { commercial, initialized, logout } = useAuth();
  const router = useRouter();
  const [isSending, setIsSending] = useState(false);

  // 🔐 protection route
  useEffect(() => {
    if (!initialized) return;
    if (!commercial) {
      router.replace('/login');
    }
  }, [initialized, commercial, router]);

  const { 
    isConnected, 
    sendMessage: sendWebSocketMessage,
    lastMessage,
    joinConversation,
    leaveConversation,
    reconnect: reconnectWebSocket,
    error: webSocketError
  } = useWebSocket(commercial);
  
  const {
    conversations,
    selectedConversation,
    messages,
    searchTerm,
    filteredConversations,
    setSearchTerm,
    loadConversations,
    selectConversation,
    setMessages,
    sendMessage: sendHTTPMessage,
    loadMessages,
    updateConversation,
    deleteConversation,
    createConversation,
    loading: conversationsLoading,
    error: conversationsError,
    clearError
  } = useConversations();

  useEffect(() => {
    if (commercial) {
      loadConversations(commercial.id);
    }
  }, [commercial, loadConversations]);

  // Gérer les messages WebSocket
  useEffect(() => {
    if (lastMessage && selectedConversation?.id === lastMessage.conversationId) {
      setMessages(prev => {
        const exists = prev.some(m => m.id === lastMessage.message.id);
        if (exists) {
          return prev.map(m => 
            m.id === lastMessage.message.id ? lastMessage.message : m
          );
        }
        return [...prev, lastMessage.message];
      });
    }
  }, [lastMessage, selectedConversation, setMessages]);

  // Gestion WebSocket des conversations
  useEffect(() => {
    if (selectedConversation && isConnected) {
      joinConversation(selectedConversation.id);
    }
    
    return () => {
      if (selectedConversation) {
        leaveConversation(selectedConversation.id);
      }
    };
  }, [selectedConversation, isConnected, joinConversation, leaveConversation]);

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

    // Essayer WebSocket d'abord
    if (isConnected) {
      const success = sendWebSocketMessage({
        conversationId: selectedConversation.id,
        message: newMsg
      });
      
      if (success) {
        // Mettre à jour le statut après un délai
        setTimeout(() => {
          setMessages(prev => 
            prev.map(msg => 
              msg.id === newMsg.id 
                ? { ...msg, status: 'sent' }
                : msg
            )
          );
        }, 500);
        return;
      }
    }

    // Fallback HTTP
    sendHTTPMessage(selectedConversation.id, {
      text,
      from: 'commercial',
      timestamp: new Date()
    }).then(result => {
      if (result) {
        setMessages(prev => 
          prev.map(msg => 
            msg.id === newMsg.id 
              ? { ...result, status: 'sent' }
              : msg
          )
        );
      }
    }).catch(() => {
      setMessages(prev => 
        prev.map(msg => 
          msg.id === newMsg.id 
            ? { ...msg, status: 'error' }
            : msg
        )
      );
    });
  }, [selectedConversation, commercial, isConnected, sendWebSocketMessage, sendHTTPMessage, setMessages]);

  if (!commercial || !initialized) return null;

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
              disabled={isSending}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Phone className="w-20 h-20 mx-auto mb-4 opacity-50" />
              <p className="text-xl font-semibold">
                Sélectionnez une conversation
              </p>
              {webSocketError && (
                <p className="text-red-500 text-sm mt-2">{webSocketError}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppPage;