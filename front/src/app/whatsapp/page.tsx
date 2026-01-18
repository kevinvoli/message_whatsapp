'use client';

import React, { useCallback, useEffect } from 'react';
import { Phone } from 'lucide-react';
import Sidebar from '@/components/sidebar/Sidebar';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatMessages from '@/components/chat/ChatMessages';
import ChatInput from '@/components/chat/ChatInput';
import { useAuth } from '@/contexts/AuthProvider';
import { useRouter } from 'next/navigation';
import { useChatStore } from '@/stores/useChatStore';
import { useSocket } from '@/contexts/SocketProvider';

/**
 * Page principale de l'interface de messagerie.
 * Ce composant orchestre l'affichage de la barre latérale, de l'en-tête,
 * de la liste des messages et du champ de saisie.
 * Il récupère son état depuis le `useChatStore` et interagit avec le WebSocket
 * via le hook `useSocket`.
 */
const WhatsAppPage = () => {
  const { user, initialized, logout } = useAuth();
  const router = useRouter();
  const { socket, isConnected } = useSocket();

  // Récupération de l'état depuis le store Zustand
  const {
    conversations,
    selectedConversation,
    messages,
    isLoading,
    error,
    selectConversation,
  } = useChatStore((state) => ({
    conversations: state.conversations,
    selectedConversation: state.selectedConversation,
    messages: state.messages,
    isLoading: state.isLoading,
    error: state.error,
    selectConversation: state.selectConversation,
  }));

  // Protection de la route : redirige vers /login si l'utilisateur n'est pas authentifié
  useEffect(() => {
    if (initialized && !user) {
      router.replace('/login');
    }
  }, [initialized, user, router]);

  // Gérer la sélection d'une conversation dans la barre latérale
  const handleSelectConversation = useCallback((conversation: any) => {
    console.log("🎯 Sélection de la conversation:", conversation.clientName);
    selectConversation(conversation);
    if (socket && conversation) {
      // Demander les messages pour la conversation sélectionnée
      socket.emit('conversation:join', { chatId: conversation.chatId });
    }
  }, [selectConversation, socket]);

  // Gérer l'envoi d'un message via le champ de saisie
  const handleSendMessage = useCallback(async (text: string) => {
    if (!selectedConversation || !user || !socket) {
      console.error("❌ Impossible d'envoyer: informations manquantes", {
        selectedConversation, user, socket
      });
      return;
    }

    // Émission de l'événement WebSocket pour envoyer le message
    socket.emit('message:send', {
      chatId: selectedConversation.chatId,
      text,
      from: selectedConversation.clientPhone, // Ce champ pourrait être géré côté backend
      commercialId: user.id,
    });
  }, [selectedConversation, user, socket]);

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
        isConnected={isConnected}
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
                  <p className="text-gray-500">Chargement des messages...</p>
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

            {/* Affiche une erreur globale si elle existe */}
            {error && (
              <div className="bg-red-50 border-t border-red-200 p-3">
                <span className="text-red-600 text-sm">{error}</span>
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