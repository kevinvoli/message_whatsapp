import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const loadConversationsMock = vi.fn();

vi.mock('@/store/chatStore', () => ({
  useChatStore: () => ({ loadConversations: loadConversationsMock }),
}));

import { useConversationSearch } from '../useConversationSearch';

describe('useConversationSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loadConversationsMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initialise searchQuery à une chaîne vide', () => {
    const { result } = renderHook(() => useConversationSearch());
    expect(result.current.searchQuery).toBe('');
  });

  it('ne déclenche pas loadConversations au premier render', () => {
    renderHook(() => useConversationSearch());
    vi.advanceTimersByTime(500);
    expect(loadConversationsMock).not.toHaveBeenCalled();
  });

  it('debounce de 300ms avant d\'appeler loadConversations', () => {
    const { result } = renderHook(() => useConversationSearch());
    act(() => {
      result.current.setSearchQuery('hello');
    });
    expect(loadConversationsMock).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(loadConversationsMock).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(loadConversationsMock).toHaveBeenCalledTimes(1);
    expect(loadConversationsMock).toHaveBeenCalledWith('hello');
  });

  it('annule le précédent timer si setSearchQuery est appelé à nouveau', () => {
    const { result } = renderHook(() => useConversationSearch());
    act(() => {
      result.current.setSearchQuery('a');
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    act(() => {
      result.current.setSearchQuery('ab');
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(loadConversationsMock).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(loadConversationsMock).toHaveBeenCalledTimes(1);
    expect(loadConversationsMock).toHaveBeenCalledWith('ab');
  });

  it('expose la valeur courante via searchQuery', () => {
    const { result } = renderHook(() => useConversationSearch());
    act(() => {
      result.current.setSearchQuery('test');
    });
    expect(result.current.searchQuery).toBe('test');
  });
});
