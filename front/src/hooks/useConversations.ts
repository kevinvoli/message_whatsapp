import { useState, useCallback } from 'react';
import { Conversation, Message } from '@/types/chat';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000/';

export const useConversations = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Récupérer le token depuis localStorage
  const getAuthToken = (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('token');
  };

  // CRUD Méthodes pour les Conversations

  // READ: Récupérer toutes les conversations
  const loadConversations = useCallback(async (commercialId?: string) => {
    setLoading(true);
    setError(null);
    
    const token = getAuthToken();
    if (!token) {
      setError('Non authentifié');
      setLoading(false);
      return;
    }

    try {
      const url = commercialId 
        ? `${API_BASE_URL}conversations/commercial/${commercialId}`
        : `${API_BASE_URL}conversations`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      const data: Conversation[] = await response.json();
      setConversations(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement des conversations';
      setError(errorMessage);
      console.error('Erreur loadConversations:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // READ: Récupérer une conversation spécifique
  const getConversation = useCallback(async (conversationId: string) => {
    setLoading(true);
    setError(null);
    
    const token = getAuthToken();
    if (!token) {
      setError('Non authentifié');
      setLoading(false);
      return null;
    }

    try {
      const response = await fetch(`${API_BASE_URL}conversations/${conversationId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      const data: Conversation = await response.json();
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors de la récupération de la conversation';
      setError(errorMessage);
      console.error('Erreur getConversation:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // CREATE: Créer une nouvelle conversation
  const createConversation = useCallback(async (conversationData: Partial<Conversation>) => {
    setLoading(true);
    setError(null);
    
    const token = getAuthToken();
    if (!token) {
      setError('Non authentifié');
      setLoading(false);
      return null;
    }

    try {
      const response = await fetch(`${API_BASE_URL}conversations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(conversationData),
      });

      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      const newConversation: Conversation = await response.json();
      
      // Ajouter à la liste locale
      setConversations(prev => [...prev, newConversation]);
      
      return newConversation;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors de la création de la conversation';
      setError(errorMessage);
      console.error('Erreur createConversation:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // UPDATE: Mettre à jour une conversation
  const updateConversation = useCallback(async (conversationId: string, updateData: Partial<Conversation>) => {
    setLoading(true);
    setError(null);
    
    const token = getAuthToken();
    if (!token) {
      setError('Non authentifié');
      setLoading(false);
      return null;
    }

    try {
      const response = await fetch(`${API_BASE_URL}conversations/${conversationId}`, {
        method: 'PATCH', // ou 'PUT' selon votre API
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      const updatedConversation: Conversation = await response.json();
      
      // Mettre à jour dans la liste locale
      setConversations(prev => 
        prev.map(conv => conv.id === conversationId ? updatedConversation : conv)
      );
      
      // Mettre à jour si c'est la conversation sélectionnée
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(updatedConversation);
      }
      
      return updatedConversation;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors de la mise à jour de la conversation';
      setError(errorMessage);
      console.error('Erreur updateConversation:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [selectedConversation]);

  // DELETE: Supprimer une conversation
  const deleteConversation = useCallback(async (conversationId: string) => {
    setLoading(true);
    setError(null);
    
    const token = getAuthToken();
    if (!token) {
      setError('Non authentifié');
      setLoading(false);
      return false;
    }

    try {
      const response = await fetch(`${API_BASE_URL}conversations/${conversationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      // Retirer de la liste locale
      setConversations(prev => prev.filter(conv => conv.id !== conversationId));
      
      // Si la conversation supprimée était sélectionnée, la désélectionner
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(null);
        setMessages([]);
      }
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors de la suppression de la conversation';
      setError(errorMessage);
      console.error('Erreur deleteConversation:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [selectedConversation]);

  // Méthodes pour les Messages

  // READ: Charger les messages d'une conversation
  const loadMessages = useCallback(async (conversationId: string) => {
    setLoading(true);
    setError(null);
    
    const token = getAuthToken();
    if (!token) {
      setError('Non authentifié');
      setLoading(false);
      return [];
    }

    try {
      const response = await fetch(`${API_BASE_URL}conversations/${conversationId}/messages`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
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
  }, []);

  // CREATE: Envoyer un nouveau message
  const sendMessage = useCallback(async (conversationId: string, messageData: Partial<Message>) => {
    setLoading(true);
    setError(null);
    
    const token = getAuthToken();
    if (!token) {
      setError('Non authentifié');
      setLoading(false);
      return null;
    }

    try {
      const response = await fetch(`${API_BASE_URL}conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageData),
      });

      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      const newMessage: Message = await response.json();
      
      // Ajouter le message à la liste locale
      setMessages(prev => [...prev, newMessage]);
      
      // Mettre à jour la dernière conversation dans la liste
      const updatedConv = await getConversation(conversationId);
      if (updatedConv) {
        setConversations(prev => 
          prev.map(conv => conv.id === conversationId ? updatedConv : conv)
        );
      }
      
      return newMessage;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors de l\'envoi du message';
      setError(errorMessage);
      console.error('Erreur sendMessage:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [getConversation]);

  // Sélectionner une conversation avec chargement des messages
  const selectConversation = useCallback(async (conv: Conversation) => {
    setSelectedConversation(conv);
    
    // Réinitialiser le compteur de messages non lus localement
    setConversations(prev => 
      prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c)
    );
    
    // Optionnel: Mettre à jour sur le serveur
    await updateConversation(conv.id, { unreadCount: 0 });
    
    // Charger les messages
    await loadMessages(conv.id);
  }, [loadMessages, updateConversation]);

  // Recherche filtrée
  const filteredConversations = conversations.filter(conv =>
    conv.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.clientPhone?.includes(searchTerm)
  );

  // Réinitialiser les erreurs
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    conversations,
    selectedConversation,
    messages,
    searchTerm,
    filteredConversations,
    loading,
    error,
    
    // Setters
    setSearchTerm,
    setMessages,
    setConversations,
    setSelectedConversation,
    
    // Conversations CRUD
    loadConversations,
    getConversation,
    createConversation,
    updateConversation,
    deleteConversation,
    
    // Messages
    loadMessages,
    sendMessage,
    
    // Actions
    selectConversation,
    clearError,
  };
};