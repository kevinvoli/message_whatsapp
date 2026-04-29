import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { useChatStore, ObligationStatus } from '@/store/chatStore';
import type { Conversation } from '@/types/chat';

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

const baseObligation: ObligationStatus = {
  batchNumber: 1,
  annulee: { done: 0, required: 0 },
  livree: { done: 0, required: 0 },
  sansCommande: { done: 0, required: 0 },
  qualityCheckPassed: false,
  readyForRotation: false,
};

describe('useChatStore', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('a un état initial cohérent', () => {
    const state = useChatStore.getState();
    expect(state.conversations).toEqual([]);
    expect(state.selectedConversation).toBeNull();
    expect(state.messages).toEqual([]);
    expect(state.totalUnread).toBe(0);
    expect(state.obligationStatus).toBeNull();
    expect(state.targetProgress).toBeNull();
  });

  it('setObligationStatus stocke la valeur', () => {
    useChatStore.getState().setObligationStatus(baseObligation);
    expect(useChatStore.getState().obligationStatus).toEqual(baseObligation);
  });

  it('setObligationStatus accepte null', () => {
    useChatStore.getState().setObligationStatus(baseObligation);
    useChatStore.getState().setObligationStatus(null);
    expect(useChatStore.getState().obligationStatus).toBeNull();
  });

  it('setTargetProgress stocke un tableau', () => {
    const progress = [{ id: 't1', name: 'Target', current: 1, target: 5 }] as never;
    useChatStore.getState().setTargetProgress(progress);
    expect(useChatStore.getState().targetProgress).toEqual(progress);
  });

  it('setTotalUnread met à jour le compteur global', () => {
    useChatStore.getState().setTotalUnread(42);
    expect(useChatStore.getState().totalUnread).toBe(42);
  });

  it('setBlockProgress met à jour la progression', () => {
    useChatStore.getState().setBlockProgress({ submitted: 5, total: 10 });
    expect(useChatStore.getState().blockProgress).toEqual({ submitted: 5, total: 10 });
  });

  it('setWindowRotating bascule le flag', () => {
    useChatStore.getState().setWindowRotating(true);
    expect(useChatStore.getState().windowRotating).toBe(true);
    useChatStore.getState().setWindowRotating(false);
    expect(useChatStore.getState().windowRotating).toBe(false);
  });

  it('setReleasingChatIds remplace la liste', () => {
    useChatStore.getState().setReleasingChatIds(['a', 'b']);
    expect(useChatStore.getState().releasingChatIds).toEqual(['a', 'b']);
  });

  it('setRotationBlocked accepte une raison ou null', () => {
    useChatStore.getState().setRotationBlocked({ reason: 'quality_check_failed' });
    expect(useChatStore.getState().rotationBlocked).toEqual({ reason: 'quality_check_failed' });
    useChatStore.getState().setRotationBlocked(null);
    expect(useChatStore.getState().rotationBlocked).toBeNull();
  });

  it('addConversation ajoute une nouvelle conversation en tête', () => {
    const a = makeConversation({ chat_id: 'a' });
    const b = makeConversation({ chat_id: 'b' });
    useChatStore.getState().addConversation(a);
    useChatStore.getState().addConversation(b);
    const list = useChatStore.getState().conversations;
    expect(list.map((c) => c.chat_id)).toEqual(['b', 'a']);
  });

  it('addConversation déduplique sur chat_id', () => {
    const a = makeConversation({ chat_id: 'a', clientName: 'First' });
    const aBis = makeConversation({ chat_id: 'a', clientName: 'Second' });
    useChatStore.getState().addConversation(a);
    useChatStore.getState().addConversation(aBis);
    const list = useChatStore.getState().conversations;
    expect(list).toHaveLength(1);
    expect(list[0].clientName).toBe('Second');
  });

  it('patchConversation modifie une conversation matchant', () => {
    useChatStore.getState().addConversation(makeConversation({ chat_id: 'a', priority: 'moyenne' }));
    useChatStore.getState().patchConversation('a', { priority: 'haute' });
    expect(useChatStore.getState().conversations[0].priority).toBe('haute');
  });

  it('removeConversationBychat_id supprime de la liste', () => {
    useChatStore.getState().addConversation(makeConversation({ chat_id: 'a' }));
    useChatStore.getState().addConversation(makeConversation({ chat_id: 'b' }));
    useChatStore.getState().removeConversationBychat_id('a');
    expect(useChatStore.getState().conversations.map((c) => c.chat_id)).toEqual(['b']);
  });

  it('removeConversationBychat_id vide selectedConversation et messages si correspond', () => {
    useChatStore.setState({ selectedConversation: makeConversation({ chat_id: 'a' }) });
    useChatStore.getState().removeConversationBychat_id('a');
    expect(useChatStore.getState().selectedConversation).toBeNull();
    expect(useChatStore.getState().messages).toEqual([]);
  });

  it('clearTyping supprime un chat_id du typingStatus', () => {
    useChatStore.setState({ typingStatus: { 'chat-1': true, 'chat-2': true } });
    useChatStore.getState().clearTyping('chat-1');
    expect(useChatStore.getState().typingStatus).toEqual({ 'chat-2': true });
  });

  it('updateConversationContactSummary fusionne le summary', () => {
    const conv = makeConversation({
      chat_id: 'a',
      contact_summary: {
        id: 'c1',
        call_status: 'à_appeler',
        call_count: 0,
        is_active: true,
      },
    });
    useChatStore.getState().addConversation(conv);
    useChatStore.getState().updateConversationContactSummary('a', { call_count: 5 });
    expect(useChatStore.getState().conversations[0].contact_summary?.call_count).toBe(5);
    expect(useChatStore.getState().conversations[0].contact_summary?.id).toBe('c1');
  });

  it('reset remet l\'état initial', () => {
    useChatStore.getState().setObligationStatus(baseObligation);
    useChatStore.getState().setTotalUnread(99);
    useChatStore.getState().reset();
    const state = useChatStore.getState();
    expect(state.obligationStatus).toBeNull();
    expect(state.totalUnread).toBe(0);
  });

  it('clearReplyTo vide replyToMessage', () => {
    useChatStore.setState({
      replyToMessage: { id: 'm1', text: 't', timestamp: new Date(), from: '', from_me: false, chat_id: 'c1' },
    });
    useChatStore.getState().clearReplyTo();
    expect(useChatStore.getState().replyToMessage).toBeNull();
  });
});
