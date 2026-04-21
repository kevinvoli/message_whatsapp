import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappMedia } from 'src/whatsapp_media/entities/whatsapp_media.entity';
import { ConversationPublisher } from 'src/realtime/publishers/conversation.publisher';

/**
 * P3.6 — Merge de conversations
 *
 * Scénario : un client contacte via deux numéros différents ou deux canaux distincts.
 * Le merge réassigne tous les messages + médias de la conversation source vers la cible,
 * puis ferme la source.
 *
 * Opération transactionnelle (tout ou rien).
 */
@Injectable()
export class ConversationMergeService {
  private readonly logger = new Logger(ConversationMergeService.name);

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,

    @InjectRepository(WhatsappMessage)
    private readonly msgRepo: Repository<WhatsappMessage>,

    @InjectRepository(WhatsappMedia)
    private readonly mediaRepo: Repository<WhatsappMedia>,

    private readonly conversationPublisher: ConversationPublisher,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async merge(
    sourceChatId: string,
    targetChatId: string,
    reason?: string,
  ): Promise<{ source: WhatsappChat; target: WhatsappChat; movedMessages: number; movedMedias: number }> {
    if (sourceChatId === targetChatId) {
      throw new BadRequestException('La source et la cible ne peuvent pas être identiques');
    }

    const [source, target] = await Promise.all([
      this.chatRepo.findOne({ where: { chat_id: sourceChatId } }),
      this.chatRepo.findOne({ where: { chat_id: targetChatId } }),
    ]);

    if (!source) throw new NotFoundException(`Conversation source ${sourceChatId} introuvable`);
    if (!target) throw new NotFoundException(`Conversation cible ${targetChatId} introuvable`);

    if (source.status === WhatsappChatStatus.FERME) {
      throw new BadRequestException('La conversation source est déjà fermée');
    }

    return this.dataSource.transaction(async (manager) => {
      // 1. Réassigner les messages source → target
      const msgResult = await manager
        .createQueryBuilder()
        .update(WhatsappMessage)
        .set({ chat_id: targetChatId })
        .where('chat_id = :sourceChatId', { sourceChatId })
        .execute();

      // 2. Réassigner les médias source → target
      const mediaResult = await manager
        .createQueryBuilder()
        .update(WhatsappMedia)
        .set({ chat_id: targetChatId })
        .where('chat_id = :sourceChatId', { sourceChatId })
        .execute();

      // 3. Fermer la conversation source
      await manager.update(WhatsappChat, { chat_id: sourceChatId }, {
        status: WhatsappChatStatus.FERME,
        read_only: true,
      });

      // 4. Mettre à jour last_activity_at de la cible
      await manager.update(WhatsappChat, { chat_id: targetChatId }, {
        last_activity_at: new Date(),
      });

      this.logger.log(
        `Merge: ${sourceChatId} → ${targetChatId} | ` +
        `${msgResult.affected} messages, ${mediaResult.affected} médias déplacés` +
        (reason ? ` | motif: ${reason}` : ''),
      );

      // 5. Notifications temps réel
      if (source.poste_id) {
        this.conversationPublisher.emitConversationRemoved(sourceChatId, source.poste_id);
      }
      await this.conversationPublisher.emitConversationUpsertByChatId(targetChatId);

      // 6. Libérer le slot fenêtre de la source (handled by WindowRotationService listener)
      this.eventEmitter.emit('conversation.status_changed', {
        chatId: sourceChatId,
        newStatus: WhatsappChatStatus.FERME,
        oldStatus: source.status,
      });

      const [updatedSource, updatedTarget] = await Promise.all([
        this.chatRepo.findOne({ where: { chat_id: sourceChatId } }),
        this.chatRepo.findOne({ where: { chat_id: targetChatId } }),
      ]);

      return {
        source: updatedSource!,
        target: updatedTarget!,
        movedMessages: msgResult.affected ?? 0,
        movedMedias: mediaResult.affected ?? 0,
      };
    });
  }
}
