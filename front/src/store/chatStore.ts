// src/store/chatStore.ts
import { create } from "zustand";
import { Socket } from "socket.io-client";
import { ContactSummary, Conversation, ConversationStatus, Message } from "@/types/chat";
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
  isLoadingMore: boolean;
  hasMoreMessages: boolean;
  error: string | null;
  messageIdCache: Record<string, Set<string>>;
  replyToMessage: Message | null;

  // Actions
  setSocket: (socket: Socket | null) => void;
  loadConversations: () => void;
  selectConversation: (chat_id: string) => void;
  sendMessage: (text: string) => void;
  setReplyTo: (message: Message) => void;
  clearReplyTo: () => void;
  onTypingStart: (chat_id: string) => void;
  onTypingStop: (chat_id: string) => void;
  changeConversationStatus: (chat_id: string, status: ConversationStatus) => void;
  loadMoreMessages: () => void;

  // Setters for WebSocket events
  setConversations: (conversations: Conversation[]) => void;
  setMessages: (chat_id: string, messages: Message[]) => void;
  prependMessages: (chat_id: string, older: Message[]) => void;
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
  /** Met à jour le contact_summary d'une conversation (ex. après CONTACT_CALL_STATUS_UPDATED). */
  updateConversationContactSummary: (chatId: string, summary: Partial<ContactSummary>) => void;

  reset: () => void;
}

const initialState: Omit<
  ChatState,
  | "setSocket"
  | "loadConversations"
  | "selectConversation"
  | "sendMessage"
  | "setReplyTo"
  | "clearReplyTo"
  | "setConversations"
  | "setMessages"
  | "prependMessages"
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
  | "loadMoreMessages"
  | "updateConversationContactSummary"
