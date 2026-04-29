import { describe, expect, it } from 'vitest';
import {
  mergeConversationInList,
  mergeSelectedConversation,
} from '../conversation-merge.service';
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
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
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

describe('mergeConversationInList', () => {
  it('renvoie la liste inchangée (par tri) quand le chat_id ne match aucune conversation', () => {
    const list = [makeConversation({ chat_id: 'chat-A' })];
    const updated = makeConversation({ chat_id: 'chat-B' });
    const result = mergeConversationInList(list, updated, false);
    expect(result).toHaveLength(1);
    expect(result[0].chat_id).toBe('chat-A');
  });

  it('met à jour la conversation matchant le chat_id', () => {
    const list = [makeConversation({ chat_id: 'chat-1', clientName: 'Old' })];
    const updated = makeConversation({ chat_id: 'chat-1', clientName: 'New' });
    const result = mergeConversationInList(list, updated, false);
    expect(result[0].clientName).toBe('New');
  });

  it('préserve les messages locaux si la mise à jour n\'en contient pas', () => {
    const localMsgs = [makeMessage({ id: 'local-1' })];
    const list = [makeConversation({ chat_id: 'chat-1', messages: localMsgs })];
    const updated = makeConversation({ chat_id: 'chat-1', messages: [] });
    const result = mergeConversationInList(list, updated, false);
    expect(result[0].messages).toEqual(localMsgs);
  });

  it('utilise les nouveaux messages si la mise à jour en contient', () => {
    const newMsgs = [makeMessage({ id: 'new-1' })];
    const list = [makeConversation({ chat_id: 'chat-1', messages: [makeMessage({ id: 'old' })] })];
    const updated = makeConversation({ chat_id: 'chat-1', messages: newMsgs });
    const result = mergeConversationInList(list, updated, false);
    expect(result[0].messages).toEqual(newMsgs);
  });

  it('préserve contact_summary si la mise à jour ne le contient pas', () => {
    const summary = {
      id: 'contact-1',
      call_status: 'à_appeler' as const,
      call_count: 0,
      is_active: true,
    };
    const list = [makeConversation({ chat_id: 'chat-1', contact_summary: summary })];
    const updated = makeConversation({ chat_id: 'chat-1', contact_summary: null });
    const result = mergeConversationInList(list, updated, false);
    expect(result[0].contact_summary).toEqual(summary);
  });

  it('préserve la priorité existante si la mise à jour est "moyenne"', () => {
    const list = [makeConversation({ chat_id: 'chat-1', priority: 'haute' })];
    const updated = makeConversation({ chat_id: 'chat-1', priority: 'moyenne' });
    const result = mergeConversationInList(list, updated, false);
    expect(result[0].priority).toBe('haute');
  });

  it('utilise la nouvelle priorité si elle n\'est pas "moyenne"', () => {
    const list = [makeConversation({ chat_id: 'chat-1', priority: 'haute' })];
    const updated = makeConversation({ chat_id: 'chat-1', priority: 'basse' });
    const result = mergeConversationInList(list, updated, false);
    expect(result[0].priority).toBe('basse');
  });

  it('met unreadCount à 0 quand la conversation est sélectionnée', () => {
    const list = [makeConversation({ chat_id: 'chat-1', unreadCount: 5 })];
    const updated = makeConversation({ chat_id: 'chat-1', unreadCount: 3 });
    const result = mergeConversationInList(list, updated, true);
    expect(result[0].unreadCount).toBe(0);
  });

  it('utilise le unreadCount de la mise à jour si non sélectionnée', () => {
    const list = [makeConversation({ chat_id: 'chat-1', unreadCount: 5 })];
    const updated = makeConversation({ chat_id: 'chat-1', unreadCount: 7 });
    const result = mergeConversationInList(list, updated, false);
    expect(result[0].unreadCount).toBe(7);
  });

  it('trie par window_slot quand les deux conversations en ont un', () => {
    const list = [
      makeConversation({ chat_id: 'chat-1', window_slot: 5 }),
      makeConversation({ chat_id: 'chat-2', window_slot: 1 }),
    ];
    const updated = makeConversation({ chat_id: 'chat-1', window_slot: 5 });
    const result = mergeConversationInList(list, updated, false);
    expect(result[0].chat_id).toBe('chat-2');
    expect(result[1].chat_id).toBe('chat-1');
  });

  it('priorise les conversations avec window_slot sur celles sans', () => {
    const list = [
      makeConversation({ chat_id: 'chat-A', window_slot: null }),
      makeConversation({ chat_id: 'chat-B', window_slot: 2 }),
    ];
    const updated = makeConversation({ chat_id: 'chat-A', window_slot: null });
    const result = mergeConversationInList(list, updated, false);
    expect(result[0].chat_id).toBe('chat-B');
  });

  it('trie par last_activity_at DESC en mode classique', () => {
    const old = new Date(2026, 0, 1);
    const recent = new Date(2026, 0, 10);
    const list = [
      makeConversation({ chat_id: 'chat-1', last_activity_at: old }),
      makeConversation({ chat_id: 'chat-2', last_activity_at: recent }),
    ];
    const updated = makeConversation({ chat_id: 'chat-1', last_activity_at: old });
    const result = mergeConversationInList(list, updated, false);
    expect(result[0].chat_id).toBe('chat-2');
  });

  it('utilise updatedAt comme fallback si last_activity_at absent', () => {
    const list = [
      makeConversation({
        chat_id: 'chat-1',
        last_activity_at: null,
        updatedAt: new Date(2026, 0, 1),
      }),
      makeConversation({
        chat_id: 'chat-2',
        last_activity_at: null,
        updatedAt: new Date(2026, 0, 5),
      }),
    ];
    const updated = makeConversation({
      chat_id: 'chat-1',
      last_activity_at: null,
      updatedAt: new Date(2026, 0, 1),
    });
    const result = mergeConversationInList(list, updated, false);
    expect(result[0].chat_id).toBe('chat-2');
  });

  it('préserve report_submission_status existant si la mise à jour est undefined', () => {
    const list = [
      makeConversation({ chat_id: 'chat-1', report_submission_status: 'sent' }),
    ];
    const updated = makeConversation({ chat_id: 'chat-1' });
    delete updated.report_submission_status;
    const result = mergeConversationInList(list, updated, false);
    expect(result[0].report_submission_status).toBe('sent');
  });

  it('écrase report_submission_status si la mise à jour fournit null', () => {
    const list = [
      makeConversation({ chat_id: 'chat-1', report_submission_status: 'sent' }),
    ];
    const updated = makeConversation({ chat_id: 'chat-1', report_submission_status: null });
    const result = mergeConversationInList(list, updated, false);
    expect(result[0].report_submission_status).toBeNull();
  });
});

