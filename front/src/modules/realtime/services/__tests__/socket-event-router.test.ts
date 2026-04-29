import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mocks store ────────────────────────────────────────────────────────────────
const chatState = {
  messages: [] as { id: string }[],
  conversations: [] as { chat_id: string; clientName: string }[],
  selectedConversation: null as { chat_id: string } | null,
  isLoadingMoreConversations: false,
  currentSearch: '',
  obligationStatus: null,
  setMessages: vi.fn(),
  prependMessages: vi.fn(),
  addMessage: vi.fn(),
  updateConversation: vi.fn(),
  addConversation: vi.fn(),
  removeConversationBychat_id: vi.fn(),
  setConversations: vi.fn(),
  appendConversations: vi.fn(),
  setBlockProgress: vi.fn(),
  setTotalUnread: vi.fn(),
  setRotationBlocked: vi.fn(),
  setReleasingChatIds: vi.fn(),
  setWindowRotating: vi.fn(),
  setTargetProgress: vi.fn(),
  setTyping: vi.fn(),
  clearTyping: vi.fn(),
  patchConversation: vi.fn(),
  loadConversations: vi.fn(),
  setObligationStatus: vi.fn(),
};

const contactState = {
  upsertContact: vi.fn(),
  setCallLogs: vi.fn(),
  addCallLog: vi.fn(),
};

vi.mock('@/store/chatStore', () => ({
  useChatStore: { getState: () => chatState },
}));

vi.mock('@/store/contactStore', () => ({
  useContactStore: { getState: () => contactState },
}));

vi.mock('@/lib/mappers/message.mapper', () => ({
  transformToMessage: vi.fn((p: unknown) => ({ id: 'msg-1', chat_id: 'chat-1', from_me: false, text: 'hello', ...p })),
}));

vi.mock('@/lib/mappers/conversation.mapper', () => ({
  transformToConversation: vi.fn((p: unknown) => ({ chat_id: 'chat-1', clientName: 'Client', ...p })),
}));

