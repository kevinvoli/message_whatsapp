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
  onTypingStart: (chat_id: string) => void;
  onTypingStop: (chat_id: string) => void;
  searchConversations: (search: string) => void;

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
  | "onTypingStart"
  | "onTypingStop"
  | "searchConversations"
> = {
  socket: null,
  conversations: [],
  messages: [],
  selectedConversation: null,
  isLoading: false,
  error: null,
  typingStatus: {},
};
let typingTimeout: NodeJS.Timeout;

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
        selectedConversation: conversation,
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

    const tempId = crypto.randomUUID();
    const tempMessage: Message = {
      id: crypto.randomUUID(),
      chat_id: selectedConversation.chat_id,
      text,
      status: "sending",
      from_me: true,
      timestamp: new Date(),
      from: "",
    };

    set((state) => ({
      messages: [...state.messages, tempMessage],
    }));

    console.log("id temporaire==============", tempMessage);

    socket.emit("message:send", {
      chat_id: selectedConversation.chat_id,
      text,
      tempId: tempMessage.id, // ⚡ On envoie le tempId au backend
    });
  },

  onTypingStart: (chat_id: string) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit("typing:start", { chat_id });
  },

  onTypingStop: (chat_id) => {
    const { socket } = get();

    if (!socket) return;

    socket.emit("typing:stop", { chat_id });
  },

  searchConversations: (search: string) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit("conversations:get", { search });
  },

  setConversations: (conversations) => {
    // console.log("=======track1 setConversations=======", conversations);

    set({ conversations, isLoading: false });
  },

  setMessages: (chat_id, messages) => {
    set((state) => {
      if (state.selectedConversation?.chat_id !== chat_id) return state;
      return { messages, isLoading: false };
    });
  },

  addMessage: (message) => {
    set((state) => {
      const isActive = state.selectedConversation?.chat_id === message.chat_id;

      return {
        messages: isActive ? [...state.messages, message] : state.messages,
        conversations: state.conversations.map((c) =>
          c.chat_id === message.chat_id
            ? {
                ...c,
                lastMessage: message,
                // On ne calcule plus l'unreadCount ici, on attend le CONVERSATION_UPSERT du back
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

      const conversationExists = state.conversations.some(
        (c) => c.chat_id === updatedConversation.chat_id,
      );

      // 🔁 Liste des conversations - Source de vérité Backend uniquement
      const newConversations = conversationExists
        ? state.conversations.map((c) =>
            c.chat_id === updatedConversation.chat_id
              ? { ...c, ...updatedConversation } // Merge des données du back
              : c,
          )
        : [updatedConversation, ...state.conversations];

      const newState: Partial<ChatState> = {
        conversations: newConversations,
      };

      if (isSelected) {
        newState.selectedConversation = conversationExists
          ? { ...state.selectedConversation!, ...updatedConversation }
          : updatedConversation;

        // Sync des messages si fournis
        if (updatedConversation.messages && updatedConversation.messages.length > 0) {
          const newIds = new Set(updatedConversation.messages.map((m) => m.id));
          const localOnly = state.messages.filter(
            (m) => !newIds.has(m.id) && m.status === "sending",
          );
          newState.messages = [...updatedConversation.messages, ...localOnly];
        } else if (
          updatedConversation.lastMessage &&
          !state.messages.find((m) => m.id === updatedConversation.lastMessage?.id)
        ) {
          newState.messages = [...state.messages, updatedConversation.lastMessage];
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

    // 🧼 auto-clean après 6s
    setTimeout(() => {
      set((state) => {
        if (!state.typingStatus[chat_id]) return state;
        const next = { ...state.typingStatus };
        delete next[chat_id];
        return { typingStatus: next };
      });
    }, 6000);
  },

  clearTyping: (chat_id) => {
    set((state) => {
      const newTypingStatus = { ...state.typingStatus };
      delete newTypingStatus[chat_id];
      return { typingStatus: newTypingStatus };
    });
  },

  reset: () => set({ ...initialState }),
}));
