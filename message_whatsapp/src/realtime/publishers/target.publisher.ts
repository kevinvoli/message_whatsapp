import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RealtimeServerService } from '../realtime-server.service';
import { TargetsService } from 'src/targets/targets.service';

@Injectable()
export class TargetPublisher {
  private readonly logger = new Logger(TargetPublisher.name);

  constructor(
    private readonly realtimeServer: RealtimeServerService,
    private readonly targetsService: TargetsService,
  ) {}

  /**
   * À chaque soumission de rapport, recalcule la progression des objectifs
   * du commercial et pousse TARGET_PROGRESS_UPDATE via socket.
   * N'émet que si le commercial a au moins un objectif défini.
   */
  @OnEvent('conversation.report.submitted', { async: true })
  async handleReportSubmitted(payload: {
    chatId: string;
    commercialId: string;
    posteId: string | null;
  }): Promise<void> {
    if (!payload.commercialId) return;

    try {
      const progress = await this.targetsService.getProgress(payload.commercialId);
      if (progress.length === 0) return;

      this.realtimeServer
        .getServer()
        .to(`commercial:${payload.commercialId}`)
        .emit('chat:event', {
          type: 'TARGET_PROGRESS_UPDATE',
          payload: progress,
        });

      this.logger.debug(
        `TARGET_PROGRESS_UPDATE → commercial:${payload.commercialId} (${progress.length} objectif(s))`,
      );
    } catch (err) {
      this.logger.warn(
        `TargetPublisher: erreur pour commercial ${payload.commercialId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
