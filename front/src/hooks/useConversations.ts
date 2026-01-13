"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { Conversation, Message } from '@/types/chat';
import { useWebSocket } from './useWebSocket';
import { useAuth } from './useAuth';

export const useConversations = () => {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  
  const { commercial } = useAuth();
  const { 
    isConnected, 
    sendMessage: sendWebSocketMessage, 
    joinConversation, 
    leaveConversation,
    loadConversation,
    loadMessages: loadMessagesWS,
    conversations,
    setConversations,
    messages,
    setMessages,
    setSelectedConversation: setSelectedConvWS,
    reconnect,
    selectedConversationId
  } = useWebSocket(commercial);
  
  // Référence pour suivre le dernier chargement
  const lastLoadRef = useRef<string | null>(null);
  const joiningRef = useRef<boolean>(false);

  // Effet pour charger les conversations au démarrage
  useEffect(() => {
    if (isConnected && commercial && conversations.length === 0) {
      loadConversations(commercial.id);
    }
  }, [isConnected, commercial, conversations.length]);

  // Effet pour gérer le changement de conversation
  useEffect(() => {
    const handleConversationSwitch = async () => {
      if (!selectedConversation || !isConnected) return;
      
      const conversationId = selectedConversation.chat_id;
      
      // Éviter les doublons de chargement
      if (lastLoadRef.current === conversationId || joiningRef.current) {
        return;
      }
      
      console.log(`🔄 Changement vers conversation: ${conversationId}`);
      
      joiningRef.current = true;
      lastLoadRef.current = conversationId;
      setIsLoadingMessages(true);
      
      try {
        // 1. Mettre à jour l'état WebSocket
        setSelectedConvWS(conversationId);
        
        // 2. Vider les messages précédents
        setMessages([]);
        
        // 3. Joindre la conversation
        const joined = joinConversation(conversationId);
        if (!joined) {
          throw new Error('Impossible de rejoindre la conversation');
        }
        
        // 4. Attendre un court instant pour la synchronisation WebSocket
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 5. Charger les messages
        loadMessagesWS(conversationId);
        
        // 6. Mettre à jour le compteur non lus
        setConversations(prev => 
          prev.map(c => 
            c.chat_id === conversationId 
              ? { ...c, unreadCount: 0 } 
              : c
          )
        );
        
      } catch (err) {
        console.error('Erreur lors du changement de conversation:', err);
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        joiningRef.current = false;
        setTimeout(() => setIsLoadingMessages(false), 300);
      }
    };
    
    handleConversationSwitch();
  }, [selectedConversation, isConnected, joinConversation, loadMessagesWS, setConversations, setMessages, setSelectedConvWS]);

  // Nettoyage quand on quitte
  useEffect(() => {
    return () => {
      if (selectedConversation && isConnected) {
        leaveConversation(selectedConversation.chat_id);
      }
    };
  }, [selectedConversation, isConnected, leaveConversation]);

  // Charger les conversations
  const loadConversations = useCallback(async (commercialId?: string) => {
    setLoading(true);
    setError(null);
    
    const targetCommercialId = commercialId || commercial?.id;
    
    if (!targetCommercialId) {
      setError('Commercial ID manquant');
      setLoading(false);
      return;
    }

    try {
      if (isConnected) {
        loadConversation(targetCommercialId);
      } else {
        throw new Error('WebSocket non connecté');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement des conversations';
      setError(errorMessage);
      console.error('Erreur loadConversations:', err);
    } finally {
      setLoading(false);
    }
  }, [commercial?.id, isConnected, loadConversation]);

  // Charger les messages d'une conversation
  const loadMessages = useCallback(async (conversationId: string) => {
    if (!isConnected) {
      setError('WebSocket non connecté');
      return;
    }
    
    setIsLoadingMessages(true);
    
    try {
      loadMessagesWS(conversationId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement des messages';
      setError(errorMessage);
      console.error('Erreur loadMessages:', err);
    } finally {
      setTimeout(() => setIsLoadingMessages(false), 300);
    }
  }, [isConnected, loadMessagesWS]);

  // Sélectionner une conversation
  const selectConversation = useCallback((conversation: Conversation) => {
    // Réinitialiser le dernier chargement si c'est une nouvelle conversation
    if (selectedConversation?.chat_id !== conversation.chat_id) {
      lastLoadRef.current = null;
    }
    
    // Mettre à jour l'état
    setSelectedConversation(conversation);
    setError(null);
  }, [selectedConversation]);

  // Envoyer un message
  const sendMessage = useCallback(async (
    conversationId: string, 
    messageData: Partial<Message>
  ): Promise<Message | null> => {
    setError(null);
    
    if (!commercial || !isConnected) {
      setError('Non connecté ou non authentifié');
      return null;
    }

    // Préparer le message complet
    const fullMessage: Message = {
      id: `temp_${Date.now()}`,
      text: messageData.text || '',
      timestamp: new Date(),
      from: 'commercial',
      status: 'sending',
      direction: 'OUT',
      sender_name: commercial.name || 'Agent',
      ...messageData,
    };

    // Optimistic UI update
    setMessages(prev => [...prev, fullMessage]);
    
    // Envoyer via WebSocket
    const webSocketMessage = {
      conversationId,
      content: fullMessage.text,
      author: commercial.id,
      chat_id: conversationId
    };

    const success = sendWebSocketMessage(webSocketMessage);
    
    if (!success) {
      setError('Échec de l\'envoi via WebSocket');
      setMessages(prev => 
        prev.map(msg => 
          msg.id === fullMessage.id 
            ? { ...msg, status: 'error' } 
            : msg
        )
      );
      return null;
    }

    // Mettre à jour la conversation
    setConversations(prev => 
      prev.map(conv => 
        conv.chat_id === conversationId 
          ? {
              ...conv,
              lastMessage: {
                text: fullMessage.text,
                timestamp: fullMessage.timestamp,
                author: 'agent'
              }
            } 
          : conv
      )
    );
    
    return fullMessage;
  }, [commercial, isConnected, sendWebSocketMessage, setMessages, setConversations]);

  return {
    // State
    conversations,
    selectedConversation,
    messages,
    searchTerm,
    filteredConversations: conversations.filter((conv: Conversation) =>
      conv.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.clientPhone?.includes(searchTerm) ||
      conv.name?.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    loading,
    isLoadingMessages,
    error,
    isWebSocketConnected: isConnected,
    
    // Setters
    setSearchTerm,
    setMessages,
    setConversations,
    setSelectedConversation,
    
    // Actions
    loadConversations,
    loadMessages,
    sendMessage,
    selectConversation,
    reconnectWebSocket: reconnect,
    clearError: useCallback(() => setError(null), []),
  };
};