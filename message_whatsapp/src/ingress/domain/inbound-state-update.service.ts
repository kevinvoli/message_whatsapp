/**
 * CTX-C3 — Mise à jour de l'état conversation après réception d'un message entrant.
 *
 * CORRECTIF BUG CRITIQUE :
 * L'ancienne implémentation appelait `chatService.update(conversation.chat_id, {...})`
 * ce qui mettait à jour TOUTES les WhatsappChat partageant le même chat_id
 * (une par canal), corrompant les compteurs des autres canaux.
 *
 * Nouvelle logique :
 *   - Si un ChatContext est disponible (contexte isolé) → `contextService.updateChatContext()`
 *   - Sinon → fallback sur l'ancien comportement pour compatibilité descendante
 */
import { Injectable, Logger } from '@nestjs/common';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { ChatContext } from 'src/context/entities/chat-context.entity';
import { ContextService } from 'src/context/services/context.service';

@Injectable()
export class InboundStateUpdateService {
  private readonly logger = new Logger(InboundStateUpdateService.name);

  constructor(
    private readonly chatService: WhatsappChatService,
    private readonly contextService: ContextService,
  ) {}

  /**
   * Met à jour l'état DB de la conversation après réception d'un message client.
   * Mutate également `conversation` en mémoire pour cohérence immédiate.
   *
   * @param conversation  Entité conversation en mémoire (mutée en sortie)
   * @param savedMessage  Message nouvellement persisté
   * @param chatContext   Contexte isolé (disponible si ContextModule est configuré)
   */
  async apply(
    conversation: WhatsappChat,
    savedMessage: WhatsappMessage,
    chatContext?: ChatContext,
  ): Promise<void> {
    const clientMessageAt = savedMessage.timestamp ?? new Date();

    if (chatContext) {
      // ── Chemin isolé (CTX-C3) — met à jour uniquement ce contexte ──────────
      await this.contextService.updateChatContext(chatContext.id, {
        readOnly: false,
        lastClientMessageAt: clientMessageAt,
        lastActivityAt: clientMessageAt,
      });
      this.logger.debug(
        `CTX state update isolé: chatContext=${chatContext.id} chat_id=${conversation.chat_id}`,
      );
    } else {
      // ── Fallback legacy — comportement avant CTX (migration progressive) ────
      await this.chatService.update(conversation.chat_id, {
        read_only: false,
        last_client_message_at: clientMessageAt,
      });
    }

    // Mise à jour en mémoire pour cohérence avec les étapes suivantes du pipeline
    conversation.read_only = false;
    conversation.last_client_message_at = clientMessageAt;
  }
}
