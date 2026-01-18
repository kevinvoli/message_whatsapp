// src/store/chatStore.ts
import { create } from 'zustand';
import axios from 'axios';
import { Conversation, Message, transformToConversation, transformToMessage } from '@/types/chat';

// Helper to create a temporary message for optimistic UI updates
const createTemporaryMessage = (text: string, conversation: Conversation): Message => ({
  id: `temp_${Date.now()}`,
  text,
  timestamp: new Date(),
  from: 'commercial',
  status: 'sending',
  from_me: true,
  direction: 'OUT',
  sender_phone: conversation.client_phone, // Assurez-vous que cette info est disponible
});


interface ChatState {
  conversations: Conversation[];
  messages: Message[];
  selectedConversation: Conversation | null;
  isLoading: boolean;
  error: string | null;
  loadConversations: (commercialId: string) => Promise<void>;
  selectConversation: (chatId: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  addMessage: (message: Message) => void;
  updateConversation: (conversation: Conversation) => void;
  addConversation: (conversation: Conversation) => void;
  reset: () => void;
}

const initialState = {
    conversations: [],
    messages: [],
    selectedConversation: null,
    isLoading: false,
    error: null,
  };

export const useChatStore = create<ChatState>((set, get) => ({
 ...initialState,

  loadConversations: async (commercialId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.get(`http://localhost:3001/whatsapp-chat/commercial/${commercialId}`);
      const conversations = response.data.map(transformToConversation);
      set({ conversations, isLoading: false });
    } catch (error) {
      console.error('Failed to load conversations:', error);
      set({ error: 'Failed to load conversations.', isLoading: false });
    }
  },

  selectConversation: async (chatId: string) => {
    const conversation = get().conversations.find(c => c.chat_id === chatId);
    if (!conversation) return;

    set({ selectedConversation: conversation, messages: [], isLoading: true, error: null });

    try {
      const response = await axios.get(`http://localhost:3001/whatsapp-message/${chatId}`);
      const messages = response.data.map(transformToMessage);
      set({ messages, isLoading: false });
    } catch (error) {
      console.error('Failed to load messages:', error);
      set({ error: 'Failed to load messages.', isLoading: false });
    }
  },

  sendMessage: async (text: string) => {
    const { selectedConversation } = get();
    if (!selectedConversation) return;

    const tempMessage = createTemporaryMessage(text, selectedConversation);

    // Optimistic UI update
    set((state) => ({ messages: [...state.messages, tempMessage] }));

    try {
      // API call to persist the message
      await axios.post('http://localhost:3001/whatsapp-message', {
        chat_id: selectedConversation.chat_id,
        content: text,
        from_me: true,
        // D'autres champs peuvent être requis par le backend DTO
      });
      // The backend will broadcast the new message via WebSocket,
      // and the `addMessage` or `updateConversation` handler will update the state.
    } catch (error) {
      console.error('Failed to send message:', error);
      // Update message status to 'error'
      set((state) => ({
        messages: state.messages.map(m =>
          m.id === tempMessage.id ? { ...m, status: 'error' } : m
        ),
        error: 'Failed to send message.',
      }));
    }
  },

  addMessage: (message: Message) => {
    set((state) => {
      // Evite les doublons de messages temporaires
      if (state.messages.some(m => m.id === message.id && m.status !== 'sending')) {
        return {};
      }
      return {
        // Remplace le message temporaire par le message final du serveur
        messages: [
          ...state.messages.filter(m => !m.id.startsWith('temp_')),
          message
        ],
      };
    });
  },

  updateConversation: (updatedConversation: Conversation) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === updatedConversation.id ? updatedConversation : c
      ),
      // Mettre à jour la conversation sélectionnée si c'est la même
      selectedConversation: state.selectedConversation?.id === updatedConversation.id
        ? updatedConversation
        : state.selectedConversation,
    }));
  },

  addConversation: (newConversation: Conversation) => {
    set((state) => {
      // Evite d'ajouter une conversation qui existe déjà
      if (state.conversations.some(c => c.id === newConversation.id)) {
        return {};
      }
      // Ajoute la nouvelle conversation en haut de la liste
      return {
        conversations: [newConversation, ...state.conversations],
      };
    });
  },
  reset: () => set(initialState),
}));
