import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from '@/store/chatStore';

vi.mock('@/lib/api');
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  useChatStore.getState().reset();
});

describe('chatStore — état initial', () => {
  it('conversations est vide', () => {
    expect(useChatStore.getState().conversations).toEqual([]);
  });

  it('selectedConversation est null', () => {
    expect(useChatStore.getState().selectedConversation).toBeNull();
  });

  it('totalUnread vaut 0', () => {
    expect(useChatStore.getState().totalUnread).toBe(0);
  });

  it('sendError est null', () => {
    expect(useChatStore.getState().sendError).toBeNull();
  });
});

describe('chatStore — setTotalUnread', () => {
  it('met à jour totalUnread', () => {
    useChatStore.getState().setTotalUnread(5);
    expect(useChatStore.getState().totalUnread).toBe(5);
  });
});

describe('chatStore — setSendError', () => {
  it('stocke le message d\'erreur', () => {
    useChatStore.getState().setSendError('Erreur réseau');
    expect(useChatStore.getState().sendError).toBe('Erreur réseau');
  });

  it('accepte null pour effacer l\'erreur', () => {
    useChatStore.getState().setSendError('msg');
    useChatStore.getState().setSendError(null);
    expect(useChatStore.getState().sendError).toBeNull();
  });
});

describe('chatStore — reset', () => {
  it('remet l\'état à son état initial', () => {
    useChatStore.getState().setTotalUnread(99);
    useChatStore.getState().setSendError('err');
    useChatStore.getState().reset();
    expect(useChatStore.getState().totalUnread).toBe(0);
    expect(useChatStore.getState().sendError).toBeNull();
    expect(useChatStore.getState().conversations).toEqual([]);
  });
});
