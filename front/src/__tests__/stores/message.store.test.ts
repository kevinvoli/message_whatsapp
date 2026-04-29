import { describe, expect, it } from 'vitest';
import { dedupeMessagesById } from '@/modules/chat/store/message.store';
import type { Message } from '@/types/chat';

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

describe('dedupeMessagesById', () => {
  it('renvoie un tableau vide pour un input vide', () => {
    expect(dedupeMessagesById([])).toEqual([]);
  });

  it('préserve les messages uniques', () => {
    const msgs = [
      makeMessage({ id: 'a', timestamp: new Date(2026, 0, 1) }),
      makeMessage({ id: 'b', timestamp: new Date(2026, 0, 2) }),
    ];
    const result = dedupeMessagesById(msgs);
    expect(result).toHaveLength(2);
  });

  it('déduplique les messages par id (garde le dernier rencontré)', () => {
    const msgs = [
      makeMessage({ id: 'a', text: 'first', timestamp: new Date(2026, 0, 1) }),
      makeMessage({ id: 'a', text: 'second', timestamp: new Date(2026, 0, 1) }),
    ];
    const result = dedupeMessagesById(msgs);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('second');
  });

  it('trie par timestamp ascendant', () => {
    const t1 = new Date(2026, 0, 5);
    const t2 = new Date(2026, 0, 2);
    const t3 = new Date(2026, 0, 8);
    const msgs = [
      makeMessage({ id: 'a', timestamp: t1 }),
      makeMessage({ id: 'b', timestamp: t2 }),
      makeMessage({ id: 'c', timestamp: t3 }),
    ];
    const result = dedupeMessagesById(msgs);
    expect(result.map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });

  it('combine déduplication et tri', () => {
    const msgs = [
      makeMessage({ id: 'a', timestamp: new Date(2026, 0, 5) }),
      makeMessage({ id: 'b', timestamp: new Date(2026, 0, 2) }),
      makeMessage({ id: 'a', timestamp: new Date(2026, 0, 5), text: 'duplicate' }),
    ];
    const result = dedupeMessagesById(msgs);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(['b', 'a']);
  });
});
