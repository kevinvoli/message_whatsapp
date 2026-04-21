/**
 * TICKET-08-A — Slice conversations.
 *
 * Gère : liste, sélection, pagination, typing, unread, statuts.
 * Utilise les services purs `conversation-merge.service` et `unread-counter.service`.
 */
import { StateCreator } from 'zustand';
import { ContactSummary, Conversation, ConversationStatus } from '@/types/chat';
import { logger } from '@/lib/logger';
import type { ChatState } from '@/store/chatStore';
import {
  mergeConversationInList,
  mergeSelectedConversation,
} from '@/modules/conversations/services/conversation-merge.service';

export interface ConversationCursor {
  activityAt: string;
  chatId: string;
}

let typingTimeout: NodeJS.Timeout;

export interface BlockProgress {
  validated: number;
  total: number;
}

export interface ConversationSlice {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  typingStatus: Record<string, boolean>;
  totalUnread: number;
  hasMoreConversations: boolean;
  isLoadingMoreConversations: boolean;
  conversationCursor: ConversationCursor | null;
  currentSearch: string;
  blockProgress: BlockProgress;
  windowRotating: boolean;
  releasingChatIds: string[];

  loadConversations: (search?: string) => void;
  loadMoreConversations: () => void;  // conservé pour compat legacy — no-op
  selectConversation: (chat_id: string) => void;
  setBlockProgress: (progress: BlockProgress) => void;
  setWindowRotating: (rotating: boolean) => void;
  setReleasingChatIds: (ids: string[]) => void;

  setConversations: (
    conversations: Conversation[],
    hasMore?: boolean,
    cursor?: ConversationCursor | null,
  ) => void;
  appendConversations: (
    conversations: Conversation[],
    hasMore: boolean,
    cursor: ConversationCursor | null,
  ) => void;
  updateConversation: (conversation: Conversation) => void;
  addConversation: (conversation: Conversation) => void;
  removeConversationBychat_id: (conversationId: string) => void;

  setTyping: (chat_id: string) => void;
  clearTyping: (chat_id: string) => void;
  updateConversationContactSummary: (chatId: string, summary: Partial<ContactSummary>) => void;
  setTotalUnread: (count: number) => void;

  onTypingStart: (chat_id: string) => void;
  onTypingStop: (chat_id: string) => void;
  changeConversationStatus: (chat_id: string, status: ConversationStatus) => void;
}

export const createConversationSlice: StateCreator<
  ChatState,
  [],
  [],
  ConversationSlice
