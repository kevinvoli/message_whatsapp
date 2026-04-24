import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { IsNull, LessThanOrEqual, In } from 'typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FollowUp, FollowUpStatus } from './entities/follow_up.entity';

export const FOLLOW_UP_REMINDER_EVENT = 'follow_up.reminder';

export interface FollowUpReminderPayload {
  followUpId: string;
  commercialId: string;
  scheduledAt: Date;
  type: string;
  notes?: string | null;
}

@Injectable()
export class FollowUpReminderService {
  private readonly logger = new Logger(FollowUpReminderService.name);

  constructor(
    @InjectRepository(FollowUp)
    private readonly repo: Repository<FollowUp>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron('*/5 * * * *')
  async sendReminders(): Promise<void> {
    const now = new Date();

    const dues = await this.repo.find({
      where: [
        { status: FollowUpStatus.PLANIFIEE, scheduled_at: LessThanOrEqual(now), reminded_at: IsNull() },
        { status: FollowUpStatus.EN_RETARD, reminded_at: IsNull() },
      ],
      select: ['id', 'commercial_id', 'scheduled_at', 'type', 'notes'],
    });

    if (dues.length === 0) return;

    this.logger.log(`FollowUpReminder: ${dues.length} relance(s) à notifier`);

    for (const followUp of dues) {
      if (!followUp.commercial_id) continue;

      const payload: FollowUpReminderPayload = {
        followUpId:   followUp.id,
        commercialId: followUp.commercial_id,
        scheduledAt:  followUp.scheduled_at,
        type:         followUp.type,
        notes:        followUp.notes ?? null,
      };

      this.eventEmitter.emit(FOLLOW_UP_REMINDER_EVENT, payload);
    }

    await this.repo
      .createQueryBuilder()
      .update(FollowUp)
      .set({ reminded_at: now })
      .where({ id: In(dues.map((f) => f.id)) })
      .execute();
  }
}
