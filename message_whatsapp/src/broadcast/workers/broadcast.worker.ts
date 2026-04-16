import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { BROADCAST_QUEUE } from '../broadcast.service';
import {
  WhatsappBroadcastRecipient,
  RecipientStatus,
} from '../entities/broadcast-recipient.entity';
import {
  WhatsappBroadcast,
  BroadcastStatus,
} from '../entities/broadcast.entity';
import { WhatsappTemplate } from 'src/whatsapp-template/entities/whatsapp-template.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';

interface SendBatchJobData {
  broadcastId: string;
  tenantId: string;
  channelId: string;
  templateId: string;
  recipientIds: string[];
}

/**
 * P4.3 — Worker d'envoi de broadcast HSM.
 *
 * Traite un batch de 50 destinataires par job.
 * Gère les erreurs individuelles sans bloquer le reste du batch.
 */
@Processor(BROADCAST_QUEUE, { concurrency: 2 })
export class BroadcastWorker extends WorkerHost {
  private readonly logger = new Logger(BroadcastWorker.name);

  constructor(
    @InjectRepository(WhatsappBroadcastRecipient)
    private readonly recipientRepo: Repository<WhatsappBroadcastRecipient>,

    @InjectRepository(WhatsappBroadcast)
    private readonly broadcastRepo: Repository<WhatsappBroadcast>,

    @InjectRepository(WhatsappTemplate)
    private readonly templateRepo: Repository<WhatsappTemplate>,

    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,

    private readonly metaService: CommunicationMetaService,
  ) {
    super();
  }

  async process(job: Job<SendBatchJobData>): Promise<void> {
    const { broadcastId, recipientIds, channelId, templateId } = job.data;

    // Vérifier que le broadcast n'est pas annulé/pausé
    const broadcast = await this.broadcastRepo.findOne({ where: { id: broadcastId } });
    if (!broadcast || broadcast.status === BroadcastStatus.CANCELLED || broadcast.status === BroadcastStatus.PAUSED) {
      this.logger.warn(`Broadcast ${broadcastId} ${broadcast?.status ?? 'introuvable'} — batch ignoré`);
      return;
    }

    const [recipients, template, channel] = await Promise.all([
      this.recipientRepo.findByIds(recipientIds),
      this.templateRepo.findOne({ where: { id: templateId } }),
      this.channelRepo.findOne({ where: { channel_id: channelId } }),
    ]);

    if (!template || !channel) {
      this.logger.error(`Broadcast ${broadcastId}: template ou channel introuvable`);
      return;
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      try {
        const result = await this.metaService.sendTemplateMessage({
          to: recipient.phone,
          phoneNumberId: channel.external_id ?? channelId,
          accessToken: channel.token,
          templateName: template.name,
          language: template.language,
          variables: recipient.variables ?? {},
        });

        await this.recipientRepo.update(recipient.id, {
          status: RecipientStatus.SENT,
          provider_message_id: result.providerMessageId,
          sent_at: new Date(),
        });
        sentCount++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await this.recipientRepo.update(recipient.id, {
          status: RecipientStatus.FAILED,
          error_message: errorMsg.slice(0, 255),
        });
        failedCount++;
        this.logger.warn(
          `Broadcast ${broadcastId} recipient ${recipient.phone} failed: ${errorMsg}`,
        );
      }
    }

    // Mise à jour des compteurs du broadcast
    await this.broadcastRepo.increment({ id: broadcastId }, 'sent_count', sentCount);
    if (failedCount > 0) {
      await this.broadcastRepo.increment({ id: broadcastId }, 'failed_count', failedCount);
    }

    // Vérifier si le broadcast est terminé
    await this.checkCompletion(broadcastId);

    this.logger.log(
      `Broadcast ${broadcastId} batch done: ${sentCount} envoyés, ${failedCount} échoués`,
    );
  }

  private async checkCompletion(broadcastId: string): Promise<void> {
    const broadcast = await this.broadcastRepo.findOne({ where: { id: broadcastId } });
    if (!broadcast) return;

    const processed = broadcast.sent_count + broadcast.failed_count;
    if (processed >= broadcast.total_count && broadcast.status === BroadcastStatus.RUNNING) {
      await this.broadcastRepo.update(broadcastId, {
        status: BroadcastStatus.COMPLETED,
        completed_at: new Date(),
      });
      this.logger.log(`Broadcast ${broadcastId} terminé — ${broadcast.sent_count}/${broadcast.total_count} envoyés`);
    }
  }
}
