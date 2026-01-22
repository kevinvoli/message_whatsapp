// src/store/chatStore.ts
import { create } from "zustand";
import { Socket } from "socket.io-client";
import { Conversation, Message } from "@/types/chat";

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
    socket?.emit("conversations:get");
  },

  selectConversation: (chatId: string) => {
    const conversation = get().conversations.find((c) => c.chatId === chatId);
    if (conversation) {
      set({
        selectedConversation: conversation,
        messages: [],
        isLoading: true,
      });
      get().socket?.emit("messages:get", { chatId });
    }
  },

  sendMessage: (text: string) => {
    const { socket, selectedConversation } = get();
    if (socket && selectedConversation) {
      console.log("pres pour l'envoie du message_______________________________",selectedConversation);
      
      socket.emit("message:send", {
        chatId: selectedConversation.chatId,
        text,
      });
    }
  },

  setConversations: (conversations) => {
    set({ conversations, isLoading: false });
  },

  setMessages: (chatId: string, messages) => {
    if (get().selectedConversation?.chatId === chatId) {
      set({ messages, isLoading: false });
    }
  },

  addMessage: (message: Message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

updateConversation: (updatedConversation: Conversation) => {
  set((state) => {
    // Vérifie si la conversation existe déjà
    const conversationExists = state.conversations.some(
      (c) => c.id === updatedConversation.id
    );

    // Gestion des conversations
    let newConversations: Conversation[];
    if (conversationExists) {
      // Mise à jour d'une conversation existante
      newConversations = state.conversations.map((c) =>
        c.id === updatedConversation.id ? updatedConversation : c
      );
    } else {
      // Ajout d'une nouvelle conversation
      newConversations = [updatedConversation, ...state.conversations];
    }

    const newState: Partial<ChatState> = {
      conversations: newConversations,
    };

    // Si la conversation est sélectionnée OU si c'est la seule/la nouvelle
    if (
      state.selectedConversation?.id === updatedConversation.id ||
      // Optionnel: sélectionner automatiquement la nouvelle conversation
      (!state.selectedConversation && !conversationExists)
    ) {
      newState.selectedConversation = updatedConversation;

      // Ajoute le nouveau message s'il existe
      if (
        updatedConversation.lastMessage &&
        !state.messages.find((m) => m.id === updatedConversation.lastMessage?.id)
      ) {
        newState.messages = [...state.messages, updatedConversation.lastMessage];
      }
      
      // Optionnel: réinitialiser les messages pour la nouvelle conversation
      if (!conversationExists) {
        newState.messages = updatedConversation.lastMessage 
          ? [updatedConversation.lastMessage] 
          : [];
      }
    }

    console.log("Mise à jour des conversations", newState);
    return newState;
  });
},

  // updateConversation: (updatedConversation: Conversation) => {
  //   console.log("update des conversation", updatedConversation);

  //   set((state) => {
  //     const newState: Partial<ChatState> = {
  //       // Met à jour la conversation dans la liste
  //       conversations: state.conversations.map((c) =>
  //         c.id === updatedConversation.id ? updatedConversation : c,
  //       ),
  //     };

     

  //     // Si la conversation mise à jour est celle sélectionnée
  //     if (state.selectedConversation?.id === updatedConversation.id) {
  //       newState.selectedConversation = updatedConversation;

  //       // Ajoute le nouveau message à la liste des messages, s'il existe et n'est pas déjà présent
  //       if (
  //         updatedConversation.lastMessage &&
  //         !state.messages.find(
  //           (m) => m.id === updatedConversation?.lastMessage.id,
  //         )
  //       ) {
  //         newState.messages = [
  //           ...state.messages,
  //           updatedConversation.lastMessage,
  //         ];
  //       }
  //     }
  //     console.log("fffffffffffffffffffffffffffffffffffffffff", newState);

  //     return newState;
  //   });
  // },

  addConversation: (newConversation: Conversation) => {
    set((state) => ({
      conversations: [
        newConversation,
        ...state.conversations.filter((c) => c.id !== newConversation.id),
      ],
    }));
  },

  
  removeConversation: (conversationId: string) => {
     set((state) => ({
    conversations: state.conversations.filter((c) => c.id !== conversationId),
  }));
  },

  reset: () => set(initialState),
}));
