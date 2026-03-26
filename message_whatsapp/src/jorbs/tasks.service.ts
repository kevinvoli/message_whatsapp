import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IsNull, LessThan, Repository } from 'typeorm';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { EVENTS } from 'src/events/events.constants';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Toutes les 5 min — conversations dont le SLA (first_response_deadline_at) est dépassé */
  @Cron('*/5 * * * *')
  async checkSlaBreaches(): Promise<void> {
    const now = new Date();
    const breached = await this.chatRepository.find({
      where: {
        status: WhatsappChatStatus.EN_ATTENTE,
        first_response_deadline_at: LessThan(now),
      },
      select: ['id', 'chat_id', 'first_response_deadline_at'],
    });
    if (breached.length > 0) {
      this.logger.warn(
        `SLA_BREACH count=${breached.length} chatIds=${breached.map((c) => c.chat_id).join(',')}`,
      );
      this.eventEmitter.emit(EVENTS.SLA_BREACH_DETECTED, { conversations: breached });
    }
  }

  /** Toutes les 10 min — conversations en attente sans agent depuis plus de 10 min */
  @Cron('*/10 * * * *')
  async checkStuckConversations(): Promise<void> {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const stuck = await this.chatRepository.count({
      where: {
        status: WhatsappChatStatus.EN_ATTENTE,
        poste_id: IsNull(),
        last_activity_at: LessThan(tenMinutesAgo),
      },
    });
    if (stuck > 0) {
      this.logger.warn(`CONVERSATIONS_STUCK_WITHOUT_AGENT count=${stuck}`);
    }
  }
}
