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
      (c) => c.chat_id === chatId
    );

    if (!conversation) return state;


    const updatedConversation = {
      ...conversation,
      unreadCount: 0,
    };

    return {
      selectedConversation: updatedConversation,

      conversations: state.conversations.map((c) =>
        c.chat_id === chatId ? updatedConversation : c
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
    conversations: state.conversations.filter(
      (c) => c.chat_id !== chatId,
    ),
    selectedConversation:
      state.selectedConversation?.chat_id === chatId
        ? null
        : state.selectedConversation,
    messages:
      state.selectedConversation?.chat_id === chatId
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
        chatId: selectedConversation.chat_id,
        text,
      });
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
    const isActive =
      state.selectedConversation?.chat_id === message.sender_phone;

    return {
      messages: isActive
        ? [...state.messages, message]
        : state.messages,

      conversations: state.conversations.map((c) =>
        c.chat_id === message.sender_phone
          ? { ...c, lastMessage: message }
          : c,
      ),
    };
  });
},


updateConversation: (conversation: Conversation) => {
  console.log("mise a jour de la conversation",conversation);
  
  set((state) => {
    const isSelected =
      state.selectedConversation?.chat_id === conversation.chat_id;

    return {
      conversations: state.conversations.some(
        (c) => c.chat_id === conversation.chat_id,
      )
        ? state.conversations.map((c) =>
            c.chat_id === conversation.chat_id ? conversation : c,
          )
        : [conversation, ...state.conversations],

      selectedConversation: isSelected
        ? conversation
        : state.selectedConversation,
    };
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
      if (state.selectedConversation?.chat_id === chatId) {
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
