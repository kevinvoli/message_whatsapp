/**
 * TICKET-04-A — Persistance du message entrant.
 *
 * Isole la logique de sauvegarde + gestion de l'erreur "canal inconnu"
 * extraite de `InboundMessageService`.
 *
 * Retourne null si le canal est introuvable (= message silencieusement ignoré).
 * Lève une exception pour toute autre erreur de persistance.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { UnifiedMessage } from 'src/webhooks/normalization/unified-message';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';

/** Résultat de la persistance d'un message entrant. */
export type PersistenceOutcome =
  | { ok: true; message: WhatsappMessage }
  | { ok: false; reason: 'channel_not_found' };

@Injectable()
export class IncomingMessagePersistenceService {
  private readonly logger = new Logger(IncomingMessagePersistenceService.name);

  constructor(
    private readonly whatsappMessageService: WhatsappMessageService,
  ) {}

  /**
   * Persiste le message entrant et retourne le message sauvegardé avec ses médias.
   *
   * @returns `{ ok: true, message }` si succès
   * @returns `{ ok: false, reason: 'channel_not_found' }` si le canal est inconnu
   *          (le pipeline doit stopper proprement, sans erreur HTTP 5xx)
   * @throws si une autre erreur de persistance survient
   */
  async persist(
    unified: UnifiedMessage,
    conversation: WhatsappChat,
    traceId: string,
  ): Promise<PersistenceOutcome> {
    let saved: WhatsappMessage;
    try {
      saved = await this.whatsappMessageService.saveIncomingFromUnified(unified, conversation);
    } catch (err) {
      const msg: string = (err as Error)?.message ?? '';
      if (this.isChannelNotFoundError(msg)) {
        this.logger.warn(
          `INCOMING_CHANNEL_NOT_FOUND trace=${traceId} channel=${unified.channelId} — message ignoré`,
        );
        return { ok: false, reason: 'channel_not_found' };
      }
      throw err;
    }

    if (!saved) {
      throw new NotFoundException('Message non enregistré après persistance');
    }

    this.logger.log(`INCOMING_PERSISTED trace=${traceId} db_message_id=${saved.id}`);

    // Recharge avec les médias attachés (OPT-2 : évite un SELECT supplémentaire
    // dans notifyNewMessage si on passe fullMessage comme lastMessage)
    const fullMessage = await this.whatsappMessageService.findOneWithMedias(saved.id);
    if (!fullMessage) {
      throw new NotFoundException(`Message ${saved.id} introuvable après persistance`);
    }

    return { ok: true, message: fullMessage };
  }

  // ─── Privé ────────────────────────────────────────────────────────────────

  private isChannelNotFoundError(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes('channel') ||
      lower.includes('canal') ||
      lower.includes('non trouve') ||
      lower.includes('not found')
    );
  }
}