> = {
  socket: null,
  conversations: [],
  messages: [],
  selectedConversation: null,
  isLoading: false,
  isLoadingMore: false,
  hasMoreMessages: true,
  error: null,
  typingStatus: {},
  messageIdCache: {},
  replyToMessage: null,
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
    const preloaded = (() => {
      const conv = get().conversations.find((c) => c.chat_id === chat_id);
      return conv?.messages && conv.messages.length > 0 ? conv.messages : null;
    })();

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
        messages: preloaded ?? [],
        isLoading: preloaded === null,
        isLoadingMore: false,
        hasMoreMessages: true,
        messageIdCache: {
          ...state.messageIdCache,
          [chat_id]: preloaded
            ? new Set(preloaded.map((m) => m.id))
            : new Set<string>(),
        },
        replyToMessage: null,
      };
    });

    const socket = get().socket;
    // Si les messages sont déjà pré-chargés, pas besoin de les redemander
    if (!preloaded) {
      socket?.emit("messages:get", { chat_id });
    }
    socket?.emit("messages:read", { chat_id });
  },

  updateConversationContactSummary: (chatId, summary) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.chat_id === chatId
          ? { ...c, contact_summary: { ...(c.contact_summary ?? {} as any), ...summary } }
          : c,
      ),
    }));
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

    const { socket, selectedConversation, replyToMessage } = get();
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
      quotedMessage: replyToMessage
        ? {
            id: replyToMessage.id,
            text: replyToMessage.text,
            from_name: replyToMessage.from_name,
            from_me: replyToMessage.from_me,
          }
        : undefined,
    };

    set((state) => ({
      messages: [...state.messages, tempMessage],
      replyToMessage: null,
    }));

    logger.debug("Temporary message created", {
      chat_id: selectedConversation.chat_id,
      temp_id: tempMessage.id,
    });

    socket.emit("message:send", {
      chat_id: selectedConversation.chat_id,
      text,
      tempId: tempMessage.id,
      quotedMessageId: replyToMessage?.id,
    });

    // Libère le lock après un court délai pour éviter les double-clics
    setTimeout(() => { isSending = false; }, 500);
  },

  setReplyTo: (message: Message) => set({ replyToMessage: message }),

  clearReplyTo: () => set({ replyToMessage: null }),

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

  loadMoreMessages: () => {
    const { socket, messages, selectedConversation, isLoadingMore, hasMoreMessages } = get();
    if (!socket || !selectedConversation || isLoadingMore || !hasMoreMessages) return;
    if (messages.length === 0) return;
    const oldest = messages[0];
    set({ isLoadingMore: true });
    socket.emit('messages:get', {
      chat_id: selectedConversation.chat_id,
      limit: 50,
      before: oldest.timestamp.toISOString(),
    });
  },

  setConversations: (conversations) => {
    set((state) => {
      const selectedChatId = state.selectedConversation?.chat_id;
      const normalized = selectedChatId
        ? conversations.map((c) =>
            c.chat_id === selectedChatId ? { ...c, unreadCount: 0 } : c,
          )
        : conversations;

      // Pré-charger le cache de messages depuis les conversations reçues au connect
      const newMessageIdCache: Record<string, Set<string>> = { ...state.messageIdCache };
      for (const conv of normalized) {
        if (conv.messages && conv.messages.length > 0) {
          newMessageIdCache[conv.chat_id] = new Set(conv.messages.map((m) => m.id));
        }
      }

      return { conversations: normalized, isLoading: false, messageIdCache: newMessageIdCache };
    });
  },

  setMessages: (chat_id, messages) => {
    set((state) => {
      if (state.selectedConversation?.chat_id !== chat_id) return state;
      const deduped = dedupeMessagesById(messages);
      return {
        messages: deduped,
        isLoading: false,
        hasMoreMessages: messages.length >= 50,
        messageIdCache: {
          ...state.messageIdCache,
          [chat_id]: new Set(deduped.map((m) => m.id)),
        },
      };
    });
  },

  prependMessages: (chat_id, older) => {
    set((state) => {
      if (state.selectedConversation?.chat_id !== chat_id) return state;
      const merged = dedupeMessagesById([...older, ...state.messages]);
      return {
        messages: merged,
        isLoadingMore: false,
        hasMoreMessages: older.length >= 50,
        messageIdCache: {
          ...state.messageIdCache,
          [chat_id]: new Set(merged.map((m) => m.id)),
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

      // Mise à jour du lastMessage + retri pour remonter la conversation en haut
      const updatedConversations = state.conversations
        .map((c) =>
          c.chat_id === message.chat_id
            ? {
                ...c,
                lastMessage: message,
                last_activity_at: message.timestamp,
                unreadCount: isActive
                  ? 0
                  : message.from_me
                    ? (c.unreadCount ?? 0)
                    : (c.unreadCount ?? 0) + 1,
              }
            : c,
        )
        .sort((a, b) => {
          const aTime = a.last_activity_at?.getTime() ?? a.updatedAt.getTime();
          const bTime = b.last_activity_at?.getTime() ?? b.updatedAt.getTime();
          return bTime - aTime;
        });

      return {
        messages: updatedMessages,
        conversations: updatedConversations,
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

      // Si la conversation est maintenant fermée, la retirer de la liste
      if (conversationWithUnread.status === 'fermé') {
        return {
          conversations: state.conversations.filter(
            (c) => c.chat_id !== updatedConversation.chat_id,
          ),
          selectedConversation: isSelected ? null : state.selectedConversation,
          messages: isSelected ? [] : state.messages,
        };
      }

      // Mise à jour + retri par last_activity_at DESC pour remonter la conversation active
      const newConversations = state.conversations
        .map((c) =>
          c.chat_id === updatedConversation.chat_id ? conversationWithUnread : c,
        )
        .sort((a, b) => {
          const aTime = a.last_activity_at?.getTime() ?? a.updatedAt.getTime();
          const bTime = b.last_activity_at?.getTime() ?? b.updatedAt.getTime();
          return bTime - aTime;
        });

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
        ...state.conversations.filter((c) => c.chat_id !== newConversation.chat_id),
      ],
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
