"use client";

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Conversation, Message } from '@/types/chat';
import { useWebSocket } from './useWebSocket';
import { useAuth } from './useAuth';

export const useConversations = () => {
  const { commercial } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messagesState, setMessagesState] = useState<{ list: Message[], isLoading: boolean }>({
    list: [],
    isLoading: false,
  });
  const { list: messages, isLoading: isLoadingMessages } = messagesState;

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | Conversation['status']>('ALL');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  const handleConversationList = useCallback((convs: Conversation[]) => {
    setConversations(convs);
    setIsLoading(false);
  }, []);

  const handleMessageList = useCallback((incomingMessages: Message[]) => {
    setMessagesState({ list: incomingMessages, isLoading: false });
  }, []);

  const handleNewMessage = useCallback((message: Message) => {
    if (message.conversationId === selectedConversation?.id) {
      setMessagesState(prev => ({ ...prev, list: [...prev.list, message] }));
    }
    setConversations(prev => prev.map(c =>
      c.id === message.conversationId
        ? {
            ...c,
            lastMessage: message,
            unreadCount: c.id === selectedConversation?.id ? 0 : (c.unreadCount || 0) + 1,
          }
        : c
    ));
  }, [selectedConversation]);

  const handleNewConversation = useCallback((conversation: Conversation) => {
    setConversations(prev => [conversation, ...prev]);
  }, []);

  const ws = useWebSocket({
    commercial,
    onConversationList: handleConversationList,
    onMessageList: handleMessageList,
    onNewMessage: handleNewMessage,
    onNewConversation: handleNewConversation,
    onMessageStatusUpdate: () => {},
    onConversationAssigned: () => {},
    onTypingStart: () => {},
    onTypingStop: () => {},
  });

  useEffect(() => {
    if (ws.isConnected && commercial) {
      ws.requestConversations({ commercialId: commercial.id });
    }
  }, [ws.isConnected, commercial, ws]);

  const selectConversation = useCallback((conversation: Conversation) => {
    setSelectedConversation(conversation);
    setMessagesState({ list: [], isLoading: true });
    ws.requestMessages({ conversationId: conversation.id });

    if (conversation.unreadCount > 0) {
      ws.markAsRead({ conversationId: conversation.id, messageIds: [] });
    }
  }, [ws]);

  const sendMessage = useCallback((content: string) => {
    if (!selectedConversation || !commercial) return;
    
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      conversationId: selectedConversation.id,
      content,
      type: 'TEXT',
      sender: 'COMMERCIAL',
      status: 'SENDING',
      sentAt: new Date(),
    };
    
    setMessagesState(prev => ({ ...prev, list: [...prev.list, optimisticMessage] }));
    
    ws.sendMessage({
      conversationId: selectedConversation.id,
      content,
      type: 'TEXT',
    });
  }, [selectedConversation, commercial, ws]);

  const toggleSortOrder = useCallback(() => {
    setSortOrder(prev => (prev === 'DESC' ? 'ASC' : 'DESC'));
  }, []);

  const filteredAndSortedConversations = useMemo(() => {
    return conversations
      .filter(c => {
        if (filterStatus !== 'ALL' && c.status !== filterStatus) return false;
        const term = searchTerm.toLowerCase();
        return (
          c.clientName?.toLowerCase().includes(term) ||
          c.clientPhone?.includes(term)
        );
      })
      .sort((a, b) => {
        const dateA = new Date(a.lastMessage?.sentAt || 0).getTime();
        const dateB = new Date(b.lastMessage?.sentAt || 0).getTime();
        return sortOrder === 'DESC' ? dateB - dateA : dateA - dateB;
      });
  }, [conversations, filterStatus, searchTerm, sortOrder]);

  return {
    conversations: filteredAndSortedConversations,
    selectedConversation,
    messages,
    isLoading,
    isLoadingMessages,
    isWebSocketConnected: ws.isConnected,
    error: ws.error,
    searchTerm,
    filterStatus,
    sortOrder,
    setSearchTerm,
    setFilterStatus,
    toggleSortOrder,
    selectConversation,
    sendMessage,
    reconnectWebSocket: ws.reconnect,
  };
};