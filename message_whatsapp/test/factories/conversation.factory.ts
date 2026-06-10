/**
 * Factory pour créer des objets WhatsappChat de test.
 * Fournit des valeurs par défaut cohérentes et permet la surcharge partielle.
 *
 * Usage :
 *   import { makeConversation } from '../../test/factories/conversation.factory';
 *   const chat = makeConversation({ unread_count: 3, status: WhatsappChatStatus.ACTIF });
 */

import {
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import type { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

/**
 * Crée un objet WhatsappChat partiel avec des valeurs par défaut testables.
 * N'instancie pas la classe TypeORM — retourne un objet plain.
 */
export function makeConversation(
  overrides: Partial<WhatsappChat> = {},
): WhatsappChat {
  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

  const defaults: WhatsappChat = {
    id: 'chat-uuid-test-001',
    chat_id: '33600000001@c.us',
    name: 'Client Test',
    type: 'private',
    status: WhatsappChatStatus.ACTIF,
    poste_id: 'poste-uuid-test-001',
    poste: null,
    tenant_id: null,
    channel_id: undefined,
    last_msg_client_channel_id: undefined,
    channel: null as unknown as WhatsappChat['channel'],
    assigned_at: now,
    assigned_mode: 'ONLINE',
    first_response_deadline_at: new Date(now.getTime() + 5 * 60 * 1000),
    last_client_message_at: thirtyMinutesAgo,
    last_poste_message_at: null,
    chat_pic: 'default.png',
    chat_pic_full: 'default.png',
    is_pinned: false,
    is_muted: false,
    mute_until: null,
    is_archived: false,
    unread_count: 1,
    unread_mention: false,
    read_only: false,
    poste_message_count_since_last_client: 0,
    not_spam: true,
    last_activity_at: thirtyMinutesAgo,
    contact_client: '33600000001',
    auto_message_id: null,
    current_auto_message_id: null,
    auto_message_status: null,
    auto_message_step: 0,
    waiting_client_reply: false,
    last_auto_message_sent_at: null,
    no_response_auto_step: 0,
    last_no_response_auto_sent_at: null,
    out_of_hours_auto_sent: false,
    reopened_at: null,
    reopened_auto_sent: false,
    queue_wait_auto_step: 0,
    last_queue_wait_auto_sent_at: null,
    keyword_auto_sent_at: null,
    client_type_auto_sent: false,
    is_known_client: null,
    inactivity_auto_step: 0,
    last_inactivity_auto_sent_at: null,
    on_assign_auto_sent: false,
    last_window_reminder_sent_at: null,
    campaignLinkId: null,
    isCtwa: false,
    activeSessionId: null,
    metaAdReferral: null,
    chatLabel: [],
    messages: [],
    medias: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  return { ...defaults, ...overrides };
}

/**
 * Crée une conversation en attente (sans poste assigné).
 */
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

/**
 * Crée une conversation fermée.
 */
export function makeConversationFermee(
  overrides: Partial<WhatsappChat> = {},
): WhatsappChat {
  return makeConversation({
    status: WhatsappChatStatus.FERME,
    unread_count: 0,
    ...overrides,
  });
}

/**
 * Crée une conversation déjà lue (unread_count = 0).
 */
export function makeConversationLue(
  overrides: Partial<WhatsappChat> = {},
): WhatsappChat {
  return makeConversation({
    unread_count: 0,
    last_poste_message_at: new Date(),
    ...overrides,
  });
}
