// src/store/chatStore.ts
import { create } from "zustand";
import { Socket } from "socket.io-client";
import { Conversation, Message } from "@/types/chat";

interface ChatState {
  typingStatus: any;
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
  removeConversationByChatId: (conversationId: string) => void;
  updateMessageStatus: (chatId: string | undefined, messageId: string, status: any) => void;
  setTyping: (chatId: string) => void;
  clearTyping: (chatId: string) => void;

  reset: () => void;
}

const initialState = {
  socket: null,
  conversations: [],
  messages: [],
  selectedConversation: null,
  isLoading: false,
  error: null,
  typingStatus: {},
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
  set((state) => {
    const conversation = state.conversations.find(
      (c) => c.chatId === chatId
    );

    if (!conversation) return state;

    const updatedConversation = {
      ...conversation,
      unreadCount: 0,
    };

    return {
      selectedConversation: updatedConversation,

      conversations: state.conversations.map((c) =>
        c.chatId === chatId ? updatedConversation : c
      ),

      messages: [],
      isLoading: true,
    };
  });

  // 🔔 Charge les messages + déclenche le READ côté backend
  get().socket?.emit("messages:get", { chatId });
  get().socket?.emit("messages:read", { chatId });
},

removeConversationByChatId: (chatId: string) => {
  set((state) => ({
    conversations: state.conversations.filter(c => c.chatId !== chatId),
    selectedConversation:
      state.selectedConversation?.chatId === chatId
        ? null
        : state.selectedConversation,
    messages:
      state.selectedConversation?.chatId === chatId
        ? []
        : state.messages,
  }));
},


  sendMessage: (text: string) => {
    const { socket, selectedConversation } = get();
    if (socket && selectedConversation) {
      console.log(
        "pres pour l'envoie du message_______________________________",
        selectedConversation,
      );

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
    const isSelected =
      state.selectedConversation?.id === updatedConversation.id;

    const conversationExists = state.conversations.some(
      (c) => c.id === updatedConversation.id
    );

    // 🔥 Mise à jour du compteur unread
    const conversationWithUnread: Conversation = {
      ...updatedConversation,
      unreadCount: isSelected
        ? 0
        : conversationExists
        ? (state.conversations.find(c => c.id === updatedConversation.id)
            ?.unreadCount ?? 0) + 1
        : updatedConversation.unreadCount ?? 1,
    };

    // 🔁 Liste des conversations
    const newConversations = conversationExists
      ? state.conversations.map((c) =>
          c.id === updatedConversation.id ? conversationWithUnread : c
        )
      : [conversationWithUnread, ...state.conversations];

    const newState: Partial<ChatState> = {
      conversations: newConversations,
    };

    // 🟢 Conversation active
    if (isSelected) {
      newState.selectedConversation = conversationWithUnread;

      if (
        updatedConversation.lastMessage &&
        !state.messages.find(
          (m) => m.id === updatedConversation.lastMessage?.id
        )
      ) {
        newState.messages = [
          ...state.messages,
          updatedConversation.lastMessage,
        ];
      }
    }

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

  updateMessageStatus: (
    chatId: string | undefined,
    messageId: string,
    status: any,
  ) => {
    set((state) => {
      // Met à jour le message dans la liste des messages de la conversation active
      if (state.selectedConversation?.chatId === chatId) {
        return {
          messages: state.messages.map((m) =>
            m.id === messageId ? { ...m, status } : m,
          ),
        };
      }
      return {};
    });
  },

  setTyping: (chatId) => {
    set((state) => ({
      typingStatus: { ...state.typingStatus, [chatId]: true },
    }));
  },

  clearTyping: (chatId) => {
    set((state) => {
      const newTypingStatus = { ...state.typingStatus };
      delete newTypingStatus[chatId];
      return { typingStatus: newTypingStatus };
    });
  },

  reset: () => set(initialState),
}));
