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

// ─── Type obligation status ───────────────────────────────────────────────────

export type CategoryProgress = { done: number; required: number };
export type ObligationStatus = {
  batchNumber:        number;
  annulee:            CategoryProgress;
  livree:             CategoryProgress;
  sansCommande:       CategoryProgress;
  qualityCheckPassed: boolean;
  readyForRotation:   boolean;
};

// ─── Type unifié ─────────────────────────────────────────────────────────────

export type ChatState = SocketSessionSlice &
  MessageSlice &
  ConversationSlice & {
    obligationStatus: ObligationStatus | null;
    setObligationStatus: (s: ObligationStatus | null) => void;
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
  releasingChatIds: [],
  rotationBlocked: null,
  affinityChats: null,
  obligationStatus: null,
};

// ─── Store composé ────────────────────────────────────────────────────────────

export const useChatStore = create<ChatState>()((...a) => ({
  ...createSocketSessionSlice(...a),
  ...createMessageSlice(...a),
  ...createConversationSlice(...a),

  obligationStatus: null,

  setObligationStatus: (s) => {
    const [set] = a;
    set({ obligationStatus: s });
  },

  reset: () => {
    const [set] = a;
    set({ ...initialState });
  },
}));
