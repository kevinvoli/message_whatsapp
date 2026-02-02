// src/store/chatStore.ts
import { create } from "zustand";
import { Socket } from "socket.io-client";
import { Conversation, Message } from "@/types/chat";

interface ChatState {
  typingStatus: Record<string, boolean>;
  socket: Socket | null;
  conversations: Conversation[];
  messages: Message[];
  selectedConversation: Conversation | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setSocket: (socket: Socket | null) => void;
  loadConversations: () => void;
  selectConversation: (chat_id: string) => void;
  sendMessage: (text: string) => void;

  // Setters for WebSocket events
  setConversations: (conversations: Conversation[]) => void;
  setMessages: (chat_id: string, messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateConversation: (conversation: Conversation) => void;
  addConversation: (conversation: Conversation) => void;
  removeConversationBychat_id: (conversationId: string) => void;
  updateMessageStatus: (
    chat_id: string | undefined,
    messageId: string,
    status: Message["status"],
  ) => void;
  setTyping: (chat_id: string) => void;
  clearTyping: (chat_id: string) => void;

  reset: () => void;
}

const initialState: Omit<
  ChatState,
  | "setSocket"
  | "loadConversations"
  | "selectConversation"
  | "sendMessage"
  | "setConversations"
  | "setMessages"
  | "addMessage"
  | "updateConversation"
  | "addConversation"
  | "removeConversationBychat_id"
  | "updateMessageStatus"
  | "setTyping"
  | "clearTyping"
  | "reset"
> = {
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
    if (!socket) return;

    set({ isLoading: true });
    console.log("novelle conversation");
    
    socket?.emit("conversations:get");
  },

  selectConversation: (chat_id: string) => {
    set((state) => {
      const conversation = state.conversations.find(
        (c) => c.chat_id === chat_id,
      );

      if (!conversation) return state;

      return {
        selectedConversation: { ...conversation, unreadCount: 0 },
        conversations: state.conversations.map((c) =>
          c.chat_id === chat_id ? { ...c, unreadCount: 0 } : c,
        ),
        messages: [],
        isLoading: true,
      };
    });

    // 🔔 Charge les messages + déclenche le READ côté backend
    const socket = get().socket;
    socket?.emit("messages:get", { chat_id });
    socket?.emit("messages:read", { chat_id });
  },

  removeConversationBychat_id: (chat_id: string) => {
    set((state) => ({
      conversations: state.conversations.filter((c) => c.chat_id !== chat_id),
      selectedConversation:
        state.selectedConversation?.chat_id === chat_id
          ? null
          : state.selectedConversation,
      messages:
        state.selectedConversation?.chat_id === chat_id ? [] : state.messages,
    }));
  },

  sendMessage: (text: string) => {
    const { socket, selectedConversation } = get();
    if (!socket || !selectedConversation) return;
    const tempMessage: Message = {
      id: crypto.randomUUID(),
      chat_id: selectedConversation.chat_id,
      text,
      status: "sending",
      from_me: true,
      // createdAt: new Date().toISOString(),
      timestamp: new Date(),
      from: ""
    };

    set((state) => ({
    messages: [...state.messages, tempMessage],
  }));

  socket.emit("message:send", {
    chat_id: selectedConversation.chat_id,
    text,
    tempId: tempMessage.id,
  });
  },

  setConversations: (conversations) => {
    console.log("=======track1 setConversations=======", conversations);

    set({ conversations, isLoading: false });
  },

  setMessages: (chat_id, messages) => {
  set((state) => {
    if (state.selectedConversation?.chat_id !== chat_id) return state;
    return { messages, isLoading: false };
  });
},


  addMessage: (message) => {

    console.log("dans le add message",message);
    
  set((state) => {
    const isActive =
      state.selectedConversation?.chat_id === message.chat_id;

    return {
      messages: isActive ? [...state.messages, message] : state.messages,
      conversations: state.conversations.map((c) =>
        c.chat_id === message.chat_id
          ? {
              ...c,
              lastMessage: message,
              unreadCount: isActive
                ? 0
                : (c.unreadCount ?? 0) + 1,
            }
          : c,
      ),
    };
  });
},

  updateConversation: (updatedConversation: Conversation) => {
    set((state) => {
      const isSelected =
        state.selectedConversation?.chat_id === updatedConversation.chat_id;
      const isOutgoing = updatedConversation.lastMessage?.from_me === true;
      console.log("est ce que c'est faux====", updatedConversation);

      const conversationExists = state.conversations.some(
        (c) => c.chat_id === updatedConversation.chat_id,
      );

      // 🔥 Mise à jour du compteur unread
      const conversationWithUnread: Conversation = {
        ...updatedConversation,
        unreadCount:
          isSelected || isOutgoing
            ? 0
            : conversationExists
              ? (state.conversations.find(
                  (c) => c.chat_id === updatedConversation.chat_id,
                )?.unreadCount ?? 0) + 1
              : (updatedConversation.unreadCount ?? 1),
      };

      // 🔁 Liste des conversations
      const newConversations = conversationExists
        ? state.conversations.map((c) =>
            c.chat_id === updatedConversation.chat_id
              ? conversationWithUnread
              : c,
          )
        : [conversationWithUnread, ...state.conversations];

      const newState: Partial<ChatState> = {
        conversations: newConversations,
      };

      // 🟢 Conversation active
      // 🟢 Si cette conversation est celle qui est sélectionnée
      if (isSelected) {
        newState.selectedConversation = conversationWithUnread;

        // 🆕 Le backend envoie messages[] (tableau complet) dans conversation:updated
        // On les utilise directement si présents et non vides
        if (
          updatedConversation.messages &&
          updatedConversation.messages.length > 0
        ) {
          // Merge intelligent : on garde les messages existants qui ne sont pas
          // dans le nouveau tableau (ex: messages "sending" en cours) puis on ajoute les nouveaux
          const newIds = new Set(updatedConversation.messages.map((m) => m.id));
          const localOnly = state.messages.filter(
            (m) => !newIds.has(m.id) && m.status === "sending",
          );
          newState.messages = [...updatedConversation.messages, ...localOnly];
        } else if (
          // Fallback : si pas de messages[] mais un lastMessage, on l'ajoute
          updatedConversation.lastMessage &&
          !state.messages.find(
            (m) => m.id === updatedConversation.lastMessage?.id,
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
    chat_id: string | undefined,
    messageId: string,
    status: Message["status"],
  ) => {
     set((state) => {
    if (state.selectedConversation?.chat_id !== chat_id) return state;

    return {
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, status } : m,
      ),
    };
  });
  },

  setTyping: (chat_id) => {
    set((state) => ({
      typingStatus: { ...state.typingStatus, [chat_id]: true },
    }));
  },

  clearTyping: (chat_id) => {
    set((state) => {
      const newTypingStatus = { ...state.typingStatus };
      delete newTypingStatus[chat_id];
      return { typingStatus: newTypingStatus };
    });
  },

  reset: () => set({...initialState}),
}));
