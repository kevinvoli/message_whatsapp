/**
 * TICKET-08-A — Slice messages.
 *
 * Gère : messages[], loading, cache, replyTo, sendMessage, loadMoreMessages.
 * Peut accéder à l'état global (selectedConversation, socket) via `get()`.
 */
import { StateCreator } from 'zustand';
import { Message } from '@/types/chat';
import { logger } from '@/lib/logger';
import type { ChatState } from '@/store/chatStore';
import { computeUnreadCount } from '@/modules/conversations/services/unread-counter.service';

// ─── helpers ────────────────────────────────────────────────────────────────

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function dedupeMessagesById(messages: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const m of messages) map.set(m.id, m);
  return Array.from(map.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

// ─── Slice ───────────────────────────────────────────────────────────────────

export interface MessageSlice {
  messages: Message[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMoreMessages: boolean;
  error: string | null;
  messageIdCache: Record<string, Set<string>>;
  replyToMessage: Message | null;

  setMessages: (chat_id: string, messages: Message[], hasMore?: boolean) => void;
  prependMessages: (chat_id: string, older: Message[], hasMore?: boolean) => void;
  addMessage: (message: Message) => void;
  updateMessageStatus: (
    chat_id: string | undefined,
    messageId: string,
    status: Message['status'],
  ) => void;
  setReplyTo: (message: Message) => void;
  clearReplyTo: () => void;
  sendMessage: (text: string) => void;
  loadMoreMessages: () => void;
}

let isSending = false;

export const createMessageSlice: StateCreator<ChatState, [], [], MessageSlice> = (set, get) => ({
  messages: [],
  isLoading: false,
  isLoadingMore: false,
  hasMoreMessages: true,
  error: null,
  messageIdCache: {},
  replyToMessage: null,

  setMessages: (chat_id, messages, hasMore = false) => {
    set((state) => {
      if (state.selectedConversation?.chat_id !== chat_id) return state;
      const deduped = dedupeMessagesById(messages);
      return {
        messages: deduped,
        isLoading: false,
        hasMoreMessages: hasMore,
        messageIdCache: {
          ...state.messageIdCache,
          [chat_id]: new Set(deduped.map((m) => m.id)),
        },
      };
    });
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
    logger.debug('Message added to store', { chat_id: message.chat_id, message_id: message.id });

    set((state) => {
      const existingIds = state.messageIdCache[message.chat_id];
      if (existingIds?.has(message.id)) return state;

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

      const updatedConversations = state.conversations
        .map((c) =>
          c.chat_id === message.chat_id
            ? {
                ...c,
                lastMessage: message,
                last_activity_at: message.timestamp,
                unreadCount: computeUnreadCount(c, message, isActive),
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

  updateMessageStatus: (chat_id, messageId, status) => {
    set((state) => {
      if (state.selectedConversation?.chat_id !== chat_id) return state;
      return {
        messages: state.messages.map((m) => (m.id === messageId ? { ...m, status } : m)),
      };
    });
  },

  setReplyTo: (message) => set({ replyToMessage: message }),

  clearReplyTo: () => set({ replyToMessage: null }),

  sendMessage: (text) => {
    if (isSending) return;

    const { socket, selectedConversation, replyToMessage } = get();
    if (!socket || !selectedConversation) return;

    isSending = true;

    const tempMessage: Message = {
      id: generateUUID(),
      chat_id: selectedConversation.chat_id,
      text,
      status: 'sending',
      from_me: true,
      timestamp: new Date(),
      from: '',
      quotedMessage: replyToMessage
        ? {
            id: replyToMessage.id,
            text: replyToMessage.text,
            from_name: replyToMessage.from_name,
            from_me: replyToMessage.from_me,
          }
        : undefined,
    };

    set((state) => ({ messages: [...state.messages, tempMessage], replyToMessage: null }));

    logger.debug('Temporary message created', {
      chat_id: selectedConversation.chat_id,
      temp_id: tempMessage.id,
    });

    socket.emit('message:send', {
      chat_id: selectedConversation.chat_id,
      text,
      tempId: tempMessage.id,
      quotedMessageId: replyToMessage?.id,
    });

    setTimeout(() => { isSending = false; }, 500);
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
});
