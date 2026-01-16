// src/hooks/useConversations.ts
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Conversation, 
  Message, 
  createMessage, 
  transformToMessage,
  createConversation,
  isValidMessage
} from '@/types/chat';
import { useWebSocket } from './useWebSocket';
import { useAuth } from '@/contexts/AuthProvider';
import { ConversationUpdatedPayload, NotificationPayload } from '@/types/events';

export const useConversations = () => {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  
  const { user } = useAuth();
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
    selectedConversationId,
    on
  } = useWebSocket(user);
  
  // Référence pour suivre le dernier chargement
  const lastLoadRef = useRef<string | null>(null);
  const joiningRef = useRef<boolean>(false);

  // Effet pour charger les conversations au démarrage
  useEffect(() => {
    if (isConnected && user && conversations.length === 0) {
      console.log("📋 Chargement initial des conversations");
      loadConversation(user.id);
    }
  }, [isConnected, user, conversations.length, loadConversation]);

  // Effet pour s'abonner aux événements WebSocket globaux
  useEffect(() => {
    if (!on) return;

    const cleanupConversationUpdated = on('conversation:updated', (data: ConversationUpdatedPayload) => {
      console.log('🔄 Conversation mise à jour (via on):', data);
      setConversations(prev =>
        prev.map(c =>
          c.chat_id === data.chat_id
            ? { ...c, lastMessage: data.lastMessage, unreadCount: data.unread_count }
            : c
        )
      );
    });

    const cleanupNotification = on('notification', (data: NotificationPayload) => {
      console.log('🔔 Notification reçue (via on):', data);
      // Ici, on pourrait intégrer un système de notifications
    });

    return () => {
      cleanupConversationUpdated();
      cleanupNotification();
    };
  }, [on, setConversations]);

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
              ? { 
                  ...c, 
                  unreadCount: 0,
                  // Mettre à jour le timestamp de dernière activité
                  lastMessage: {
                    ...c.lastMessage,
                    timestamp: new Date()
                  }
                } 
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
    
    const targetCommercialId = commercialId || user?.id;
    
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
  }, [user?.id, isConnected, loadConversation]);

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
    
    console.log(`🎯 Conversation sélectionnée: ${conversation.clientName} (${conversation.chat_id})`);
  }, [selectedConversation]);

  // Ajouter un message à une conversation
const addMessageToConversation = useCallback((conversationId: string, message: Message) => {
  setConversations(prev => 
    prev.map(conv => 
      conv.chat_id === conversationId 
        ? {
            ...conv,
            lastMessage: {
              text: message.text,
              timestamp: message.timestamp,
              author: message.from === 'commercial' ? 'agent' : 'client'
            },
            unreadCount: selectedConversationId === conversationId 
              ? conv.unreadCount 
              : conv.unreadCount + 1,
            messages: [...(conv.messages || []), message] // Assurer que conv.messages est un tableau
          } 
        : conv
    )
  );
}, [selectedConversationId]);

  // Envoyer un message
  const sendMessage = useCallback(async (
    conversationId: string, 
    messageData: Partial<Message>
  ): Promise<Message | null> => {
    setError(null);
    
    if (!user || !isConnected) {
      setError('Non connecté ou non authentifié');
      return null;
    }

    // Utiliser createMessage pour garantir un message valide
    const fullMessage = createMessage({
      id: `temp_${Date.now()}`,
      text: messageData.text || '',
      timestamp: new Date(),
      from: messageData.sender_phone,
      status: 'sending',
      direction: 'OUT',
      sender_name: user.name || 'Agent',
      from_me: true, // Toujours true pour les messages de l'agent
      sender_phone: user.email || '', // Optionnel: utiliser email comme sender_phone
      ...messageData,
    });

    // Vérifier que le message est valide
    // if (!isValidMessage(fullMessage)) {
    //   setError('Message invalide');
    //   return null;
    // }

    console.log(`📤 Envoi message: "${fullMessage.text.substring(0, 50)}..."`);

    // Optimistic UI update
    setMessages(prev => [...prev, fullMessage]);
    addMessageToConversation(conversationId, fullMessage);
    
    // Envoyer via WebSocket
    const success = sendWebSocketMessage({
      conversationId,
      text: fullMessage.text,
      author: user.id,
      chat_id: conversationId
    });
    
    if (!success) {
      setError('Échec de l\'envoi via WebSocket');
      // Marquer le message comme erreur
      setMessages(prev => 
        prev.map(msg => 
          msg.id === fullMessage.id 
            ? { ...msg, status: 'error' } 
            : msg
        )
      );
      return null;
    }

    return fullMessage;
  }, [user, isConnected, sendWebSocketMessage, setMessages, addMessageToConversation]);

  // Gérer les messages entrants
  const handleIncomingMessage = useCallback((conversationId: string, rawMessage: any) => {
    try {
      const message = transformToMessage(rawMessage);
      
      if (!isValidMessage(message)) {
        console.error('Message invalide reçu:', rawMessage);
        return;
      }

      // Si c'est la conversation actuelle, ajouter aux messages
      if (selectedConversationId === conversationId) {
        setMessages(prev => {
          // Éviter les doublons
          const exists = prev.some(m => m.id === message.id);
          if (!exists) {
            return [...prev, message];
          }
          return prev;
        });
      }

      // Mettre à jour la conversation
      addMessageToConversation(conversationId, message);
      
      console.log(`📩 Message entrant dans ${conversationId}: "${message.text.substring(0, 50)}..."`);
    } catch (err) {
      console.error('Erreur lors du traitement du message entrant:', err);
    }
  }, [selectedConversationId, addMessageToConversation, setMessages]);

  // Filtrer les conversations
  const filteredConversations = conversations.filter((conv: Conversation) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      conv.clientName?.toLowerCase().includes(searchLower) ||
      conv.clientPhone?.includes(searchTerm) ||
      conv.name?.toLowerCase().includes(searchLower) ||
      conv.lastMessage.text?.toLowerCase().includes(searchLower)
    );
  });

  // Trier les conversations par date du dernier message
  const sortedConversations = [...filteredConversations].sort((a, b) => {
    return new Date(b.lastMessage.timestamp).getTime() - new Date(a.lastMessage.timestamp).getTime();
  });

  return {
    // State
    conversations: sortedConversations,
    selectedConversation,
    messages,
    searchTerm,
    filteredConversations: sortedConversations,
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
    handleIncomingMessage,
    reconnectWebSocket: reconnect,
    clearError: useCallback(() => setError(null), []),
    
    // Utilitaires
    hasConversations: conversations.length > 0,
    unreadCount: conversations.reduce((total, conv) => total + conv.unreadCount, 0),
    selectedConversationMessages: messages,
  };
};