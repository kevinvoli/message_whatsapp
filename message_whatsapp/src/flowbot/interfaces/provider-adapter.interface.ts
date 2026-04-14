/**
 * Contexte minimal que le FlowBot passe à l'adaptateur pour identifier la conversation.
 * Provider-agnostique — le même objet sert pour Whapi, Meta, Telegram, etc.
 */
export interface BotConversationContext {
  externalRef: string;          // chat_id WA, thread_id email, user_id Telegram
  provider: string;             // 'whapi' | 'meta' | 'telegram_bot' | 'sendgrid'
  channelType: string;          // 'whatsapp' | 'telegram' | 'email'
  providerChannelRef?: string;  // ID du canal provider (Whapi channel ID, Meta WABA ID)
}

/** Message sortant — format universel traduit par l'adaptateur en format provider */
export interface BotOutboundMessage {
  context: BotConversationContext;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'audio' | 'video' | 'document';
  caption?: string;
  replyToExternalRef?: string;  // Réponse à un message précis (WA, TG)
  templateName?: string;        // Template HSM pour Meta hors fenêtre 24h
  templateParams?: string[];
}

/** Résultat d'un envoi */
export interface BotSendResult {
  externalMessageRef: string;  // ID du message créé côté provider
  sentAt: Date;
}

/** Capacités déclarées par un provider */
export interface ProviderCapabilities {
  typing: boolean;              // Supporte les indicateurs de frappe
  markAsRead: boolean;          // Supporte la lecture des messages
  media: boolean;               // Peut envoyer images/vidéos/docs
  templates: boolean;           // Supporte les templates (HSM Meta, etc.)
  replyTo: boolean;             // Peut répondre à un message précis
  windowHours: number | null;   // Fenêtre de messagerie (24h Meta, null = illimité)
}

/**
 * Interface que chaque module provider implémente.
 * Définie ICI dans flowbot — implémentée dans whapi/, meta/, etc.
 * Le FlowBot ne connaît que cette interface, jamais les implémentations concrètes.
 */
export interface BotProviderAdapter {
  /** Clé unique du provider — utilisée comme index dans le registry */
  readonly provider: string;    // 'whapi' | 'meta' | 'telegram_bot' | 'sendgrid'

  /** Canal que ce provider sert */
  readonly channelType: string; // 'whatsapp' | 'telegram' | 'email' | 'sms'

  // ─── Messagerie ──────────────────────────────────────────────────────────

  /** Envoie un message (texte ou média) */
  sendMessage(msg: BotOutboundMessage): Promise<BotSendResult>;

  /** Démarre l'indicateur "en train d'écrire" — no-op si non supporté */
  sendTyping(ctx: BotConversationContext): Promise<void>;

  /** Arrête l'indicateur de frappe — no-op si non supporté */
  stopTyping(ctx: BotConversationContext): Promise<void>;

  /** Marque la conversation comme lue côté provider — no-op si non supporté */
  markAsRead(ctx: BotConversationContext): Promise<void>;

  // ─── Actions système ─────────────────────────────────────────────────────

  /**
   * Assigne la conversation à un agent humain.
   * agentRef = undefined → file d'attente globale.
   */
  assignToAgent(ctx: BotConversationContext, agentRef?: string): Promise<void>;

  /** Ferme la conversation côté système */
  closeConversation(ctx: BotConversationContext): Promise<void>;

  /** Notifie le frontend temps réel */
  emitConversationUpdated(ctx: BotConversationContext): Promise<void>;

  // ─── Capacités déclarées ─────────────────────────────────────────────────

  capabilities(): ProviderCapabilities;
}
