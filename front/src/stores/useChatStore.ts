// src/stores/useChatStore.ts
import { create } from 'zustand';
import { Conversation, Message } from '@/types/chat';

/**
 * Interface définissant l'état du store de chat.
 * Gère les conversations, les messages, l'état de la connexion et les actions associées.
 * C'est la source de vérité unique pour l'état de la messagerie.
 */
interface ChatState {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;

  // Actions pour manipuler l'état
  setConversations: (conversations: Conversation[]) => void;
  selectConversation: (conversation: Conversation | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateConversation: (updatedConversation: Conversation) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  conversations: [],
  selectedConversation: null,
  messages: [],
  isLoading: false,
  error: null,
};

/**
 * Crée et exporte le store Zustand `useChatStore`.
 */
export const useChatStore = create<ChatState>((set, get) => ({
  ...initialState,

  /**
   * Met à jour la liste des conversations.
   */
  setConversations: (conversations) => set({ conversations, isLoading: false }),

  /**
   * Sélectionne une conversation active et réinitialise les messages.
   */
  selectConversation: (conversation) => set({ selectedConversation: conversation, messages: [], isLoading: true }),

  /**
   * Remplace la liste des messages pour la conversation sélectionnée.
   */
  setMessages: (messages) => set({ messages, isLoading: false }),

  /**
   * Ajoute un nouveau message à la liste des messages actuelle.
   * S'assure de ne pas ajouter de doublons.
   */
  addMessage: (message) => set((state) => {
    // Evite d'ajouter un message si un autre avec le même ID existe déjà
    if (state.messages.some(m => m.id === message.id)) {
      return {};
    }
    return { messages: [...state.messages, message] };
  }),

  /**
   * Met à jour une conversation existante dans la liste (ex: nouveau message, changement de statut).
   * Si la conversation mise à jour est la conversation sélectionnée, met également à jour
   * le `selectedConversation` et ajoute le nouveau message à la liste des messages.
   */
  updateConversation: (updatedConversation: Conversation) => {
    set((state) => {
      const newConversations = state.conversations.map((c) =>
        c.id === updatedConversation.id ? updatedConversation : c
      );

      // Si la conversation mise à jour est celle qui est actuellement sélectionnée
      if (state.selectedConversation?.id === updatedConversation.id) {
        // Ajoute le dernier message à la liste des messages s'il n'y est pas déjà
        if (updatedConversation.lastMessage && !state.messages.some(m => m.id === updatedConversation.lastMessage.id)) {
          return {
            conversations: newConversations,
            selectedConversation: updatedConversation,
            messages: [...state.messages, updatedConversation.lastMessage],
          };
        }
        // Met juste à jour la conversation sélectionnée sans toucher aux messages
        return {
          conversations: newConversations,
          selectedConversation: updatedConversation,
        };
      }

      return { conversations: newConversations };
    });
  },

  /**
   * Définit l'état de chargement.
   */
  setLoading: (isLoading) => set({ isLoading }),

  /**
   * Stocke un message d'erreur.
   */
  setError: (error) => set({ error }),

  /**
   * Réinitialise l'état du store à ses valeurs initiales.
   */
  reset: () => set(initialState),
}));