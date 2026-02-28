// src/store/chatStore.ts
import { create } from "zustand";
import { Socket } from "socket.io-client";
import { Conversation, ConversationStatus, Message } from "@/types/chat";
import { logger } from "@/lib/logger";

// crypto.randomUUID() n'est disponible qu'en contexte sécurisé (HTTPS/localhost)
function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface ChatState {
  typingStatus: Record<string, boolean>;
  socket: Socket | null;
  conversations: Conversation[];
  messages: Message[];
  selectedConversation: Conversation | null;
  isLoading: boolean;
  error: string | null;
  messageIdCache: Record<string, Set<string>>;

  // Actions
  setSocket: (socket: Socket | null) => void;
  loadConversations: () => void;
  selectConversation: (chat_id: string) => void;
  sendMessage: (text: string) => void;
  onTypingStart: (chat_id: string) => void;
  onTypingStop: (chat_id: string) => void;
  changeConversationStatus: (chat_id: string, status: ConversationStatus) => void;

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
  | "changeConversationStatus"
> = {
  socket: null,
  conversations: [],
  messages: [],
  selectedConversation: null,
  isLoading: false,
  error: null,
  typingStatus: {},
  messageIdCache: {},
};
let typingTimeout: NodeJS.Timeout;
let isSending = false;

const dedupeMessagesById = (messages: Message[]): Message[] => {
  const map = new Map<string, Message>();
  for (const message of messages) {
    map.set(message.id, message);
  }
  return Array.from(map.values()).sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );
};

export const useChatStore = create<ChatState>((set, get) => ({
  ...initialState,

  setSocket: (socket) => set({ socket }),

  loadConversations: () => {
    const { socket } = get();
    if (!socket) return;

    set({ isLoading: true });
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
        messageIdCache: { ...state.messageIdCache, [chat_id]: new Set<string>() },
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
    if (isSending) return;

    const { socket, selectedConversation } = get();
    if (!socket || !selectedConversation) return;

    isSending = true;

    const tempMessage: Message = {
      id: generateUUID(),
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

    logger.debug("Temporary message created", {
      chat_id: selectedConversation.chat_id,
      temp_id: tempMessage.id,
    });

    socket.emit("message:send", {
      chat_id: selectedConversation.chat_id,
      text,
      tempId: tempMessage.id,
    });

    // Libère le lock après un court délai pour éviter les double-clics
    setTimeout(() => { isSending = false; }, 500);
  },

  onTypingStart: (chat_id: string) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit("chat:event", { type: "TYPING_START", payload: { chat_id } });
  },

  onTypingStop: (chat_id) => {
    const { socket } = get();

    if (!socket) return;

    socket.emit("chat:event", { type: "TYPING_STOP", payload: { chat_id } });
  },

  changeConversationStatus: (chat_id: string, status: ConversationStatus) => {
    const { socket } = get();
    if (!socket) return;

    socket.emit("chat:event", {
      type: "CONVERSATION_STATUS_CHANGE",
      payload: { chat_id, status },
    });

    logger.debug("Conversation status change emitted", { chat_id, status });
  },

  setConversations: (conversations) => {
    set((state) => {
      const selectedChatId = state.selectedConversation?.chat_id;
      const normalized = selectedChatId
        ? conversations.map((c) =>
            c.chat_id === selectedChatId ? { ...c, unreadCount: 0 } : c,
          )
        : conversations;
      return { conversations: normalized, isLoading: false };
    });
  },

  setMessages: (chat_id, messages) => {
    set((state) => {
      if (state.selectedConversation?.chat_id !== chat_id) return state;
      const deduped = dedupeMessagesById(messages);
      return {
        messages: deduped,
        isLoading: false,
        messageIdCache: {
          ...state.messageIdCache,
          [chat_id]: new Set(deduped.map((m) => m.id)),
        },
      };
    });
  },

  addMessage: (message) => {
    logger.debug("Message added to store", {
      chat_id: message.chat_id,
      message_id: message.id,
    });

    set((state) => {
      const existingIds = state.messageIdCache[message.chat_id];
      if (existingIds?.has(message.id)) {
        return state;
      }

      const alreadyExists = state.messages.some((m) => m.id === message.id);
      const isActive = state.selectedConversation?.chat_id === message.chat_id;
      const updatedMessages =
        isActive && !alreadyExists
          ? dedupeMessagesById([...state.messages, message])
          : state.messages;
      const nextCache = isActive
        ? {
            ...state.messageIdCache,
            [message.chat_id]: new Set(updatedMessages.map((m) => m.id)),
          }
        : state.messageIdCache;

      return {
        messages: updatedMessages,
        conversations: state.conversations.map((c) =>
          c.chat_id === message.chat_id
            ? {
                ...c,
                lastMessage: message,
                unreadCount: isActive
                  ? 0
                  : message.from_me
                    ? (c.unreadCount ?? 0)
                    : (c.unreadCount ?? 0) + 1,
              }
            : c,
        ),
        messageIdCache: nextCache,
      };
    });
  },

  updateConversation: (updatedConversation: Conversation) => {
    set((state) => {
      const isSelected =
        state.selectedConversation?.chat_id === updatedConversation.chat_id;
      logger.debug("Conversation update received", {
        chat_id: updatedConversation.chat_id,
      });

      const conversationExists = state.conversations.some(
        (c) => c.chat_id === updatedConversation.chat_id,
      );

      // 🔥 Mise à jour du compteur unread
      const conversationWithUnread: Conversation = {
        ...updatedConversation,
        unreadCount: isSelected ? 0 : (updatedConversation.unreadCount ?? 0),
      };

      // 🔁 Liste des conversations
      // IMPORTANT: on ne re-ajoute PAS une conversation absente via UPSERT
      // (évite la réapparition après CONVERSATION_REMOVED).
      // Les nouvelles conversations arrivent exclusivement via CONVERSATION_ASSIGNED.
      if (!conversationExists) {
        if (isSelected) {
          return { selectedConversation: conversationWithUnread };
        }
        return state;
      }

      const newConversations = state.conversations.map((c) =>
        c.chat_id === updatedConversation.chat_id ? conversationWithUnread : c,
      );

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
          newState.messages = dedupeMessagesById([
            ...updatedConversation.messages,
            ...localOnly,
          ]);
        } else if (
          // Fallback : si pas de messages[] mais un lastMessage, on l'ajoute
          updatedConversation.lastMessage &&
          !state.messages.find(
            (m) => m.id === updatedConversation.lastMessage?.id,
          )
        ) {
          newState.messages = dedupeMessagesById([
            ...state.messages,
            updatedConversation.lastMessage,
          ]);
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
