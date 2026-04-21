/**
 * TICKET-08-A — Façade Zustand unifiée.
 *
 * `useChatStore` compose les trois slices :
 *   - SocketSessionSlice  (modules/realtime/store/socket-session.store.ts)
 *   - MessageSlice        (modules/chat/store/message.store.ts)
 *   - ConversationSlice   (modules/conversations/store/conversation.store.ts)
 *
 * Tous les imports existants (`import { useChatStore } from '@/store/chatStore'`)
 * continuent de fonctionner sans modification.
 */
import { create } from 'zustand';
import { createSocketSessionSlice, SocketSessionSlice } from '@/modules/realtime/store/socket-session.store';
import { createMessageSlice, MessageSlice } from '@/modules/chat/store/message.store';
import { createConversationSlice, ConversationSlice } from '@/modules/conversations/store/conversation.store';

// ─── Type unifié ─────────────────────────────────────────────────────────────

export type ChatState = SocketSessionSlice &
  MessageSlice &
  ConversationSlice & {
    reset: () => void;
  };

// ─── État initial (pour reset) ────────────────────────────────────────────────

const initialState = {
  socket: null,
  conversations: [],
  selectedConversation: null,
  messages: [],
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
  blockProgress: { validated: 0, total: 10 },
  windowRotating: false,
};

// ─── Store composé ────────────────────────────────────────────────────────────

export const useChatStore = create<ChatState>()((...a) => ({
  ...createSocketSessionSlice(...a),
  ...createMessageSlice(...a),
  ...createConversationSlice(...a),

  reset: () => {
    const [set] = a;
    set({ ...initialState });
  },
}));
