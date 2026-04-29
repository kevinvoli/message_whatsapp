import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useConversationFilters } from '../useConversationFilters';
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

describe('useConversationFilters', () => {
  it('initialise filterStatus à "all"', () => {
    const { result } = renderHook(() => useConversationFilters([]));
    expect(result.current.filterStatus).toBe('all');
  });

  it('renvoie toutes les conversations en mode "all"', () => {
    const convs = [
      makeConversation({ chat_id: 'a', status: 'actif' }),
      makeConversation({ chat_id: 'b', status: 'attente' }),
    ];
    const { result } = renderHook(() => useConversationFilters(convs));
    expect(result.current.filteredConversations).toHaveLength(2);
  });

  it('filtre par "unread" : ne garde que celles avec unreadCount > 0', () => {
    const convs = [
      makeConversation({ chat_id: 'a', unreadCount: 0 }),
      makeConversation({ chat_id: 'b', unreadCount: 3 }),
    ];
    const { result } = renderHook(() => useConversationFilters(convs));
    act(() => result.current.setFilterStatus('unread'));
    expect(result.current.filteredConversations).toHaveLength(1);
    expect(result.current.filteredConversations[0].chat_id).toBe('b');
  });

  it('filtre par "nouveau" : commercial n\'a jamais répondu', () => {
    const convs = [
      makeConversation({ chat_id: 'a', last_poste_message_at: null }),
      makeConversation({ chat_id: 'b', last_poste_message_at: new Date() }),
    ];
    const { result } = renderHook(() => useConversationFilters(convs));
    act(() => result.current.setFilterStatus('nouveau'));
    expect(result.current.filteredConversations).toHaveLength(1);
    expect(result.current.filteredConversations[0].chat_id).toBe('a');
  });

  it('filtre par "attente" : status === "attente"', () => {
    const convs = [
      makeConversation({ chat_id: 'a', status: 'actif' }),
      makeConversation({ chat_id: 'b', status: 'attente' }),
    ];
    const { result } = renderHook(() => useConversationFilters(convs));
    act(() => result.current.setFilterStatus('attente'));
    expect(result.current.filteredConversations).toHaveLength(1);
    expect(result.current.filteredConversations[0].chat_id).toBe('b');
  });

  it('en mode fenêtre glissante (window_slot non null + non verrouillé), bypass des filtres', () => {
    const convs = [
      makeConversation({
        chat_id: 'a',
        window_slot: 1,
        is_locked: false,
        unreadCount: 0,
        status: 'actif',
      }),
    ];
    const { result } = renderHook(() => useConversationFilters(convs));
    act(() => result.current.setFilterStatus('unread'));
    expect(result.current.filteredConversations).toHaveLength(1);
  });

  it('si window_slot non null mais conversation verrouillée, le filtre s\'applique', () => {
    const convs = [
      makeConversation({
        chat_id: 'a',
        window_slot: 1,
        is_locked: true,
        unreadCount: 0,
      }),
    ];
    const { result } = renderHook(() => useConversationFilters(convs));
    act(() => result.current.setFilterStatus('unread'));
    expect(result.current.filteredConversations).toHaveLength(0);
  });

  it('mémoïse en fonction des conversations et du filterStatus', () => {
    const convs = [makeConversation({ chat_id: 'a' })];
    const { result, rerender } = renderHook(
      ({ list }: { list: Conversation[] }) => useConversationFilters(list),
      { initialProps: { list: convs } },
    );
    const firstResult = result.current.filteredConversations;
    rerender({ list: convs });
    expect(result.current.filteredConversations).toBe(firstResult);
  });
});
