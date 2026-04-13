/**
 * TICKET-04-A — Mise à jour de l'état conversation après réception d'un message entrant.
 *
 * Extrait de `InboundMessageService` : après persistance du message, la conversation
 * doit être mise à jour (last_client_message_at, read_only, waiting_client_reply,
 * et réinitialisation du cycle auto si l'agent avait déjà répondu).
 */
import { Injectable } from '@nestjs/common';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';

@Injectable()
export class InboundStateUpdateService {
  constructor(private readonly chatService: WhatsappChatService) {}

  /**
   * Met à jour l'état DB de la conversation après réception d'un message client.
   * Mutate également `conversation` en mémoire pour cohérence immédiate.
   *
   * @param conversation  Entité conversation en mémoire (mutée en sortie)
   * @param savedMessage  Message nouvellement persisté
   */
  async apply(conversation: WhatsappChat, savedMessage: WhatsappMessage): Promise<void> {
    const clientMessageAt = savedMessage.timestamp ?? new Date();

    // Si l'agent avait déjà répondu, on repart de zéro sur la séquence auto.
    const isReopenedCycle = !!conversation.last_poste_message_at;

    await this.chatService.update(conversation.chat_id, {
      read_only: false,
      last_client_message_at: clientMessageAt,
      waiting_client_reply: false,
      ...(isReopenedCycle
        ? { auto_message_step: 0, last_auto_message_sent_at: null }
        : {}),
    });

    // Mise à jour en mémoire pour cohérence avec les étapes suivantes du pipeline
    conversation.read_only = false;
    conversation.last_client_message_at = clientMessageAt;
    if (isReopenedCycle) {
      conversation.auto_message_step = 0;
    }
  }
}
