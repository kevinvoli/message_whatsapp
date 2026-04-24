import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeServerService } from '../realtime-server.service';
import {
  FOLLOW_UP_REMINDER_EVENT,
  FollowUpReminderPayload,
} from 'src/follow-up/follow_up_reminder.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Injectable()
export class FollowUpPublisher {
  private readonly logger = new Logger(FollowUpPublisher.name);

  constructor(
    private readonly realtimeServer: RealtimeServerService,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
  ) {}

  @OnEvent(FOLLOW_UP_REMINDER_EVENT, { async: true })
  async handleReminder(payload: FollowUpReminderPayload): Promise<void> {
    const commercial = await this.commercialRepo.findOne({
      where: { id: payload.commercialId },
      relations: ['poste'],
    });

    if (!commercial?.poste?.id) {
      this.logger.debug(
        `FollowUpPublisher: commercial ${payload.commercialId} sans poste — rappel non diffusé`,
      );
      return;
    }

    this.realtimeServer.getServer()
      .to(`poste:${commercial.poste.id}`)
      .emit('chat:event', {
        type: 'FOLLOW_UP_REMINDER',
        payload: {
          commercial_id:  payload.commercialId,
          follow_up_id:   payload.followUpId,
          scheduled_at:   payload.scheduledAt,
          type:           payload.type,
        },
      });

    this.logger.log(
      `FOLLOW_UP_REMINDER → poste:${commercial.poste.id} (commercial=${payload.commercialId})`,
    );
  }
}
