/**
 * TICKET-08-A â€” FaÃ§ade Zustand unifiÃ©e.
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
import type { TargetProgress } from '@/lib/targetsApi';

// â”€â”€â”€ Type obligation status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type CategoryProgress = { done: number; required: number };
export type ObligationStatus = {
  batchNumber:        number;
  status:             string;
  annulee:            CategoryProgress;
  livree:             CategoryProgress;
  sansCommande:       CategoryProgress;
  qualityCheckPassed: boolean;
  readyForRotation:   boolean;
  reportsRequired:    number;
  reportsSubmitted:   number;
  calledPhones?:      string[];
};

// â”€â”€â”€ Type unifiÃ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type ChatState = SocketSessionSlice &
  MessageSlice &
  ConversationSlice & {
    obligationStatus: ObligationStatus | null;
    setObligationStatus: (s: ObligationStatus | null) => void;
    targetProgress: TargetProgress[] | null;
    setTargetProgress: (p: TargetProgress[] | null) => void;
    reset: () => void;
  };

// â”€â”€â”€ Ã‰tat initial (pour reset) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  blockProgress: { submitted: 0, total: 10 },
  windowRotating: false,
  releasingChatIds: [],
  rotationBlocked: null,
  affinityChats: null,
  obligationStatus: null,
  targetProgress: null,
};

// â”€â”€â”€ Store composÃ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const useChatStore = create<ChatState>()((...a) => ({
  ...createSocketSessionSlice(...a),
  ...createMessageSlice(...a),
  ...createConversationSlice(...a),

  obligationStatus: null,

  setObligationStatus: (s) => {
    const [set] = a;
    set({ obligationStatus: s });
  },

  targetProgress: null,

  setTargetProgress: (p) => {
    const [set] = a;
    set({ targetProgress: p });
  },

  reset: () => {
    const [set] = a;
    set({ ...initialState });
  },
}));
