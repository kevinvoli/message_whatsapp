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


interface ConversationCursor {
  activityAt: string;
  chatId: string;
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
  totalUnread: number;

  // Pagination conversations (serveur)
  hasMoreConversations: boolean;
  isLoadingMoreConversations: boolean;
  conversationCursor: ConversationCursor | null;
  /** Terme de recherche actif — transmis au serveur pour filtrer avant pagination */
  currentSearch: string;

  // Tableaux indépendants par onglet
  conversationsUnread: Conversation[];
  isLoadingUnread: boolean;
  conversationsNouveau: Conversation[];
  isLoadingNouveau: boolean;

  // Actions
  setSocket: (socket: Socket | null) => void;
  /** Recharge depuis la page 1. Si search est fourni, le backend filtre côté serveur. */
  loadConversations: (search?: string) => void;
  loadUnreadConversations: (search?: string) => void;
  loadNouveauConversations: (search?: string) => void;
  setUnreadConversations: (conversations: Conversation[]) => void;
  setNouveauConversations: (conversations: Conversation[]) => void;
  loadMoreConversations: () => void;
  selectConversation: (chat_id: string) => void;
  sendMessage: (text: string) => void;
  setReplyTo: (message: Message) => void;
  clearReplyTo: () => void;
  onTypingStart: (chat_id: string) => void;
  onTypingStop: (chat_id: string) => void;
  changeConversationStatus: (chat_id: string, status: ConversationStatus) => void;
  loadMoreMessages: () => void;

  // Setters for WebSocket events
  setConversations: (conversations: Conversation[], hasMore?: boolean, cursor?: ConversationCursor | null) => void;
  appendConversations: (conversations: Conversation[], hasMore: boolean, cursor: ConversationCursor | null) => void;
  setMessages: (chat_id: string, messages: Message[], hasMore?: boolean) => void;
  prependMessages: (chat_id: string, older: Message[], hasMore?: boolean) => void;
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
  setTotalUnread: (count: number) => void;

  // Cooldown sélection conversations non lues
  lastUnreadOpenedAt: number | null;
  readCooldownSeconds: number;
  showCooldownModal: boolean;
  setCooldownConfig: (seconds: number) => void;
  cooldownRemainingMs: () => number;
  setCooldownModal: (v: boolean) => void;

  /** Unread count de la conversation en cours de chargement (avant reset optimiste) */
  pendingConversationUnreadCount: number;
  /** Réinitialise la sélection comme si aucune conversation n'avait été cliquée */
  clearSelectedConversation: () => void;

  reset: () => void;
}