> = (set, get) => ({
  conversations: [],
  selectedConversation: null,
  typingStatus: {},
  totalUnread: 0,
  hasMoreConversations: false,
  isLoadingMoreConversations: false,
  conversationCursor: null,
  currentSearch: '',
  blockProgress: { validated: 0, total: 10 },
  windowRotating: false,
  releasingChatIds: [],

  // ─── Chargement ─────────────────────────────────────────────────────────────

  loadConversations: (search?) => {
    const { socket } = get();
    if (!socket) return;
    const searchTerm = search ?? '';
    set({ isLoading: true, conversationCursor: null, hasMoreConversations: false, currentSearch: searchTerm });
    const payload = searchTerm ? { search: searchTerm } : undefined;
    socket.emit('conversations:get', payload);
  },

  loadMoreConversations: () => {
    const { socket, hasMoreConversations, isLoadingMoreConversations, conversationCursor, currentSearch } = get();
    if (!socket || !hasMoreConversations || isLoadingMoreConversations || !conversationCursor) return;
    set({ isLoadingMoreConversations: true });
    const payload: { cursor: ConversationCursor; search?: string } = { cursor: conversationCursor };
    if (currentSearch) payload.search = currentSearch;
    socket.emit('conversations:get', payload);
  },

  // ─── Sélection ──────────────────────────────────────────────────────────────

  selectConversation: (chat_id) => {
    set((state) => {
      const conversation = state.conversations.find((c) => c.chat_id === chat_id);
      if (!conversation) return state;
      return {
        selectedConversation: { ...conversation, unreadCount: 0 },
        conversations: state.conversations.map((c) =>
          c.chat_id === chat_id ? { ...c, unreadCount: 0 } : c,
        ),
        messages: [],
        isLoading: true,
        isLoadingMore: false,
        hasMoreMessages: true,
        messageIdCache: {
          ...state.messageIdCache,
          [chat_id]: new Set<string>(),
        },
        replyToMessage: null,
      };
    });

    const { socket } = get();
    socket?.emit('messages:get', { chat_id });
    socket?.emit('messages:read', { chat_id });
  },

  // ─── Setters WebSocket ───────────────────────────────────────────────────────

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
      const existingIds = new Set(state.conversations.map((c) => c.chat_id));
      const newOnes = normalized.filter((c) => !existingIds.has(c.chat_id));
      return {
        conversations: [...state.conversations, ...newOnes],
        isLoadingMoreConversations: false,
        hasMoreConversations: hasMore,
        conversationCursor: cursor,
      };
    });
  },

  updateConversation: (updatedConversation) => {
    set((state) => {
      const isSelected = state.selectedConversation?.chat_id === updatedConversation.chat_id;
      logger.debug('Conversation update received', { chat_id: updatedConversation.chat_id });

      const conversationExists = state.conversations.some(
        (c) => c.chat_id === updatedConversation.chat_id,
      );

      const conversationWithUnread: Conversation = {
        ...updatedConversation,
        unreadCount: isSelected ? 0 : (updatedConversation.unreadCount ?? 0),
      };

      if (!conversationExists) {
        if (isSelected) return { selectedConversation: conversationWithUnread };
        return state;
      }

      const newConversations = mergeConversationInList(
        state.conversations,
        conversationWithUnread,
        isSelected,
      );

      const newState: Partial<ChatState> = { conversations: newConversations };

      if (isSelected) {
        const merged = mergeSelectedConversation(
          state.selectedConversation,
          conversationWithUnread,
          state.messages,
        );
        if (merged) {
          newState.selectedConversation = merged.selectedConversation;
          if (merged.messages !== undefined) newState.messages = merged.messages;
        }
      }

      return newState;
    });
  },

  addConversation: (newConversation) => {
    set((state) => ({
      conversations: [
        newConversation,
        ...state.conversations.filter((c) => c.chat_id !== newConversation.chat_id),
      ],
    }));
  },

  removeConversationBychat_id: (chat_id) => {
    set((state) => ({
      conversations: state.conversations.filter((c) => c.chat_id !== chat_id),
      selectedConversation:
        state.selectedConversation?.chat_id === chat_id ? null : state.selectedConversation,
      messages: state.selectedConversation?.chat_id === chat_id ? [] : state.messages,
    }));
  },

  // ─── Typing ─────────────────────────────────────────────────────────────────

  setTyping: (chat_id) => {
    set((state) => ({ typingStatus: { ...state.typingStatus, [chat_id]: true } }));
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
      const next = { ...state.typingStatus };
      delete next[chat_id];
      return { typingStatus: next };
    });
  },

  onTypingStart: (chat_id) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('chat:event', { type: 'TYPING_START', payload: { chat_id } });
  },

  onTypingStop: (chat_id) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('chat:event', { type: 'TYPING_STOP', payload: { chat_id } });
  },

  changeConversationStatus: (chat_id, status) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('chat:event', { type: 'CONVERSATION_STATUS_CHANGE', payload: { chat_id, status } });
    logger.debug('Conversation status change emitted', { chat_id, status });
  },

  // ─── Divers ─────────────────────────────────────────────────────────────────

  updateConversationContactSummary: (chatId, summary) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.chat_id === chatId
          ? { ...c, contact_summary: { ...(c.contact_summary ?? {} as any), ...summary } }
          : c,
      ),
    }));
  },

  setTotalUnread: (count) => set({ totalUnread: count }),

  setBlockProgress: (progress) => set({ blockProgress: progress }),

  setWindowRotating: (rotating) => set({ windowRotating: rotating }),

  setReleasingChatIds: (ids) => set({ releasingChatIds: ids }),
});
