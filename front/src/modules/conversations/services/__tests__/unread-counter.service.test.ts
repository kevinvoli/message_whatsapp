import { describe, expect, it } from 'vitest';
import { computeUnreadCount } from '../unread-counter.service';
import type { Conversation, Message } from '@/types/chat';

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    chat_id: 'chat-1',
    poste_id: 'poste-1',
    clientName: 'Client',
    clientPhone: '+33612345678',
    lastMessage: null,
    unreadCount: 0,
    status: 'actif',
    source: 'whatsapp',
    priority: 'moyenne',
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    text: 'hello',
    timestamp: new Date(),
    from: '+33612345678',
    from_me: false,
    chat_id: 'chat-1',
    ...overrides,
  };
}

describe('computeUnreadCount', () => {
  it('renvoie 0 quand la conversation est active', () => {
    const conv = makeConversation({ unreadCount: 5 });
    const msg = makeMessage();
    expect(computeUnreadCount(conv, msg, true)).toBe(0);
  });

  it('renvoie 0 si la conversation est active même pour un message envoyé', () => {
    const conv = makeConversation({ unreadCount: 3 });
    const msg = makeMessage({ from_me: true });
    expect(computeUnreadCount(conv, msg, true)).toBe(0);
  });

  it('préserve le compteur quand le message vient de l\'agent (from_me)', () => {
    const conv = makeConversation({ unreadCount: 4 });
    const msg = makeMessage({ from_me: true });
    expect(computeUnreadCount(conv, msg, false)).toBe(4);
  });

  it('utilise 0 comme valeur par défaut si unreadCount est null sur message agent', () => {
    const conv = makeConversation({ unreadCount: null as unknown as number });
    const msg = makeMessage({ from_me: true });
    expect(computeUnreadCount(conv, msg, false)).toBe(0);
  });

  it('incrémente le compteur quand un message client arrive sur conversation inactive', () => {
    const conv = makeConversation({ unreadCount: 2 });
    const msg = makeMessage({ from_me: false });
    expect(computeUnreadCount(conv, msg, false)).toBe(3);
  });

  it('incrémente à 1 si unreadCount initial null', () => {
    const conv = makeConversation({ unreadCount: null as unknown as number });
    const msg = makeMessage({ from_me: false });
    expect(computeUnreadCount(conv, msg, false)).toBe(1);
  });
});
