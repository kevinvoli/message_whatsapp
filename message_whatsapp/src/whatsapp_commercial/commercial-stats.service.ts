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

  private periodeToDateStart(periode: string): Date {
    const now = new Date();
    switch (periode) {
      case 'week': {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      case 'month': {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      case 'year': {
        const d = new Date(now);
        d.setDate(d.getDate() - 365);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      default: {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
  }

  private dateRange(periode: string, dateFrom?: string, dateTo?: string): { dateStart: Date; dateEnd: Date } {
    const toStartOfDay = (s: string): Date => { const d = new Date(s); d.setHours(0, 0, 0, 0); return d; };
    const toEndOfDay   = (s: string): Date => { const d = new Date(s); d.setHours(23, 59, 59, 999); return d; };
    if (dateFrom && dateTo) return { dateStart: toStartOfDay(dateFrom), dateEnd: toEndOfDay(dateTo) };
    if (dateFrom) return { dateStart: toStartOfDay(dateFrom), dateEnd: toEndOfDay(dateFrom) };
    if (dateTo)   return { dateStart: toStartOfDay(dateTo),   dateEnd: toEndOfDay(dateTo) };
    return { dateStart: this.periodeToDateStart(periode), dateEnd: new Date() };
  }

  async getStats(
    commercialId: string,
    periode = 'today',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<CommercialStatsDto> {
    const commercial = await this.commercialRepository.findOne({
      where: { id: commercialId },
      relations: ['poste'],
    });
    if (!commercial) {
      throw new NotFoundException(`Commercial ${commercialId} introuvable`);
    }

    const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);

    const [messagesRead, messagesHandled] = await Promise.all([
      this.messageRepository
        .createQueryBuilder('m')
        .where('m.readByCommercialId = :id', { id: commercialId })
        .andWhere('m.direction = :direction', { direction: MessageDirection.IN })
        .andWhere('m.readByCommercialAt >= :dateStart', { dateStart })
        .andWhere('m.readByCommercialAt <= :dateEnd', { dateEnd })
        .getCount(),
      this.messageRepository
        .createQueryBuilder('m')
        .where('m.commercial_id = :id', { id: commercialId })
        .andWhere('m.isFirstReply = :isFirstReply', { isFirstReply: true })
        .andWhere('m.createdAt >= :dateStart', { dateStart })
        .andWhere('m.createdAt <= :dateEnd', { dateEnd })
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
        ? Math.min(Math.round((messagesHandled / messagesRead) * 1000) / 10, 100)
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
