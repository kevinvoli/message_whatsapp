/**
 * Factory pour créer des objets WhatsappMessage de test.
 * Fournit des valeurs par défaut cohérentes et permet la surcharge partielle.
 *
 * Usage :
 *   import { makeMessage, makeIncomingMessage } from '../../test/factories/message.factory';
 *   const msg = makeMessage({ chat_id: '33600000001@c.us', text: 'Bonjour' });
 */

import {
  MessageDirection,
  WhatsappMessageStatus,
} from 'src/whatsapp_message/entities/whatsapp_message.entity';
import type { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';

/**
 * Crée un objet WhatsappMessage plain avec des valeurs par défaut testables.
 * N'instancie pas la classe TypeORM — retourne un objet plain.
 */
export function makeMessage(
  overrides: Partial<WhatsappMessage> = {},
): WhatsappMessage {
  const now = new Date();

  const defaults: WhatsappMessage = {
    id: 'msg-uuid-test-001',
    tenant_id: null,
    provider: 'whapi',
    provider_message_id: 'whapi-msg-001',
    message_id: 'whapi-msg-001',
    external_id: 'ext-msg-001',
    chat_id: '33600000001@c.us',
    channel_id: 'channel-test-001',
    type: 'text',
    poste_id: null,
    text: 'Message de test',
    channel: null as unknown as WhatsappMessage['channel'],
    chat: null as unknown as WhatsappMessage['chat'],
    poste: null,
    messageCnntent: [],
    contact_id: null,
    contact: null,
    medias: [],
    direction: MessageDirection.IN,
    from_me: false,
    from: '33600000001',
    from_name: 'Client Test',
    timestamp: now,
    status: WhatsappMessageStatus.DELIVERED,
    source: 'whapi',
    error_code: null,
    error_title: null,
    commercial_id: null,
    commercial: null,
    dedicated_channel_id: null,
    quoted_message_id: null,
    quotedMessage: null,
    readByCommercialId: null,
    readByCommercialAt: null,
    readByCommercial: null,
    isFirstReply: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    hourOfDay: null,
    dayOfWeekN: null,
  };

  return { ...defaults, ...overrides };
}

/**
 * Crée un message entrant client (IN).
 */
export function makeIncomingMessage(
  overrides: Partial<WhatsappMessage> = {},
): WhatsappMessage {
  return makeMessage({
    direction: MessageDirection.IN,
    from_me: false,
    ...overrides,
  });
}

/**
 * Crée un message sortant agent (OUT).
 */
export function makeOutgoingMessage(
  overrides: Partial<WhatsappMessage> = {},
): WhatsappMessage {
  return makeMessage({
    direction: MessageDirection.OUT,
    from_me: true,
    poste_id: 'poste-uuid-test-001',
    ...overrides,
  });
}
