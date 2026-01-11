import { useState, useCallback, useEffect } from 'react';
import { Conversation, Message } from '@/types/chat';

export const useConversations = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Déclarer loadMessages d'abord
  const loadMessages = useCallback((conversationId: string) => {
    // Simulation de chargement des messages
    const mockMessages: Message[] = [
      {
        id: 'msg_1',
        text: 'Bonjour, je souhaite des informations sur vos produits',
        timestamp: new Date(Date.now() - 600000),
        from: 'client',
        status: 'read'
      },
      {
        id: 'msg_2',
        text: 'Bonjour! Je serais ravi de vous aider. Quel type de produit vous intéresse?',
        timestamp: new Date(Date.now() - 500000),
        from: 'commercial',
        status: 'read'
      },
      {
        id: 'msg_3',
        text: 'Je cherche des informations sur vos services',
        timestamp: new Date(Date.now() - 300000),
        from: 'client',
        status: 'read'
      }
    ];
    setMessages(mockMessages);
  }, []);

  const loadConversations = useCallback((commercialId: string) => {
    // Simulation
    const mockConversations: Conversation[] = [
      {
        id: 'conv_1',
        clientName: 'Ahmed Benali',
        clientPhone: '+212612345678',
        lastMessage: { 
          id: 'msg_1',
          text: 'Bonjour, je souhaite des informations', 
          timestamp: new Date(Date.now() - 300000), 
          from: 'client' 
        },
        unreadCount: 2,
        status: 'active'
      },
      {
        id: 'conv_2',
        clientName: 'Fatima Zahra',
        clientPhone: '+212623456789',
        lastMessage: { 
          id: 'msg_2',
          text: 'Merci pour votre réponse', 
          timestamp: new Date(Date.now() - 600000), 
          from: 'commercial' 
        },
        unreadCount: 0,
        status: 'active'
      },
      {
        id: 'conv_3',
        clientName: 'Youssef Alami',
        clientPhone: '+212634567890',
        lastMessage: { 
          id: 'msg_3',
          text: 'Quel est le prix?', 
          timestamp: new Date(Date.now() - 900000), 
          from: 'client' 
        },
        unreadCount: 1,
        status: 'active'
      }
    ];
    setConversations(mockConversations);
  }, []);

  const selectConversation = useCallback((conv: Conversation) => {
    setSelectedConversation(conv);
    // Réinitialiser le compteur non lus
    setConversations(prev => prev.map(c => 
      c.id === conv.id ? { ...c, unreadCount: 0 } : c
    ));
    
    // Charger les messages de la conversation
    loadMessages(conv.id);
  }, [loadMessages]); // Ajouter loadMessages comme dépendance

  const filteredConversations = conversations.filter(conv =>
    conv.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.clientPhone.includes(searchTerm)
  );

  return {
    conversations,
    selectedConversation,
    messages,
    searchTerm,
    filteredConversations,
    setSearchTerm,
    loadConversations,
    selectConversation,
    loadMessages, // Exposer si nécessaire ailleurs
    setMessages
  };
};