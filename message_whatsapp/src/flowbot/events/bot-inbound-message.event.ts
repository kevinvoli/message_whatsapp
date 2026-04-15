export const BOT_INBOUND_EVENT = 'bot.inbound';

export class BotInboundMessageEvent {
  // ─── Identification provider ──────────────────────────────────────────────
  provider: string;                // 'whapi' | 'meta' | 'telegram_bot' | 'sendgrid'
  channelType: string;             // 'whatsapp' | 'telegram' | 'email' | 'sms'
  providerChannelRef?: string;     // ID du canal provider (Whapi channel ID, Meta WABA)

  // ─── Identification conversation ──────────────────────────────────────────
  conversationExternalRef: string; // Format brut du provider (ex: 33612345678@s.whatsapp.net)

  // ─── Contact ──────────────────────────────────────────────────────────────
  contactExternalId: string;       // Identifiant normalisé (sans @s.whatsapp.net, sans +)
  contactName: string;

  // ─── Message ──────────────────────────────────────────────────────────────
  messageText?: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'reaction';
  mediaUrl?: string;
  externalMessageRef: string;      // ID du message côté provider
  receivedAt: Date;

  // ─── Contexte dispatch (calculé par le service émetteur) ──────────────────
  isNewConversation: boolean;      // Premier message de ce contact sur ce provider
  isReopened: boolean;             // Conversation précédemment fermée
  isOutOfHours: boolean;           // Hors horaires d'ouverture
  agentAssignedRef?: string;       // Agent déjà assigné s'il y en a un

  // ─── CTX-D2 — Isolation de contexte ──────────────────────────────────────
  /** ID du Context résolu pour ce message (null si aucun contexte configuré) */
  contextId?: string | null;
  /** ID du ChatContext isolé pour ce (chatId × contextId) */
  chatContextId?: string | null;
}
