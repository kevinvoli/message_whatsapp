// src/store/chatStore.ts
import { create } from 'zustand';
import { Socket } from 'socket.io-client';
import { Conversation, Message } from '@/types/chat';

interface ChatState {
  socket: Socket | null;
  conversations: Conversation[];
  messages: Message[];
  selectedConversation: Conversation | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setSocket: (socket: Socket | null) => void;
  loadConversations: () => void;
  selectConversation: (chatId: string) => void;
  sendMessage: (text: string) => void;

  // Setters for WebSocket events
  setConversations: (conversations: Conversation[]) => void;
  setMessages: (chatId: string, messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateConversation: (conversation: Conversation) => void;
  addConversation: (conversation: Conversation) => void;

  reset: () => void;
}

const initialState = {
  socket: null,
  conversations: [],
  messages: [],
  selectedConversation: null,
  isLoading: false,
  error: null,
};

export const useChatStore = create<ChatState>((set, get) => ({
  ...initialState,

  setSocket: (socket) => set({ socket }),

  loadConversations: () => {
    const { socket } = get();
    set({ isLoading: true });
    socket?.emit('conversations:get');
  },

  selectConversation: (chatId: string) => {
    const conversation = get().conversations.find(c => c.chat_id === chatId);
    if (conversation) {
      set({ selectedConversation: conversation, messages: [], isLoading: true });
      get().socket?.emit('messages:get', { chatId });
    }
  },

  sendMessage: (text: string) => {
    const { socket, selectedConversation } = get();
    if (socket && selectedConversation) {
      socket.emit('message:send', { chatId: selectedConversation.chat_id, text });
    }
  },

  setConversations: (conversations) => {
    set({ conversations, isLoading: false });
  },

  setMessages: (chatId: string, messages) => {
    if (get().selectedConversation?.chat_id === chatId) {
      set({ messages, isLoading: false });
    }
  },

  addMessage: (message: Message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  updateConversation: (updatedConversation: Conversation) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === updatedConversation.id ? updatedConversation : c
      ),
      selectedConversation: state.selectedConversation?.id === updatedConversation.id
        ? updatedConversation
        : state.selectedConversation,
    }));
  },

  addConversation: (newConversation: Conversation) => {
    set((state) => ({
      conversations: [newConversation, ...state.conversations.filter(c => c.id !== newConversation.id)],
    }));
  },

  reset: () => set(initialState),
}));
