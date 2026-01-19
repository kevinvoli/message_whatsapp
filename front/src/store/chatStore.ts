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
  removeConversation: (conversationId: string) => void;

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
    set((state) => {
      const newState: Partial<ChatState> = {};

      // Met à jour la conversation dans la liste pour refléter le nouveau dernier message et incrémenter le compteur de non-lus
      newState.conversations = state.conversations.map(c => {
        if (c.chat_id === message.chatId) {
          return {
            ...c,
            lastMessage: message,
            unreadCount: (c.unreadCount || 0) + 1,
          };
        }
        return c;
      });

      // Si la conversation du message est celle qui est sélectionnée, ajoute le message à la liste visible
      if (state.selectedConversation?.chat_id === message.chatId) {
        newState.messages = [...state.messages, message];
      }

      return newState;
    });
  },

  updateConversation: (updatedConversation: Conversation) => {
    // console.log("update des conversation", updatedConversation);
    
    set((state) => {
      const newState: Partial<ChatState> = {
        // Met à jour la conversation dans la liste
        conversations: state.conversations.map((c) =>
          c.id === updatedConversation.id ? updatedConversation : c
        ),
      };

      // Si la conversation mise à jour est celle sélectionnée
      if (state.selectedConversation?.id === updatedConversation.id) {
        newState.selectedConversation = updatedConversation;

        // Ajoute le nouveau message à la liste des messages, s'il existe et n'est pas déjà présent
        if (updatedConversation.lastMessage && !state.messages.find(m => m.id === updatedConversation?.lastMessage.id)) {
          newState.messages = [...state.messages, updatedConversation.lastMessage];
        }
      }
console.log("fffffffffffffffffffffffffffffffffffffffff",newState);

      return newState;
    });
  },

  addConversation: (newConversation: Conversation) => {
    set((state) => ({
      conversations: [newConversation, ...state.conversations.filter(c => c.id !== newConversation.id)],
    }));
  },

  removeConversation: (conversationId: string) => {
    set((state) => ({
      conversations: state.conversations.filter(c => c.id !== conversationId),
      // Si la conversation supprimée était sélectionnée, on la déselectionne
      selectedConversation: state.selectedConversation?.id === conversationId ? null : state.selectedConversation,
    }));
  },

  reset: () => set(initialState),
}));
