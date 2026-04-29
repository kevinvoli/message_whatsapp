import { vi, describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/modules/conversations/services/conversation-merge.service', () => ({
  mergeConversationInList: vi.fn((convs, incoming) => {
    const idx = convs.findIndex((c: { chat_id: string }) => c.chat_id === incoming.chat_id);
    if (idx === -1) return [incoming, ...convs];
    const updated = [...convs];
    updated[idx] = { ...convs[idx], ...incoming };
    return updated;
  }),
  mergeSelectedConversation: vi.fn((selected, incoming) => {
    if (!selected || selected.chat_id !== incoming.chat_id) return selected;
    return { ...selected, ...incoming };
  }),
}));

vi.mock('@/lib/actionGateApi', () => ({
  getAffinityChats: vi.fn().mockResolvedValue([]),
}), { virtual: true });

import { useChatStore } from '@/store/chatStore';
import type { Conversation } from '@/types/chat';

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    chat_id: 'chat-1',
    clientName: 'Client',
    status: 'actif',
    unreadCount: 2,
    last_poste_message_at: null,
    last_client_message_at: null,
    window_slot: null,
    is_locked: false,
    ...overrides,
  } as unknown as Conversation;
}

beforeEach(() => {
  act(() => useChatStore.getState().reset());
});

describe('ConversationSlice — setConversations', () => {
  it('remplace la liste de conversations', () => {
    const convs = [makeConv({ chat_id: 'c1' }), makeConv({ chat_id: 'c2' })];
    act(() => useChatStore.getState().setConversations(convs));
    expect(useChatStore.getState().conversations).toHaveLength(2);
  });

  it('met à jour hasMoreConversations', () => {
    act(() => useChatStore.getState().setConversations([makeConv()], true));
    expect(useChatStore.getState().hasMoreConversations).toBe(true);
  });

  it('met unreadCount=0 pour la conversation sélectionnée', () => {
    act(() => {
      useChatStore.setState({ selectedConversation: makeConv({ chat_id: 'c1', unreadCount: 5 }) });
      useChatStore.getState().setConversations([makeConv({ chat_id: 'c1', unreadCount: 5 })]);
    });
    const conv = useChatStore.getState().conversations.find((c) => c.chat_id === 'c1');
    expect(conv?.unreadCount).toBe(0);
  });
});

describe('ConversationSlice — appendConversations', () => {
  it('ajoute les conversations à la liste existante', () => {
    act(() => {
      useChatStore.setState({ conversations: [makeConv({ chat_id: 'c1' })] });
      useChatStore.getState().appendConversations([makeConv({ chat_id: 'c2' })], false, null);
    });
    expect(useChatStore.getState().conversations).toHaveLength(2);
    expect(useChatStore.getState().isLoadingMoreConversations).toBe(false);
  });
});

describe('ConversationSlice — updateConversation', () => {
  it('met à jour une conversation existante', () => {
    act(() => {
      useChatStore.setState({ conversations: [makeConv({ chat_id: 'c1', clientName: 'Ancien' })] });
      useChatStore.getState().updateConversation(makeConv({ chat_id: 'c1', clientName: 'Nouveau' }));
    });
    expect(useChatStore.getState().conversations[0].clientName).toBe('Nouveau');
  });

  it('ajoute la conversation si elle n\'existe pas', () => {
    act(() => {
      useChatStore.setState({ conversations: [] });
      useChatStore.getState().updateConversation(makeConv({ chat_id: 'c-new' }));
    });
    expect(useChatStore.getState().conversations).toHaveLength(1);
  });
});

describe('ConversationSlice — setConversations / setTotalUnread', () => {
  it('setTotalUnread met à jour le compteur', () => {
    act(() => useChatStore.getState().setTotalUnread(42));
    expect(useChatStore.getState().totalUnread).toBe(42);
  });
});

describe('ConversationSlice — typing', () => {
  it('setTyping active l\'indicateur pour un chat', () => {
    act(() => useChatStore.getState().setTyping('chat-1'));
    expect(useChatStore.getState().typingStatus['chat-1']).toBe(true);
  });

  it('clearTyping désactive l\'indicateur', () => {
    act(() => {
      useChatStore.getState().setTyping('chat-1');
      useChatStore.getState().clearTyping('chat-1');
    });
    expect(useChatStore.getState().typingStatus['chat-1']).toBeUndefined();
  });
});

describe('ConversationSlice — updateConversationContactSummary', () => {
  it('fusionne le contact summary', () => {
    act(() => {
      useChatStore.setState({ conversations: [makeConv({ chat_id: 'c1' })] });
      useChatStore.getState().updateConversationContactSummary('c1', { clientName: 'Mis à jour' });
    });
    const conv = useChatStore.getState().conversations.find((c) => c.chat_id === 'c1');
    expect(conv?.clientName).toBe('Mis à jour');
  });
});

describe('ConversationSlice — changeConversationStatus', () => {
  it('change le statut d\'une conversation', () => {
    act(() => {
      useChatStore.setState({ conversations: [makeConv({ chat_id: 'c1', status: 'actif' })] });
      useChatStore.getState().changeConversationStatus('c1', 'attente');
    });
    const conv = useChatStore.getState().conversations.find((c) => c.chat_id === 'c1');
    expect(conv?.status).toBe('attente');
  });
});

describe('ConversationSlice — selectConversation', () => {
  it('sélectionne une conversation et remet unreadCount à 0', () => {
    const mockSocket = { emit: vi.fn() };
    act(() => {
      useChatStore.setState({
        socket: mockSocket as never,
        conversations: [makeConv({ chat_id: 'c1', unreadCount: 3 })],
      });
      useChatStore.getState().selectConversation('c1');
    });
    expect(useChatStore.getState().selectedConversation?.chat_id).toBe('c1');
    expect(useChatStore.getState().selectedConversation?.unreadCount).toBe(0);
    expect(mockSocket.emit).toHaveBeenCalledWith('messages:get', { chat_id: 'c1' });
    expect(mockSocket.emit).toHaveBeenCalledWith('messages:read', { chat_id: 'c1' });
  });

  it('crée un placeholder si la conversation n\'est pas dans le store', () => {
    const mockSocket = { emit: vi.fn() };
    act(() => {
      useChatStore.setState({ socket: mockSocket as never, conversations: [] });
      useChatStore.getState().selectConversation('c-unknown');
    });
    expect(useChatStore.getState().selectedConversation?.chat_id).toBe('c-unknown');
  });
});

describe('ConversationSlice — loadConversations', () => {
  it('émet conversations:get via socket', () => {
    const mockSocket = { emit: vi.fn() };
    act(() => {
      useChatStore.setState({ socket: mockSocket as never });
      useChatStore.getState().loadConversations();
    });
    expect(mockSocket.emit).toHaveBeenCalledWith('conversations:get', undefined);
  });

  it('émet conversations:get avec terme de recherche', () => {
    const mockSocket = { emit: vi.fn() };
    act(() => {
      useChatStore.setState({ socket: mockSocket as never });
      useChatStore.getState().loadConversations('dupont');
    });
    expect(mockSocket.emit).toHaveBeenCalledWith('conversations:get', { search: 'dupont' });
  });

  it('ne fait rien si pas de socket', () => {
    act(() => {
      useChatStore.setState({ socket: null });
      useChatStore.getState().loadConversations();
    });
    // Pas d'erreur levée
    expect(useChatStore.getState().conversations).toHaveLength(0);
  });
});
