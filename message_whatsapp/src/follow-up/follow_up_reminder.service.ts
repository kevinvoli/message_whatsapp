import { Injectable, Logger, Optional } from '@nestjs/common';
import { DistributedLockService } from 'src/redis/distributed-lock.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { IsNull, LessThanOrEqual, In, LessThan } from 'typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FollowUp, FollowUpStatus } from './entities/follow_up.entity';
import { FollowUpTemplateMapping } from './entities/follow-up-template-mapping.entity';
import { PlatformSettingsService } from 'src/platform-settings/platform-settings.service';
import { Contact } from 'src/contact/entities/contact.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { OutboundRouterService } from 'src/communication_whapi/outbound-router.service';
import { ChannelService } from 'src/channel/channel.service';

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
    @InjectRepository(FollowUpTemplateMapping)
    private readonly mappingRepo: Repository<FollowUpTemplateMapping>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly eventEmitter: EventEmitter2,
    private readonly platformSettings: PlatformSettingsService,
    private readonly outboundRouter: OutboundRouterService,
    private readonly channelService: ChannelService,
    @Optional() private readonly lockService: DistributedLockService,
  ) {}

  @Cron('*/5 * * * *')
  async sendReminders(): Promise<void> {
    if (this.lockService) {
      const { acquired } = await this.lockService.tryWithLock(
        'cron:follow-up-reminders', 450_000,
        () => this._sendReminders(),
      );
      if (!acquired) { this.logger.debug('LOCK_SKIPPED cron:follow-up-reminders'); }
      return;
    }
    await this._sendReminders();
  }

  private async _sendReminders(): Promise<void> {
    const now = new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    const dues = await this.repo.find({
      where: [
        { status: FollowUpStatus.PLANIFIEE, scheduled_at: LessThanOrEqual(now), reminded_at: IsNull() },
        { status: FollowUpStatus.EN_RETARD, reminded_at: IsNull() },
        { status: FollowUpStatus.EN_RETARD, reminded_at: LessThan(thirtyMinutesAgo) },
      ],
      select: ['id', 'commercial_id', 'scheduled_at', 'type', 'notes', 'reminded_at', 'contact_id', 'conversation_id', 'lastTemplateSentAt'],
    });

    if (dues.length === 0) return;

    this.logger.log(`FollowUpReminder: ${dues.length} relance(s) à notifier`);

    const autoRelanceEnabled = await this.platformSettings.isEnabled('auto_relance_enabled');

    for (const followUp of dues) {
      if (!followUp.commercial_id) continue;

      const payload: FollowUpReminderPayload = {
        followUpId:   followUp.id,
        commercialId: followUp.commercial_id,
        scheduledAt:  followUp.scheduled_at,
        type:         followUp.type,
        notes:        followUp.notes ?? null,
      };

      const isRenotification = followUp.reminded_at !== null;
      this.logger.log(
        `FOLLOW_UP_REMINDER_SENT id=${followUp.id} commercial=${followUp.commercial_id} type=${followUp.type}${isRenotification ? ' [RE-NOTIF]' : ''}`,
      );
      this.eventEmitter.emit(FOLLOW_UP_REMINDER_EVENT, payload);

      if (autoRelanceEnabled) {
        await this.trySendTemplate(followUp, now);
      }
    }

    await this.repo
      .createQueryBuilder()
      .update(FollowUp)
      .set({ reminded_at: now })
      .where({ id: In(dues.map((f) => f.id)) })
      .execute();
  }

  private async trySendTemplate(followUp: FollowUp, now: Date): Promise<void> {
    try {
      const mapping = await this.mappingRepo.findOne({
        where: { followUpType: followUp.type, active: 1 },
      });
      if (!mapping) return;

      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      if (followUp.lastTemplateSentAt && followUp.lastTemplateSentAt > twentyFourHoursAgo) {
        return;
      }

      let clientPhone: string | null = null;

      if (followUp.contact_id) {
        const contact = await this.contactRepo.findOne({
          where: { id: followUp.contact_id },
          select: ['phone'],
        });
        clientPhone = contact?.phone ?? null;
      } else if (followUp.conversation_id) {
        const chat = await this.chatRepo.findOne({
          where: { id: followUp.conversation_id },
          select: ['chat_id'],
        });
        clientPhone = chat?.chat_id ?? null;
      }

      if (!clientPhone) {
        this.logger.warn(`trySendTemplate: téléphone client introuvable pour relance ${followUp.id}`);
        return;
      }

      let channelId: string | null = null;

      if (followUp.conversation_id) {
        const chat = await this.chatRepo.findOne({
          where: { id: followUp.conversation_id },
          select: ['channel_id'],
        });
        channelId = chat?.channel_id ?? null;
      }

      if (!channelId) {
        this.logger.warn(`trySendTemplate: channel_id introuvable pour relance ${followUp.id}`);
        return;
      }

      const result = await this.outboundRouter.sendTemplateMessage({
        to: clientPhone,
        channelId,
        templateName: mapping.templateName!,
        languageCode: mapping.languageCode,
      });

      await this.repo.update(followUp.id, {
        lastTemplateSentAt: now,
        templateProviderMessageId: result.providerMessageId,
      });

      this.logger.log(`Template ${mapping.templateName} envoyé au client pour relance ${followUp.id}`);

      // Incrémenter le compteur de messages sortants et vérifier la limite read_only.
      if (followUp.conversation_id) {
        await this.chatRepo.update(
          { id: followUp.conversation_id },
          { outboundMessageCount: () => 'outbound_message_count + 1' },
        );
        const updatedChat = await this.chatRepo.findOne({
          where: { id: followUp.conversation_id },
          select: ['chat_id', 'outboundMessageCount', 'channel_id'],
        });
        if (updatedChat) {
          const limit = await this.channelService.getEffectiveMessageLimit(updatedChat.channel_id ?? '');
          if (limit > 0 && (updatedChat.outboundMessageCount ?? 0) >= limit) {
            await this.chatRepo.update({ id: followUp.conversation_id }, { read_only: true });
          }
        }
      }
    } catch (err) {
      this.logger.warn(`trySendTemplate: échec envoi template pour relance ${followUp.id} — ${(err as Error).message}`);
    }
  }
}