vi.mock('@/types/chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/types/chat')>();
  return {
    ...actual,
    transformToContact: vi.fn((p: unknown) => ({ id: 'contact-1', ...p })),
    transformToCallLog: vi.fn((p: unknown) => ({ id: 'log-1', ...p })),
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { handleChatEvent, handleContactEvent } from '../socket-event-router';

const mockSocket = { emit: vi.fn() } as unknown as import('socket.io-client').Socket;

beforeEach(() => {
  vi.clearAllMocks();
  chatState.messages = [];
  chatState.conversations = [];
  chatState.selectedConversation = null;
  chatState.isLoadingMoreConversations = false;
  chatState.currentSearch = '';
});

describe('handleChatEvent', () => {
  describe('MESSAGE_ADD', () => {
    it('appelle addMessage si pas de tempId', () => {
      handleChatEvent({ type: 'MESSAGE_ADD', payload: { id: 'msg-1', chat_id: 'chat-1', from_me: false } }, mockSocket, 'user-1');
      expect(chatState.addMessage).toHaveBeenCalledOnce();
    });

    it('remplace le message temporaire si tempId correspond', () => {
      chatState.messages = [{ id: 'temp-xyz' }];
      handleChatEvent({ type: 'MESSAGE_ADD', payload: { id: 'msg-real', tempId: 'temp-xyz' } }, mockSocket, 'user-1');
      expect(chatState.setMessages).toHaveBeenCalledOnce();
      expect(chatState.addMessage).not.toHaveBeenCalled();
    });

    it('émet messages:read si message reçu dans la conversation sélectionnée', () => {
      chatState.selectedConversation = { chat_id: 'chat-1' };
      handleChatEvent({ type: 'MESSAGE_ADD', payload: { chat_id: 'chat-1', from_me: false } }, mockSocket, 'user-1');
      expect(mockSocket.emit).toHaveBeenCalledWith('messages:read', { chat_id: 'chat-1' });
    });

    it('n\'émet pas messages:read pour ses propres messages', () => {
      chatState.selectedConversation = { chat_id: 'chat-1' };
      vi.mocked(vi.importMock('@/lib/mappers/message.mapper') as never);
      handleChatEvent({ type: 'MESSAGE_ADD', payload: { chat_id: 'chat-1', from_me: true } }, mockSocket, 'user-1');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('MESSAGE_LIST', () => {
    it('appelle setMessages avec la liste transformée', () => {
      handleChatEvent({
        type: 'MESSAGE_LIST',
        payload: { chat_id: 'chat-1', messages: [{ id: 'm1' }, { id: 'm2' }], hasMore: true },
      }, mockSocket, 'user-1');
      expect(chatState.setMessages).toHaveBeenCalledWith('chat-1', expect.any(Array), true);
    });
  });

  describe('MESSAGE_LIST_PREPEND', () => {
    it('appelle prependMessages', () => {
      handleChatEvent({
        type: 'MESSAGE_LIST_PREPEND',
        payload: { chat_id: 'chat-1', messages: [{ id: 'm1' }], hasMore: false },
      }, mockSocket, 'user-1');
      expect(chatState.prependMessages).toHaveBeenCalledWith('chat-1', expect.any(Array), false);
    });
  });

  describe('CONVERSATION_UPSERT', () => {
    it('appelle updateConversation', () => {
      handleChatEvent({ type: 'CONVERSATION_UPSERT', payload: { chat_id: 'chat-1' } }, mockSocket, 'user-1');
      expect(chatState.updateConversation).toHaveBeenCalledOnce();
    });
  });

  describe('CONVERSATION_REMOVED', () => {
    it('appelle removeConversationBychat_id', () => {
      handleChatEvent({ type: 'CONVERSATION_REMOVED', payload: { chat_id: 'chat-1' } }, mockSocket, 'user-1');
      expect(chatState.removeConversationBychat_id).toHaveBeenCalledWith('chat-1');
    });
  });

  describe('CONVERSATION_ASSIGNED', () => {
    it('appelle addConversation', () => {
      handleChatEvent({ type: 'CONVERSATION_ASSIGNED', payload: { chat_id: 'chat-1' } }, mockSocket, 'user-1');
      expect(chatState.addConversation).toHaveBeenCalledOnce();
    });
  });

  describe('CONVERSATION_LIST', () => {
    it('appelle setConversations (ancien format tableau)', () => {
      handleChatEvent({
        type: 'CONVERSATION_LIST',
        payload: [{ chat_id: 'c1' }, { chat_id: 'c2' }],
      }, mockSocket, 'user-1');
      expect(chatState.setConversations).toHaveBeenCalledWith(expect.any(Array), false, null);
    });

    it('appelle setConversations (nouveau format objet)', () => {
      handleChatEvent({
        type: 'CONVERSATION_LIST',
        payload: { conversations: [{ chat_id: 'c1' }], hasMore: true, nextCursor: { id: 'x' } },
      }, mockSocket, 'user-1');
      expect(chatState.setConversations).toHaveBeenCalledWith(expect.any(Array), true, { id: 'x' });
    });

    it('appelle appendConversations si isLoadingMoreConversations=true', () => {
      chatState.isLoadingMoreConversations = true;
      handleChatEvent({
        type: 'CONVERSATION_LIST',
        payload: { conversations: [{ chat_id: 'c1' }], hasMore: false, nextCursor: null },
      }, mockSocket, 'user-1');
      expect(chatState.appendConversations).toHaveBeenCalledOnce();
      expect(chatState.setConversations).not.toHaveBeenCalled();
    });

    it('appelle setBlockProgress si blockProgress inclus dans le payload', () => {
      handleChatEvent({
        type: 'CONVERSATION_LIST',
        payload: { conversations: [], hasMore: false, nextCursor: null, blockProgress: { submitted: 3, total: 10 } },
      }, mockSocket, 'user-1');
      expect(chatState.setBlockProgress).toHaveBeenCalledWith({ submitted: 3, total: 10 });
    });
  });

  describe('TOTAL_UNREAD_UPDATE', () => {
    it('appelle setTotalUnread', () => {
      handleChatEvent({ type: 'TOTAL_UNREAD_UPDATE', payload: { totalUnread: 7 } }, mockSocket, 'user-1');
      expect(chatState.setTotalUnread).toHaveBeenCalledWith(7);
    });
  });

  describe('WINDOW_BLOCK_PROGRESS', () => {
    it('appelle setBlockProgress', () => {
      handleChatEvent({ type: 'WINDOW_BLOCK_PROGRESS', payload: { submitted: 5, total: 10 } }, mockSocket, 'user-1');
      expect(chatState.setBlockProgress).toHaveBeenCalledWith({ submitted: 5, total: 10 });
    });
  });

  describe('WINDOW_ROTATED', () => {
    it('déclenche la séquence de rotation', () => {
      vi.useFakeTimers();
      handleChatEvent({
        type: 'WINDOW_ROTATED',
        payload: { releasedChatIds: ['c1', 'c2'], promotedChatIds: [] },
      }, mockSocket, 'user-1');
      expect(chatState.setRotationBlocked).toHaveBeenCalledWith(null);
      expect(chatState.setReleasingChatIds).toHaveBeenCalledWith(['c1', 'c2']);
      expect(chatState.setWindowRotating).toHaveBeenCalledWith(true);
      vi.advanceTimersByTime(500);
      expect(chatState.setReleasingChatIds).toHaveBeenCalledWith([]);
      expect(chatState.setWindowRotating).toHaveBeenCalledWith(false);
      vi.useRealTimers();
    });
  });

  describe('WINDOW_ROTATION_BLOCKED', () => {
    it('met à jour blockProgress et rotationBlocked', () => {
      handleChatEvent({
        type: 'WINDOW_ROTATION_BLOCKED',
        payload: { reason: 'quality_check_failed', progress: { submitted: 2, total: 10 } },
      }, mockSocket, 'user-1');
      expect(chatState.setBlockProgress).toHaveBeenCalledWith({ submitted: 2, total: 10 });
      expect(chatState.setRotationBlocked).toHaveBeenCalledWith({ reason: 'quality_check_failed' });
    });

    it('met à jour obligationStatus si fourni', () => {
      const obligations = { annulee: { required: 2, done: 0 } };
      handleChatEvent({
        type: 'WINDOW_ROTATION_BLOCKED',
        payload: { reason: 'call_obligations_incomplete', progress: { submitted: 0, total: 5 }, obligations },
      }, mockSocket, 'user-1');
      expect(chatState.setObligationStatus).toHaveBeenCalledWith(obligations);
    });
  });

  describe('TYPING_START / TYPING_STOP', () => {
    it('TYPING_START appelle setTyping', () => {
      handleChatEvent({ type: 'TYPING_START', payload: { chat_id: 'chat-1' } }, mockSocket, 'user-1');
      expect(chatState.setTyping).toHaveBeenCalledWith('chat-1');
    });

    it('TYPING_START ignore l\'événement si c\'est l\'utilisateur lui-même', () => {
      handleChatEvent({ type: 'TYPING_START', payload: { chat_id: 'chat-1', commercial_id: 'user-1' } }, mockSocket, 'user-1');
      expect(chatState.setTyping).not.toHaveBeenCalled();
    });

    it('TYPING_STOP appelle clearTyping', () => {
      handleChatEvent({ type: 'TYPING_STOP', payload: { chat_id: 'chat-1' } }, mockSocket, 'user-1');
      expect(chatState.clearTyping).toHaveBeenCalledWith('chat-1');
    });
  });

  describe('TARGET_PROGRESS_UPDATE', () => {
    it('appelle setTargetProgress', () => {
      const progress = [{ id: 'tp-1', value: 50 }];
      handleChatEvent({ type: 'TARGET_PROGRESS_UPDATE', payload: progress }, mockSocket, 'user-1');
      expect(chatState.setTargetProgress).toHaveBeenCalledWith(progress);
    });
  });
});
