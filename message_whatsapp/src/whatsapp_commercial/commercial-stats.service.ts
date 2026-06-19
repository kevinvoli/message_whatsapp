import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappCommercial } from './entities/user.entity';
import { WhatsappMessage, MessageDirection } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CommercialStatsDto } from './dto/commercial-stats.dto';
import { ConnectionLogService } from 'src/connection-log/connection-log.service';

@Injectable()
export class CommercialStatsService {
  constructor(
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    private readonly connectionLogService: ConnectionLogService,
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

    const [
      messagesRead,
      messagesHandled,
      conversationsReceived,
      conversationsReplied,
      conversationsHandledRows,
      totalConnectionMinutes,
    ] = await Promise.all([

      // Index 0 — messagesRead (COUNT messages individuels lus par ce commercial)
      // NOTE: readByCommercialId et readByCommercialAt sont portés par les migrations de production
      this.messageRepository
        .createQueryBuilder('m')
        .where('m.readByCommercialId = :id', { id: commercialId })
        .andWhere('m.direction = :direction', { direction: MessageDirection.IN })
        .andWhere('m.readByCommercialAt >= :dateStart', { dateStart })
        .andWhere('m.readByCommercialAt <= :dateEnd', { dateEnd })
        .getCount(),

      // Index 1 — messagesHandled (premières réponses)
      // NOTE: isFirstReply est porté par les migrations de production
      this.messageRepository
        .createQueryBuilder('m')
        .where('m.commercial_id = :id', { id: commercialId })
        .andWhere('m.isFirstReply = :isFirstReply', { isFirstReply: true })
        .andWhere('m.createdAt >= :dateStart', { dateStart })
        .andWhere('m.createdAt <= :dateEnd', { dateEnd })
        .getCount(),

      // Index 2 — conversationsReceived (COUNT DISTINCT chat_id des messages IN lus)
      this.messageRepository
        .createQueryBuilder('m')
        .select('COUNT(DISTINCT m.chat_id)', 'cnt')
        .where('m.readByCommercialId = :id', { id: commercialId })
        .andWhere('m.direction = :dir', { dir: MessageDirection.IN })
        .andWhere('m.readByCommercialAt >= :dateStart', { dateStart })
        .andWhere('m.readByCommercialAt <= :dateEnd', { dateEnd })
        .getRawOne<{ cnt: string }>(),

      // Index 3 — conversationsReplied (COUNT DISTINCT chat_id des messages OUT)
      this.messageRepository
        .createQueryBuilder('m')
        .select('COUNT(DISTINCT m.chat_id)', 'cnt')
        .where('m.commercial_id = :id', { id: commercialId })
        .andWhere('m.direction = :dir', { dir: MessageDirection.OUT })
        .andWhere('m.createdAt >= :dateStart', { dateStart })
        .andWhere('m.createdAt <= :dateEnd', { dateEnd })
        .getRawOne<{ cnt: string }>(),

      // Index 4 — conversationsHandled (dernier message global du chat est de ce commercial)
      this.messageRepository.query(
        `SELECT COUNT(*) AS cnt
         FROM (
           SELECT m.chat_id
           FROM whatsapp_message m
           WHERE m.commercial_id = ?
             AND m.direction = 'OUT'
             AND m.createdAt >= ?
             AND m.createdAt <= ?
             AND m.deletedAt IS NULL
           GROUP BY m.chat_id
           HAVING MAX(m.createdAt) = (
             SELECT MAX(m2.createdAt)
             FROM whatsapp_message m2
             WHERE m2.chat_id = m.chat_id
               AND m2.deletedAt IS NULL
           )
         ) AS sub`,
        [commercialId, dateStart, dateEnd],
      ) as Promise<Array<{ cnt: string }>>,

      this.connectionLogService.getTotalConnectionMinutes(
        commercialId,
        'commercial' as const,
        dateStart,
        dateEnd,
      ),
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

    dto.conversationsReceived = parseInt(conversationsReceived?.cnt ?? '0');
    dto.conversationsReplied  = parseInt(conversationsReplied?.cnt  ?? '0');
    dto.conversationsHandled  = parseInt(conversationsHandledRows?.[0]?.cnt ?? '0');
    dto.totalConnectionMinutes = totalConnectionMinutes;

    return dto;
  }
}
