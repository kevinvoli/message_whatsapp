import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IntegrationOutboxService } from 'src/integration-outbox/integration-outbox.service';
import { OrderDossierMirrorWriteService, DossierMirrorPayload } from 'src/order-write/services/order-dossier-mirror-write.service';
import { ConversationReport } from './entities/conversation-report.entity';

/**
 * E02-T03 — Worker qui traite les entrées integration_outbox.
 *
 * Toutes les minutes, il réclame un lot de 20 entrées pending/failed-and-due
 * et tente la synchronisation vers DB2. En cas d'échec, un backoff
 * exponentiel (2^attempt * 60s, max 24h) est appliqué.
 *
 * À la réussite, met à jour conversation_report.submission_status = 'sent'.
 * À l'échec, met à jour conversation_report.submission_status = 'failed'.
 */
@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private processing = false;

  constructor(
    private readonly outboxService: IntegrationOutboxService,
    private readonly mirrorService: OrderDossierMirrorWriteService,
    @InjectRepository(ConversationReport)
    private readonly reportRepo: Repository<ConversationReport>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processOutbox(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this._processBatch();
    } finally {
      this.processing = false;
    }
  }

  private async _processBatch(): Promise<void> {
    const entries = await this.outboxService.claimBatch(20);
    if (entries.length === 0) return;

    this.logger.log(`DB2_SYNC_START batch=${entries.length}`);

    for (const entry of entries) {
      try {
        const payload = JSON.parse(entry.payloadJson) as DossierMirrorPayload;

        await this.mirrorService.upsertDossier(payload);

        await this.outboxService.markSuccess(entry.id);
        await this.reportRepo.update(
          { chatId: entry.entityId },
          { submissionStatus: 'sent', submissionError: null },
        );

        this.logger.log(`DB2_SYNC_SUCCESS chat=${entry.entityId}`);
      } catch (err) {
        const message = (err as Error).message;
        await this.outboxService.markFailed(entry.id, message, entry.attemptCount);
        await this.reportRepo.update(
          { chatId: entry.entityId },
          { submissionStatus: 'failed', submissionError: message.slice(0, 500) },
        );

        this.logger.warn(`DB2_SYNC_FAILED chat=${entry.entityId} attempt=${entry.attemptCount + 1}: ${message}`);
      }
    }

    this.logger.log(`DB2_SYNC_END batch=${entries.length}`);
  }
}
