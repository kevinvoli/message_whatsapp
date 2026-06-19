/**
 * Factory pour créer des objets ChatSession de test.
 * Fournit des valeurs par défaut cohérentes et permet la surcharge partielle.
 */

import { ChatSession } from 'src/chat-session/entities/chat-session.entity';
import type { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { makeConversation } from './conversation.factory';

export function makeChatSession(
  overrides: Partial<ChatSession> = {},
  chatOverrides: Partial<WhatsappChat> = {},
): ChatSession {
  const now = new Date();

  const chat = makeConversation(chatOverrides);

  const defaults: ChatSession = {
    id: 'session-uuid-test-001',
    whatsappChatId: chat.id,
    chat,
    startedAt: now,
    endedAt: null,
    isCtwa: false,
    ctwaReferralId: null,
    campaignName: null,
    campaignImageUrl: null,
    lastClientMessageAt: now,
    lastPosteMessageAt: null,
    serviceWindowExpiresAt: new Date(now.getTime() + 24 * 3_600_000),
    freeEntryExpiresAt: null,
    autoCloseAt: new Date(now.getTime() + 24 * 3_600_000),
    lastWindowReminderSentAt: null,
  };

  return { ...defaults, ...overrides };
}
