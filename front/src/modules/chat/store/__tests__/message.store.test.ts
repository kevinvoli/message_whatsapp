import { vi, describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/modules/conversations/services/unread-counter.service', () => ({
  computeUnreadCount: vi.fn((conv, msg, isActive) => isActive ? 0 : (conv.unreadCount ?? 0) + 1),
}));

import { useChatStore } from '@/store/chatStore';
import type { Message, Conversation } from '@/types/chat';

function makeMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    chat_id: 'chat-1',
    text: 'Bonjour',
    from_me: false,
    from_name: 'Client',
    status: 'delivered',
    timestamp: new Date('2026-01-01T10:00:00Z'),
    from: 'client',
    medias: [],
    ...overrides,
  } as unknown as Message;
}

function makeConv(overrides = {}): Conversation {
  return {
    chat_id: 'chat-1',
    clientName: 'Client',
    status: 'actif',
    unreadCount: 0,
    last_activity_at: new Date('2026-01-01T09:00:00Z'),
    updatedAt: new Date('2026-01-01T09:00:00Z'),
    ...overrides,
  } as unknown as Conversation;
}

beforeEach(() => {
  act(() => useChatStore.getState().reset());
});

describe('MessageSlice — setMessages', () => {
  it('ne met pas à jour si chat_id ne correspond pas à selectedConversation', () => {
    act(() => {
      useChatStore.setState({ selectedConversation: makeConv({ chat_id: 'other' }) });
      useChatStore.getState().setMessages('chat-1', [makeMsg()]);
    });
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it('met à jour messages si chat_id correspond', () => {
    act(() => {
      useChatStore.setState({ selectedConversation: makeConv({ chat_id: 'chat-1' }) });
      useChatStore.getState().setMessages('chat-1', [makeMsg(), makeMsg({ id: 'msg-2' })]);
    });
    expect(useChatStore.getState().messages).toHaveLength(2);
  });

  it('déduplique les messages par id', () => {
    act(() => {
      useChatStore.setState({ selectedConversation: makeConv({ chat_id: 'chat-1' }) });
      useChatStore.getState().setMessages('chat-1', [makeMsg(), makeMsg()]);
    });
    expect(useChatStore.getState().messages).toHaveLength(1);
  });

  it('met hasMoreMessages à true si hasMore=true', () => {
    act(() => {
      useChatStore.setState({ selectedConversation: makeConv({ chat_id: 'chat-1' }) });
      useChatStore.getState().setMessages('chat-1', [], true);
    });
    expect(useChatStore.getState().hasMoreMessages).toBe(true);
  });

  it('peuple le messageIdCache', () => {
    act(() => {
      useChatStore.setState({ selectedConversation: makeConv({ chat_id: 'chat-1' }) });
      useChatStore.getState().setMessages('chat-1', [makeMsg({ id: 'abc' })]);
    });
    expect(useChatStore.getState().messageIdCache['chat-1']?.has('abc')).toBe(true);
  });
});

describe('MessageSlice — prependMessages', () => {
  it('antépose les anciens messages à ceux existants', () => {
    const older = makeMsg({ id: 'old-1', timestamp: new Date('2025-12-31T10:00:00Z') });
    const current = makeMsg({ id: 'msg-1', timestamp: new Date('2026-01-01T10:00:00Z') });
    act(() => {
      useChatStore.setState({
        selectedConversation: makeConv({ chat_id: 'chat-1' }),
        messages: [current],
      });
      useChatStore.getState().prependMessages('chat-1', [older]);
    });
    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0].id).toBe('old-1');
  });
});

