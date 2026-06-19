/**
 * Factory pour créer des objets WhatsappChat de test.
 * Fournit des valeurs par défaut cohérentes et permet la surcharge partielle.
 */

import {
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import type { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

export function makeConversation(
  overrides: Partial<WhatsappChat> = {},
): WhatsappChat {
  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

  const defaults: Partial<WhatsappChat> = {
    id: 'chat-uuid-test-001',
    chat_id: '33600000001@c.us',
    name: 'Client Test',
    type: 'private',
    status: WhatsappChatStatus.ACTIF,
    poste_id: 'poste-uuid-test-001',
    poste: null,
    tenant_id: null,
    assigned_at: now,
    assigned_mode: 'ONLINE',
    first_response_deadline_at: new Date(now.getTime() + 5 * 60 * 1000),
    last_client_message_at: thirtyMinutesAgo,
    last_poste_message_at: null,
    chat_pic: null,
    chat_pic_full: null,
    chatPicRefreshedAt: null,
    is_pinned: false,
    is_muted: false,
    mute_until: null,
    is_archived: false,
    unread_count: 1,
    unread_mention: false,
    read_only: false,
    not_spam: true,
    last_activity_at: thirtyMinutesAgo,
    contact_client: '33600000001',
    reopened_at: null,
    conversation_result: null,
    conversation_result_at: null,
    conversation_result_by: null,
    is_locked: false,
    is_priority: false,
    window_slot: null,
    window_status: null,
    customerWindowExpiresAt: null,
    outboundMessageCount: 0,
    isCtwa: false,
    activeSessionId: null,
    windowExpiresAt: null,
    last_window_reminder_sent_at: null,
    chatLabel: [],
    messages: [],
    medias: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  return { ...defaults, ...overrides } as WhatsappChat;
}

export function makeConversationEnAttente(
  overrides: Partial<WhatsappChat> = {},
): WhatsappChat {
  return makeConversation({
    status: WhatsappChatStatus.EN_ATTENTE,
    poste_id: null,
    poste: null,
    assigned_mode: null,
    assigned_at: null,
    unread_count: 1,
    ...overrides,
  });
}

export function makeConversationFermee(
  overrides: Partial<WhatsappChat> = {},
): WhatsappChat {
  return makeConversation({
    status: WhatsappChatStatus.FERME,
    unread_count: 0,
    ...overrides,
  });
}