describe('mergeSelectedConversation', () => {
  it('renvoie null si current est null', () => {
    const updated = makeConversation({ chat_id: 'chat-1' });
    expect(mergeSelectedConversation(null, updated, [])).toBeNull();
  });

  it('renvoie null si chat_id ne match pas', () => {
    const current = makeConversation({ chat_id: 'chat-1' });
    const updated = makeConversation({ chat_id: 'chat-2' });
    expect(mergeSelectedConversation(current, updated, [])).toBeNull();
  });

  it('renvoie un selectedConversation avec unreadCount=0', () => {
    const current = makeConversation({ chat_id: 'chat-1', unreadCount: 5 });
    const updated = makeConversation({ chat_id: 'chat-1', unreadCount: 8 });
    const result = mergeSelectedConversation(current, updated, []);
    expect(result?.selectedConversation.unreadCount).toBe(0);
  });

  it('préserve la priority haute si la mise à jour est moyenne', () => {
    const current = makeConversation({ chat_id: 'chat-1', priority: 'haute' });
    const updated = makeConversation({ chat_id: 'chat-1', priority: 'moyenne' });
    const result = mergeSelectedConversation(current, updated, []);
    expect(result?.selectedConversation.priority).toBe('haute');
  });

  it('préserve les messages locaux en sending quand la mise à jour fournit des messages', () => {
    const localSending = makeMessage({ id: 'temp-1', status: 'sending' });
    const localSent = makeMessage({ id: 'sent-1', status: 'sent' });
    const newMsg = makeMessage({ id: 'remote-1' });
    const current = makeConversation({ chat_id: 'chat-1' });
    const updated = makeConversation({ chat_id: 'chat-1', messages: [newMsg] });
    const result = mergeSelectedConversation(current, updated, [localSending, localSent]);
    expect(result?.messages).toBeDefined();
    const msgIds = result!.messages!.map((m) => m.id);
    expect(msgIds).toContain('temp-1');
    expect(msgIds).toContain('remote-1');
    expect(msgIds).not.toContain('sent-1');
  });

  it('ajoute lastMessage aux messages existants si pas déjà présent', () => {
    const existing = makeMessage({ id: 'existing-1' });
    const lastMsg = makeMessage({ id: 'last-1' });
    const current = makeConversation({ chat_id: 'chat-1' });
    const updated = makeConversation({ chat_id: 'chat-1', lastMessage: lastMsg });
    const result = mergeSelectedConversation(current, updated, [existing]);
    expect(result?.messages).toBeDefined();
    expect(result!.messages!.map((m) => m.id)).toEqual(
      expect.arrayContaining(['existing-1', 'last-1']),
    );
  });

  it('n\'ajoute pas lastMessage s\'il est déjà dans les messages existants', () => {
    const existing = makeMessage({ id: 'last-1' });
    const lastMsg = makeMessage({ id: 'last-1' });
    const current = makeConversation({ chat_id: 'chat-1' });
    const updated = makeConversation({ chat_id: 'chat-1', lastMessage: lastMsg });
    const result = mergeSelectedConversation(current, updated, [existing]);
    expect(result?.messages).toBeUndefined();
  });

  it('préserve report_submission_status si la mise à jour est undefined', () => {
    const current = makeConversation({ chat_id: 'chat-1', report_submission_status: 'pending' });
    const updated = makeConversation({ chat_id: 'chat-1' });
    delete updated.report_submission_status;
    const result = mergeSelectedConversation(current, updated, []);
    expect(result?.selectedConversation.report_submission_status).toBe('pending');
  });
});