describe('MessageSlice — addMessage', () => {
  it('ajoute un message à la conversation sélectionnée', () => {
    act(() => {
      useChatStore.setState({ selectedConversation: makeConv(), conversations: [makeConv()] });
      useChatStore.getState().addMessage(makeMsg({ id: 'new-msg' }));
    });
    expect(useChatStore.getState().messages.some((m) => m.id === 'new-msg')).toBe(true);
  });

  it('n\'ajoute pas si message déjà dans le cache', () => {
    act(() => {
      useChatStore.setState({
        selectedConversation: makeConv(),
        conversations: [makeConv()],
        messageIdCache: { 'chat-1': new Set(['msg-1']) },
      });
      useChatStore.getState().addMessage(makeMsg({ id: 'msg-1' }));
    });
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it('met à jour lastMessage de la conversation', () => {
    const msg = makeMsg({ id: 'msg-new', text: 'Nouveau' });
    act(() => {
      useChatStore.setState({ selectedConversation: makeConv(), conversations: [makeConv()] });
      useChatStore.getState().addMessage(msg);
    });
    const conv = useChatStore.getState().conversations[0];
    expect(conv.lastMessage).toMatchObject({ id: 'msg-new' });
  });

  it('trie les conversations par last_activity_at', () => {
    const conv1 = makeConv({ chat_id: 'c1', last_activity_at: new Date('2026-01-01') });
    const conv2 = makeConv({ chat_id: 'c2', last_activity_at: new Date('2026-01-02') });
    const newMsg = makeMsg({ chat_id: 'c1', id: 'x', timestamp: new Date('2026-01-03') });
    act(() => {
      useChatStore.setState({ selectedConversation: conv1, conversations: [conv1, conv2] });
      useChatStore.getState().addMessage(newMsg);
    });
    expect(useChatStore.getState().conversations[0].chat_id).toBe('c1');
  });
});

describe('MessageSlice — updateMessageStatus', () => {
  it('met à jour le statut du message', () => {
    const msg = makeMsg({ id: 'msg-1', status: 'sent' });
    act(() => {
      useChatStore.setState({ selectedConversation: makeConv(), messages: [msg] });
      useChatStore.getState().updateMessageStatus('chat-1', 'msg-1', 'read');
    });
    expect(useChatStore.getState().messages[0].status).toBe('read');
  });

  it('ne met pas à jour si chat_id différent', () => {
    const msg = makeMsg({ id: 'msg-1', status: 'sent' });
    act(() => {
      useChatStore.setState({ selectedConversation: makeConv({ chat_id: 'other' }), messages: [msg] });
      useChatStore.getState().updateMessageStatus('chat-1', 'msg-1', 'read');
    });
    expect(useChatStore.getState().messages[0].status).toBe('sent');
  });
});

describe('MessageSlice — setReplyTo / clearReplyTo', () => {
  it('setReplyTo définit le message cité', () => {
    const msg = makeMsg();
    act(() => useChatStore.getState().setReplyTo(msg));
    expect(useChatStore.getState().replyToMessage?.id).toBe('msg-1');
  });

  it('clearReplyTo efface le message cité', () => {
    act(() => {
      useChatStore.getState().setReplyTo(makeMsg());
      useChatStore.getState().clearReplyTo();
    });
    expect(useChatStore.getState().replyToMessage).toBeNull();
  });
});

describe('MessageSlice — sendMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Avance le timer isSending (500ms) pour réinitialiser le verrou entre tests
    vi.advanceTimersByTime(600);
    vi.useRealTimers();
  });

  it('émet message:send via socket', () => {
    const mockSocket = { emit: vi.fn() };
    act(() => {
      useChatStore.setState({ socket: mockSocket as never, selectedConversation: makeConv() });
      useChatStore.getState().sendMessage('Bonjour!');
    });
    expect(mockSocket.emit).toHaveBeenCalledWith('message:send', expect.objectContaining({
      chat_id: 'chat-1',
      text: 'Bonjour!',
    }));
  });

  it('ajoute un message temporaire avec status=sending', () => {
    const mockSocket = { emit: vi.fn() };
    act(() => {
      useChatStore.setState({ socket: mockSocket as never, selectedConversation: makeConv() });
      useChatStore.getState().sendMessage('Test');
    });
    const tempMsg = useChatStore.getState().messages.find((m) => m.status === 'sending');
    expect(tempMsg).toBeDefined();
    expect(tempMsg?.text).toBe('Test');
  });

  it('ne fait rien si pas de socket', () => {
    act(() => {
      useChatStore.setState({ socket: null, selectedConversation: makeConv() });
      useChatStore.getState().sendMessage('Test');
    });
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it('inclut quotedMessageId si replyToMessage défini', () => {
    const mockSocket = { emit: vi.fn() };
    const replyMsg = makeMsg({ id: 'reply-id' });
    act(() => {
      useChatStore.setState({
        socket: mockSocket as never,
        selectedConversation: makeConv(),
        replyToMessage: replyMsg,
      });
      useChatStore.getState().sendMessage('Réponse');
    });
    expect(mockSocket.emit).toHaveBeenCalledWith('message:send', expect.objectContaining({
      quotedMessageId: 'reply-id',
    }));
  });
});

describe('MessageSlice — loadMoreMessages', () => {
  it('émet messages:get avec cursor before', () => {
    const mockSocket = { emit: vi.fn() };
    const oldMsg = makeMsg({ id: 'old', timestamp: new Date('2025-12-31T10:00:00Z') });
    act(() => {
      useChatStore.setState({
        socket: mockSocket as never,
        selectedConversation: makeConv(),
        messages: [oldMsg],
        hasMoreMessages: true,
        isLoadingMore: false,
      });
      useChatStore.getState().loadMoreMessages();
    });
    expect(mockSocket.emit).toHaveBeenCalledWith('messages:get', expect.objectContaining({
      chat_id: 'chat-1',
      before: expect.any(String),
    }));
  });

  it('ne fait rien si isLoadingMore=true', () => {
    const mockSocket = { emit: vi.fn() };
    act(() => {
      useChatStore.setState({
        socket: mockSocket as never,
        selectedConversation: makeConv(),
        messages: [makeMsg()],
        hasMoreMessages: true,
        isLoadingMore: true,
      });
      useChatStore.getState().loadMoreMessages();
    });
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
});
