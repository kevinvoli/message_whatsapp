import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { ConversationPublisher } from 'src/realtime/publishers/conversation.publisher';

/**
 * P3.2 — Transfert de conversation entre postes.
 *
 * Règles métier :
 *   - La conversation doit être ACTIF ou EN_ATTENTE
 *   - Le poste destination doit exister et être actif
 *   - On ne peut pas transférer vers le même poste
 *   - Après transfert : émet CONVERSATION_REMOVED (poste source) + CONVERSATION_ASSIGNED (poste destination)
 */
@Injectable()
export class ConversationTransferService {
  private readonly logger = new Logger(ConversationTransferService.name);

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,

    @InjectRepository(WhatsappPoste)
    private readonly posteRepo: Repository<WhatsappPoste>,

    private readonly conversationPublisher: ConversationPublisher,
  ) {}

  async transfer(
    chatId: string,
    targetPosteId: string,
    reason?: string,
  ): Promise<WhatsappChat> {
    const chat = await this.chatRepo.findOne({ where: { chat_id: chatId } });
    if (!chat) throw new NotFoundException(`Conversation ${chatId} introuvable`);

    if (chat.status === WhatsappChatStatus.FERME) {
      throw new BadRequestException('Impossible de transférer une conversation fermée');
    }

    if (chat.poste_id === targetPosteId) {
      throw new BadRequestException('La conversation est déjà sur ce poste');
    }

    const targetPoste = await this.posteRepo.findOne({ where: { id: targetPosteId } });
    if (!targetPoste) {
      throw new NotFoundException(`Poste destination ${targetPosteId} introuvable`);
    }

    const oldPosteId = chat.poste_id;

    await this.chatRepo.update(chat.id, {
      poste_id: targetPosteId,
      status: targetPoste.is_active
        ? WhatsappChatStatus.ACTIF
        : WhatsappChatStatus.EN_ATTENTE,
      assigned_at: new Date(),
      assigned_mode: targetPoste.is_active ? 'ONLINE' : 'OFFLINE',
    });

    const updatedChat = await this.chatRepo.findOne({
      where: { chat_id: chatId },
      relations: ['poste'],
    });

    if (!updatedChat) throw new NotFoundException('Conversation introuvable après mise à jour');

    // Notifications temps réel
    if (oldPosteId) {
      await this.conversationPublisher.emitConversationReassigned(
        updatedChat,
        oldPosteId,
        targetPosteId,
      );
    } else {
      await this.conversationPublisher.emitConversationAssigned(chatId);
    }

    this.logger.log(
      `Transfert ${chatId}: ${oldPosteId ?? 'aucun'} → ${targetPosteId}` +
        (reason ? ` (motif: ${reason})` : ''),
    );

    return updatedChat;
  }

  async listPossibleTargets(tenantId: string, excludePosteId?: string): Promise<WhatsappPoste[]> {
    const qb = this.posteRepo
      .createQueryBuilder('p')
      .where('p.is_active = true');

    if (excludePosteId) {
      qb.andWhere('p.id != :excludePosteId', { excludePosteId });
    }

    return qb.orderBy('p.name', 'ASC').getMany();
  }
}
