import { useState, useCallback, useEffect, useRef } from 'react';
import { Conversation, Message, WebSocketMessage } from '@/types/chat';
import { useWebSocket } from './useWebSocket';
import { useAuth } from './useAuth';

interface MessagesLoadedMessage {
  type: 'messages_loaded';
  messages: Message[];
}

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000/';

export const useConversations = () => {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { commercial, token } = useAuth();
  const { 
    isConnected, 
    sendMessage: sendWebSocketMessage, 
    joinConversation, 
    leaveConversation,
    loadConversation,
    loadMessages: loadMessagesWS,
    lastMessage,
    conversations,
    setConversations,
    reconnect 
  } = useWebSocket(commercial);
  
  // Référence pour éviter les cycles de re-render
  const conversationsRef = useRef(conversations);
  const messagesRef = useRef(messages);
  // Mettre à jour les références
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);


  useEffect(() => {
    if (!lastMessage) return;

    if ((lastMessage as unknown as MessagesLoadedMessage).type === 'messages_loaded' && (lastMessage as unknown as MessagesLoadedMessage).messages) {
      setMessages((lastMessage as unknown as MessagesLoadedMessage).messages);
      return;
    }

    const { conversationId, message } = lastMessage;
    
    console.log('🔄 Traitement du message WebSocket:', lastMessage);
    console.log('🔄  du message WebSocket:', conversations);
    
    // Mettre à jour les messages si c'est la conversation sélectionnée
    if (selectedConversation?.id === conversationId && message !== undefined) {
      setMessages(prev => [...prev, message]);
    }
    
    // Mettre à jour la conversation dans la liste
    setConversations(prev => 
      prev.map(conv => {
        if (conv.id === conversationId && message !== undefined) {
          return {
            ...conv,
            lastMessage: message,
            unreadCount: conv.id === selectedConversation?.id ? 0 : (conv.unreadCount || 0) + 1,
          };
        }
        return conv;
      })
    );
  }, [lastMessage, selectedConversation, conversations, setConversations]);

  const getAuthToken = useCallback((): string | null => {
    return token || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
  }, [token]);

  // READ: Récupérer toutes les conversations
  const loadConversations = useCallback(async (commercialId?: string) => {
    console.log("les conversation", conversationsRef.current);
    
    setLoading(true);
    setError(null);
    
    const authToken = getAuthToken();
    if (!authToken) {
      setError('Non authentifié');
      setLoading(false);
      return;
    }

    try {
      loadConversation(commercialId || commercial?.id || '')

     
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement des conversations';
      setError(errorMessage);
      console.error('Erreur loadConversations:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [getAuthToken, commercial?.id, loadConversation]);

  // READ: Charger les messages d'une conversation
  const loadMessages = useCallback(async (conversationId: string) => {
    setLoading(true);
    setError(null);
    
    const authToken = getAuthToken();
    if (!authToken) {
      setError('Non authentifié');
      setLoading(false);
      return [];
    }

    try {
      const response = await fetch(`${API_BASE_URL}/chat/${conversationId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      const data: Message[] = await response.json();
      setMessages(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement des messages';
      setError(errorMessage);
      console.error('Erreur loadMessages:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [getAuthToken]);

  // CREATE: Envoyer un message (WebSocket + backup HTTP)
  const sendMessage = useCallback(async (
    conversationId: string, 
    messageData: Partial<Message>
  ): Promise<Message | null> => {
    setError(null);
    
    // Préparer le message complet
    const fullMessage: Message = {
      id: `temp_${Date.now()}`,
      text: messageData.text || '',
      timestamp: new Date(),
      from: messageData.from || 'commercial',
      status: 'sending',
      ...messageData,
    };

    // Optimistic UI update
    setMessages(prev => [...prev, fullMessage]);
    
    // Tenter d'envoyer via WebSocket
    if (isConnected) {
      const webSocketMessage: WebSocketMessage = {
        conversationId,
        message: fullMessage,
        type: 'send_message',
      };

      const webSocketSuccess = sendWebSocketMessage(webSocketMessage);
      
      if (webSocketSuccess) {
        // Mettre à jour le statut du message
        setTimeout(() => {
          setMessages(prev => 
            prev.map(msg => 
              msg.id === fullMessage.id 
                ? { ...msg, status: 'sent' as const } 
                : msg
            )
          );
        }, 100);
        
        return fullMessage;
      }
    }

    // Fallback: Envoyer via HTTP
    console.log('🔄 WebSocket non disponible, envoi via HTTP...');
    const authToken = getAuthToken();
    if (!authToken) {
      setError('Non authentifié');
      return null;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/chat/${conversationId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageData),
      });

      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      const serverMessage: Message = await response.json();
      
      // Remplacer le message temporaire par celui du serveur
      setMessages(prev => 
        prev.map(msg => 
          msg.id === fullMessage.id ? { ...serverMessage, status: 'sent' as const } : msg
        )
      );
      
      // Mettre à jour la conversation (simplifié)
      setConversations(prev => 
        prev.map(conv => 
          conv.id === conversationId 
            ? { ...conv, lastMessage: serverMessage } 
            : conv
        )
      );
      
      return serverMessage;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors de l\'envoi du message';
      setError(errorMessage);
      
      // Marquer le message comme erreur
      setMessages(prev => 
        prev.map(msg => 
          msg.id === fullMessage.id 
            ? { ...msg, status: 'error' as const } 
            : msg
        )
      );
      
      console.error('Erreur sendMessage:', err);
      return null;
    }
  }, [isConnected, sendWebSocketMessage, getAuthToken, setConversations]);

  // Sélectionner une conversation avec gestion WebSocket
  const selectConversation = useCallback(async (conv: Conversation) => {
    // Quitter la conversation précédente si elle existe
    if (selectedConversation) {
      leaveConversation(selectedConversation.id);
    }
    
    // Mettre à jour l'état local
    setSelectedConversation(conv);
    
    // Réinitialiser le compteur non lus
    setConversations(prev => 
      prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c)
    );
    
    // Mettre à jour sur le serveur
    await leaveConversation(conv.id);
    
    // Charger les messages
    if (isConnected) {
      loadMessagesWS(conv.id);
    }
    
    // Rejoindre la conversation via WebSocket
    if (isConnected) {
      joinConversation(conv.id);
    }
  }, [selectedConversation, leaveConversation, isConnected, joinConversation, loadMessagesWS, setConversations]);

 
  useEffect(() => {
    if (selectedConversation && isConnected) {
      joinConversation(selectedConversation.id);
    }
    
    return () => {
      if (selectedConversation) {
        leaveConversation(selectedConversation.id);
      }
    };
  }, [selectedConversation, isConnected, joinConversation, leaveConversation,setConversations]);

  // Effet pour surveiller la connexion WebSocket
  useEffect(() => {
    if (!isConnected && commercial) {
      console.log('⚠️ WebSocket déconnecté, tentative de reconnexion...');
      // Vous pourriez implémenter une logique de reconnexion ici
    }
  }, [isConnected, commercial]);

  // Charger les conversations au chargement de la page via WebSocket
  useEffect(() => {
    if (isConnected && commercial) {
      loadConversation(commercial.id);
    }
  }, [isConnected, commercial, loadConversation]);

  // Sélectionner automatiquement la première conversation si aucune n'est sélectionnée
  useEffect(() => {
    if (conversations.length > 0 && !selectedConversation) {
      selectConversation(conversations[0]);
    }
  }, [conversations, selectedConversation, selectConversation]);

  return {
    // State
    conversations,
    selectedConversation,
    messages,
    searchTerm,
    filteredConversations: conversations.filter(conv =>
      conv.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.clientPhone?.includes(searchTerm)
    ),
    loading,
    error,
    isWebSocketConnected: isConnected,
    
    // Setters
    setSearchTerm,
    setMessages,
    setConversations,
    setSelectedConversation,
    
    // Conversations CRUD
    loadConversations,
    
    // Messages
    loadMessages,
    sendMessage,
    
    // WebSocket
    reconnectWebSocket: reconnect,
    
    // Actions
    selectConversation,
    clearError: useCallback(() => setError(null), []),
  };
};