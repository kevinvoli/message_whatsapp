import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappCommercial } from './entities/user.entity';
import { WhatsappMessage, MessageDirection } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CommercialStatsDto } from './dto/commercial-stats.dto';

@Injectable()
export class CommercialStatsService {
  constructor(
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
  ) {}

  async getStats(commercialId: string): Promise<CommercialStatsDto> {
    const commercial = await this.commercialRepository.findOne({
      where: { id: commercialId },
      relations: ['poste'],
    });
    if (!commercial) {
      throw new NotFoundException(`Commercial ${commercialId} introuvable`);
    }

    const [messagesRead, messagesHandled] = await Promise.all([
      this.messageRepository
        .createQueryBuilder('m')
        .where('m.readByCommercialId = :id', { id: commercialId })
        .andWhere('m.direction = :direction', { direction: MessageDirection.IN })
        .getCount(),
      this.messageRepository
        .createQueryBuilder('m')
        .where('m.commercial_id = :id', { id: commercialId })
        .andWhere('m.direction = :direction', { direction: MessageDirection.OUT })
        .getCount(),
    ]);

    let activeConversations = 0;
    if (commercial.poste?.id) {
      activeConversations = await this.chatRepository
        .createQueryBuilder('c')
        .where('c.poste_id = :posteId', { posteId: commercial.poste.id })
        .andWhere('c.status = :status', { status: WhatsappChatStatus.ACTIF })
        .getCount();
    }

    const responseRate =
      messagesRead > 0
        ? Math.round((messagesHandled / messagesRead) * 1000) / 10
        : 0;

    const dto = new CommercialStatsDto();
    dto.messagesRead = messagesRead;
    dto.messagesHandled = messagesHandled;
    dto.activeConversations = activeConversations;
    dto.responseRate = responseRate;
    dto.lastActivityAt = commercial.lastActivityAt;
    dto.isOnline = commercial.isConnected;

    return dto;
  }
}