const initialState: Omit<
  ChatState,
  | "setSocket"
  | "loadConversations"
  | "loadMoreConversations"
  | "loadUnreadConversations"
  | "loadNouveauConversations"
  | "setUnreadConversations"
  | "setNouveauConversations"
  | "selectConversation"
  | "sendMessage"
  | "setReplyTo"
  | "clearReplyTo"
  | "setConversations"
  | "appendConversations"
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
  | "setTotalUnread"
  | "setCooldownConfig"
  | "cooldownRemainingMs"
  | "setCooldownModal"
  | "clearSelectedConversation"
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
  totalUnread: 0,
  hasMoreConversations: false,
  isLoadingMoreConversations: false,
  conversationCursor: null,
  currentSearch: '',
  conversationsUnread: [],
  isLoadingUnread: false,
  conversationsNouveau: [],
  isLoadingNouveau: false,
  lastUnreadOpenedAt: null,
  readCooldownSeconds: 120,
  showCooldownModal: false,
  pendingConversationUnreadCount: 0,
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

  loadConversations: (search?: string) => {
    const { socket } = get();
    if (!socket) return;
    const searchTerm = search ?? '';
    set({ isLoading: true, conversationCursor: null, hasMoreConversations: false, currentSearch: searchTerm });
    const payload: { search?: string; tab: string } = { tab: 'tous' };
    if (searchTerm) payload.search = searchTerm;
    socket.emit("conversations:get", payload);
  },

  loadUnreadConversations: (search?: string) => {
    const { socket } = get();
    if (!socket) return;
    set({ isLoadingUnread: true });
    const payload: { unreadOnly: boolean; tab: string; search?: string } = { unreadOnly: true, tab: 'unread' };
    if (search) payload.search = search;
    socket.emit('conversations:get', payload);
  },

  loadNouveauConversations: (search?: string) => {
    const { socket } = get();
    if (!socket) return;
    set({ isLoadingNouveau: true });
    const payload: { nouveauOnly: boolean; tab: string; search?: string } = { nouveauOnly: true, tab: 'nouveau' };
    if (search) payload.search = search;
    socket.emit('conversations:get', payload);
  },

  setUnreadConversations: (conversations: Conversation[]) => {
    const selectedChatId = get().selectedConversation?.chat_id;
    const normalized = selectedChatId
      ? conversations.map((c) => c.chat_id === selectedChatId ? { ...c, unreadCount: 0 } : c)
      : conversations;
    set({
      conversationsUnread: normalized,
      isLoadingUnread: false,
      totalUnread: normalized.filter((c) => c.unreadCount > 0).length,
    });
  },

  setNouveauConversations: (conversations: Conversation[]) => {
    const selectedChatId = get().selectedConversation?.chat_id;
    const normalized = selectedChatId
      ? conversations.map((c) => c.chat_id === selectedChatId ? { ...c, unreadCount: 0 } : c)
      : conversations;
    set({ conversationsNouveau: normalized, isLoadingNouveau: false });
  },

  loadMoreConversations: () => {
    const { socket, hasMoreConversations, isLoadingMoreConversations, conversationCursor, currentSearch } = get();
    if (!socket || !hasMoreConversations || isLoadingMoreConversations || !conversationCursor) return;

    set({ isLoadingMoreConversations: true });
    const payload: { cursor: ConversationCursor; search?: string } = { cursor: conversationCursor };
    if (currentSearch) payload.search = currentSearch;
    socket.emit("conversations:get", payload);
  },

  selectConversation: (chat_id: string) => {
    const state = get();
    const conversation =
      state.conversations.find((c) => c.chat_id === chat_id) ??
      state.conversationsUnread.find((c) => c.chat_id === chat_id) ??
      state.conversationsNouveau.find((c) => c.chat_id === chat_id);
    if (!conversation) return;

    const originalUnreadCount = conversation.unreadCount ?? 0;

    // Cooldown : uniquement pour les conversations ayant des messages non lus
    if (originalUnreadCount > 0) {
      const remaining = state.cooldownRemainingMs();
      if (remaining > 0) {
        set({ showCooldownModal: true });
        return;
      }
      set({ lastUnreadOpenedAt: Date.now() });
    }

    set((s) => ({
      selectedConversation: { ...conversation, unreadCount: 0 },
      conversations: s.conversations.map((c) =>
        c.chat_id === chat_id ? { ...c, unreadCount: 0 } : c,
      ),
      conversationsUnread: s.conversationsUnread.map((c) =>
        c.chat_id === chat_id ? { ...c, unreadCount: 0 } : c,
      ),
      conversationsNouveau: s.conversationsNouveau.map((c) =>
        c.chat_id === chat_id ? { ...c, unreadCount: 0 } : c,
      ),
      messages: [],
      isLoading: true,
      isLoadingMore: false,
      hasMoreMessages: true,
      messageIdCache: {
        ...s.messageIdCache,
        [chat_id]: new Set<string>(),
      },
      replyToMessage: null,
      pendingConversationUnreadCount: originalUnreadCount,
    }));

    // Toujours charger les messages depuis le serveur (pas de pré-chargement au connect)
    get().socket?.emit("messages:get", { chat_id });
    // messages:read et conversation:read sont émis dans setMessages,
    // uniquement quand les messages sont réellement reçus
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

  setTotalUnread: (count: number) => set({ totalUnread: count }),

  setCooldownConfig: (seconds: number) => set({ readCooldownSeconds: seconds }),

  cooldownRemainingMs: (): number => {
    const { lastUnreadOpenedAt, readCooldownSeconds } = get();
    if (lastUnreadOpenedAt === null) return 0;
    const elapsed = Date.now() - lastUnreadOpenedAt;
    const remaining = readCooldownSeconds * 1000 - elapsed;
    return remaining > 0 ? remaining : 0;
  },

  setCooldownModal: (v: boolean) => set({ showCooldownModal: v }),

  clearSelectedConversation: () => {
    set((state) => {
      const pendingId = state.selectedConversation?.chat_id;
      const pendingUnread = state.pendingConversationUnreadCount;
      return {
        selectedConversation: null,
        isLoading: false,
        messages: [],
        pendingConversationUnreadCount: 0,
        conversations: pendingId && pendingUnread > 0
          ? state.conversations.map((c) =>
              c.chat_id === pendingId ? { ...c, unreadCount: pendingUnread } : c,
            )
          : state.conversations,
        conversationsUnread: pendingId && pendingUnread > 0
          ? state.conversationsUnread.map((c) =>
              c.chat_id === pendingId ? { ...c, unreadCount: pendingUnread } : c,
            )
          : state.conversationsUnread,
      };
    });
  },

  removeConversationBychat_id: (chat_id: string) => {
    set((state) => ({
      conversations: state.conversations.filter((c) => c.chat_id !== chat_id),
      conversationsUnread: state.conversationsUnread.filter((c) => c.chat_id !== chat_id),
      conversationsNouveau: state.conversationsNouveau.filter((c) => c.chat_id !== chat_id),
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

  setConversations: (conversations, hasMore = false, cursor = null) => {
    set((state) => {
      const selectedChatId = state.selectedConversation?.chat_id;
      const normalized = selectedChatId
        ? conversations.map((c) =>
            c.chat_id === selectedChatId ? { ...c, unreadCount: 0 } : c,
          )
        : conversations;

      return {
        conversations: normalized,
        isLoading: false,
        // Reset défensif : si un CONVERSATION_LIST de chargement initial arrive
        // alors qu'un loadMore était en vol, on repart d'un état propre.
        isLoadingMoreConversations: false,
        hasMoreConversations: hasMore,
        conversationCursor: cursor ?? null,
      };
    });
  },

  appendConversations: (conversations, hasMore, cursor) => {
    set((state) => {
      const selectedChatId = state.selectedConversation?.chat_id;
      const normalized = selectedChatId
        ? conversations.map((c) =>
            c.chat_id === selectedChatId ? { ...c, unreadCount: 0 } : c,
          )
        : conversations;

      // Merge intelligent : garder la version la plus fraîche si une conversation revient en page suivante
      const existingMap = new Map(state.conversations.map((c) => [c.chat_id, c]));
      for (const c of normalized) {
        const existing = existingMap.get(c.chat_id);
        if (!existing) {
          existingMap.set(c.chat_id, c);
        } else {
          const existingTime = existing.last_activity_at?.getTime() ?? existing.updatedAt.getTime();
          const newTime = c.last_activity_at?.getTime() ?? c.updatedAt.getTime();
          if (newTime > existingTime) {
            existingMap.set(c.chat_id, c);
          }
        }
      }
      const merged = Array.from(existingMap.values());

      return {
        conversations: merged,
        isLoadingMoreConversations: false,
        hasMoreConversations: hasMore,
        conversationCursor: cursor,
      };
    });
  },

  setMessages: (chat_id, messages, hasMore = false) => {
    let wasLoading = false;
    set((state) => {
      if (state.selectedConversation?.chat_id !== chat_id) return state;
      wasLoading = state.isLoading;
      const deduped = dedupeMessagesById(messages);
      return {
        messages: deduped,
        isLoading: false,
        hasMoreMessages: hasMore,
        pendingConversationUnreadCount: 0,
        messageIdCache: {
          ...state.messageIdCache,
          [chat_id]: new Set(deduped.map((m) => m.id)),
        },
      };
    });
    // Notifier le backend uniquement quand les messages sont effectivement chargés
    if (wasLoading) {
      const socket = get().socket;
      socket?.emit("messages:read", { chat_id });
      socket?.emit("conversation:read", { chatId: chat_id });
    }
  },

  prependMessages: (chat_id, older, hasMore = false) => {
    set((state) => {
      if (state.selectedConversation?.chat_id !== chat_id) return state;
      const merged = dedupeMessagesById([...older, ...state.messages]);
      return {
        messages: merged,
        isLoadingMore: false,
        hasMoreMessages: hasMore,
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

      // Mise à jour + retri par last_activity_at DESC pour remonter la conversation active
      const newConversations = state.conversations
        .map((c) => {
          if (c.chat_id !== updatedConversation.chat_id) return c;
          // Préserver les messages préchargés si l'UPSERT n'en inclut pas
          // (mapConversation côté backend n'inclut jamais messages[], seulement last_message)
          const preservedMessages =
            conversationWithUnread.messages && conversationWithUnread.messages.length > 0
              ? conversationWithUnread.messages
              : c.messages ?? [];
          // Préserver contact_summary et priority : les événements UPSERT (réponse
          // commerciale, changement statut…) passent par mapConversation qui n'inclut
          // pas le Contact. Sans cette préservation, chaque UPSERT effacerait la priorité
          // "haute" définie au chargement initial via mapConversationWithContact.
          const preservedContactSummary =
            conversationWithUnread.contact_summary ?? c.contact_summary;
          const preservedPriority =
            conversationWithUnread.priority !== 'moyenne'
              ? conversationWithUnread.priority
              : (c.priority ?? conversationWithUnread.priority);
          return {
            ...conversationWithUnread,
            messages: preservedMessages,
            contact_summary: preservedContactSummary,
            priority: preservedPriority,
            last_activity_at:
              conversationWithUnread.last_activity_at   // valeur de l'UPSERT si présente
              ?? c.last_activity_at                      // sinon : valeur locale existante
              ?? conversationWithUnread.updatedAt,       // dernier fallback
          };
        })
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
        // Appliquer les mêmes préservations que pour la liste
        const selectedContactSummary =
          conversationWithUnread.contact_summary ?? state.selectedConversation?.contact_summary;
        const selectedPriority =
          conversationWithUnread.priority !== 'moyenne'
            ? conversationWithUnread.priority
            : (state.selectedConversation?.priority ?? conversationWithUnread.priority);
        newState.selectedConversation = {
          ...conversationWithUnread,
          contact_summary: selectedContactSummary,
          priority: selectedPriority,
        };

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

  reset: () => set({ ...initialState, lastUnreadOpenedAt: null, readCooldownSeconds: 120, showCooldownModal: false }),
}));
