/**
 * TICKET-10-D — Tests socket front.
 *
 * Scénarios couverts :
 *   SC-01 : CONVERSATION_ASSIGNED → addConversation() appelé
 *   SC-02 : MESSAGE_ADD (ordinaire) → addMessage() appelé
 *   SC-03 : MESSAGE_ADD avec tempId → réconciliation optimistic (setMessages)
 *   SC-04 : CONVERSATION_REMOVED → removeConversationBychat_id() appelé
 *   SC-05 : TOTAL_UNREAD_UPDATE → setTotalUnread() appelé
 *   SC-06 : MESSAGE_STATUS_UPDATE → updateMessageStatus() appelé
 *   SC-07 : TYPING_START (autre user) → setTyping() appelé
 *   SC-08 : TYPING_START (même user) → ignoré
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Socket } from 'socket.io-client';
import type { Message, Conversation } from '@/types/chat';

// ─── Mocks stores ──────────────────────────────────────────────────────────────

const mockChatStore = {
  messages: [] as Message[],
  conversations: [] as Conversation[],
  selectedConversation: null as Conversation | null,
  isLoadingMoreConversations: false,
  addMessage: vi.fn(),
  setMessages: vi.fn(),
  addConversation: vi.fn(),
  updateConversation: vi.fn(),
  removeConversationBychat_id: vi.fn(),
  setConversations: vi.fn(),
  appendConversations: vi.fn(),
  setTotalUnread: vi.fn(),
  setTyping: vi.fn(),
  clearTyping: vi.fn(),
  updateMessageStatus: vi.fn(),
  updateConversationContactSummary: vi.fn(),
  prependMessages: vi.fn(),
};

vi.mock('@/store/chatStore', () => ({
  useChatStore: { getState: () => mockChatStore },
}));

vi.mock('@/store/contactStore', () => ({
  useContactStore: {
    getState: () => ({
      setSelectedContactDetail: vi.fn(),
      upsertContact: vi.fn(),
      removeContact: vi.fn(),
      setCallLogs: vi.fn(),
      addCallLog: vi.fn(),
    }),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Mappers : retournent des objets stables et prévisibles ───────────────────

const FAKE_CONVERSATION: Conversation = {
  id: 'conv-1',
  chat_id: 'c1@c.us',
  poste_id: 'poste-1',
  clientName: 'Client Test',
  clientPhone: '+33600000001',
  lastMessage: null,
  unreadCount: 0,
  status: 'actif',
  source: 'whatsapp',
  priority: 'basse',
  tags: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const FAKE_MESSAGE: Message = {
  id: 'msg-1',
  chat_id: 'c1@c.us',
  text: 'Hello',
  from_me: false,
  from: 'c1@c.us',
  timestamp: new Date('2026-01-01T10:00:00Z'),
  status: 'sent',
};

vi.mock('@/lib/mappers/conversation.mapper', () => ({
  transformToConversation: () => FAKE_CONVERSATION,
}));

vi.mock('@/lib/mappers/message.mapper', () => ({
  transformToMessage: (_raw: unknown) => {
    const raw = _raw as Record<string, unknown>;
    return {
      ...FAKE_MESSAGE,
      id: typeof raw.id === 'string' ? raw.id : FAKE_MESSAGE.id,
      from_me: Boolean(raw.from_me),
      chat_id: typeof raw.chat_id === 'string' ? raw.chat_id : FAKE_MESSAGE.chat_id,
    };
  },
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

import { handleChatEvent } from '@/modules/realtime/services/socket-event-router';

const mockSocket = { emit: vi.fn() } as unknown as Socket;

beforeEach(() => {
  vi.clearAllMocks();
  mockChatStore.messages = [];
  mockChatStore.conversations = [];
  mockChatStore.selectedConversation = null;
  mockChatStore.isLoadingMoreConversations = false;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('handleChatEvent', () => {
  /**
   * SC-01 — CONVERSATION_ASSIGNED → addConversation() appelé
   */
  it('SC-01 : CONVERSATION_ASSIGNED → addConversation() avec la conversation transformée', () => {
    handleChatEvent(
      { type: 'CONVERSATION_ASSIGNED', payload: { id: 'conv-1', chat_id: 'c1@c.us' } },
      mockSocket,
      'user-1',
    );

    expect(mockChatStore.addConversation).toHaveBeenCalledOnce();
    expect(mockChatStore.addConversation).toHaveBeenCalledWith(FAKE_CONVERSATION);
    expect(mockChatStore.updateConversation).not.toHaveBeenCalled();
  });

  /**
   * SC-02 — MESSAGE_ADD ordinaire → addMessage() appelé
   */
  it('SC-02 : MESSAGE_ADD (sans tempId) → addMessage() appelé, setMessages() ignoré', () => {
    handleChatEvent(
      { type: 'MESSAGE_ADD', payload: { id: 'msg-1', chat_id: 'c1@c.us', from_me: false } },
      mockSocket,
      'user-1',
    );

    expect(mockChatStore.addMessage).toHaveBeenCalledOnce();
    expect(mockChatStore.addMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-1' }));
    expect(mockChatStore.setMessages).not.toHaveBeenCalled();
  });

  /**
   * SC-03 — MESSAGE_ADD avec tempId → réconciliation optimistic
   * Le message temporaire (tempId) est remplacé par le vrai message via setMessages().
   */
  it('SC-03 : MESSAGE_ADD avec tempId → setMessages() remplace le message temporaire', () => {
    const tempId = 'temp-abc';
    const tempMessage: Message = {
      ...FAKE_MESSAGE,
      id: tempId,
      from_me: true,
      status: 'sending',
    };
    mockChatStore.messages = [tempMessage];

    handleChatEvent(
      {
        type: 'MESSAGE_ADD',
        payload: { id: 'real-id', chat_id: 'c1@c.us', from_me: true, tempId },
      },
      mockSocket,
      'user-1',
    );

    expect(mockChatStore.setMessages).toHaveBeenCalledOnce();
    const [chatId, updatedMessages] = mockChatStore.setMessages.mock.calls[0] as [string, Message[]];
    expect(chatId).toBe('c1@c.us');
    expect(updatedMessages[0].id).toBe('real-id');
    expect(mockChatStore.addMessage).not.toHaveBeenCalled();
  });

  /**
   * SC-04 — CONVERSATION_REMOVED → removeConversationBychat_id() appelé
   */
  it('SC-04 : CONVERSATION_REMOVED → removeConversationBychat_id() appelé', () => {
    handleChatEvent(
      { type: 'CONVERSATION_REMOVED', payload: { chat_id: 'c1@c.us' } },
      mockSocket,
      'user-1',
    );

    expect(mockChatStore.removeConversationBychat_id).toHaveBeenCalledOnce();
    expect(mockChatStore.removeConversationBychat_id).toHaveBeenCalledWith('c1@c.us');
  });

  /**
   * SC-05 — TOTAL_UNREAD_UPDATE → setTotalUnread() appelé
   */
  it('SC-05 : TOTAL_UNREAD_UPDATE → setTotalUnread() appelé avec le bon compte', () => {
    handleChatEvent(
      { type: 'TOTAL_UNREAD_UPDATE', payload: { totalUnread: 7 } },
      mockSocket,
      'user-1',
    );

    expect(mockChatStore.setTotalUnread).toHaveBeenCalledOnce();
    expect(mockChatStore.setTotalUnread).toHaveBeenCalledWith(7);
  });

  /**
   * SC-06 — MESSAGE_STATUS_UPDATE → updateMessageStatus() appelé
   */
  it('SC-06 : MESSAGE_STATUS_UPDATE → updateMessageStatus() appelé', () => {
    handleChatEvent(
      {
        type: 'MESSAGE_STATUS_UPDATE',
        payload: { chat_id: 'c1@c.us', message_id: 'msg-1', status: 'delivered' },
      },
      mockSocket,
      'user-1',
    );

    expect(mockChatStore.updateMessageStatus).toHaveBeenCalledOnce();
    expect(mockChatStore.updateMessageStatus).toHaveBeenCalledWith('c1@c.us', 'msg-1', 'delivered');
  });

  /**
   * SC-07 — TYPING_START d'un autre utilisateur → setTyping() appelé
   */
  it('SC-07 : TYPING_START (autre commercial) → setTyping() appelé', () => {
    handleChatEvent(
      { type: 'TYPING_START', payload: { chat_id: 'c1@c.us', commercial_id: 'other-user' } },
      mockSocket,
      'user-1',
    );

    expect(mockChatStore.setTyping).toHaveBeenCalledOnce();
    expect(mockChatStore.setTyping).toHaveBeenCalledWith('c1@c.us');
  });

  /**
   * SC-08 — TYPING_START du même utilisateur → ignoré (évite l'écho du propre typing)
   */
  it('SC-08 : TYPING_START (même user) → setTyping() ignoré', () => {
    handleChatEvent(
      { type: 'TYPING_START', payload: { chat_id: 'c1@c.us', commercial_id: 'user-1' } },
      mockSocket,
      'user-1',
    );

    expect(mockChatStore.setTyping).not.toHaveBeenCalled();
  });
});
