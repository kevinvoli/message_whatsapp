import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FlowSessionService } from '../services/flow-session.service';
import { FlowAnalyticsService } from '../services/flow-analytics.service';
import { FlowSession, FlowSessionStatus } from '../entities/flow-session.entity';
import { BotConversationService } from '../services/bot-conversation.service';
import { BotConversationStatus } from '../entities/bot-conversation.entity';

/** Durée maximale d'une session active (heures) avant expiration forcée */
const MAX_SESSION_DURATION_HOURS = 24;

@Injectable()
export class FlowSessionCleanerJob {
  private readonly logger = new Logger(FlowSessionCleanerJob.name);

  constructor(
    private readonly sessionService: FlowSessionService,
    private readonly analyticsService: FlowAnalyticsService,
    private readonly convService: BotConversationService,
  ) {}

  /**
   * Toutes les heures — expire les sessions orphelines actives depuis plus de 24h.
   *
   * Évite les sessions fantômes qui bloquent le bot en WAITING_REPLY ou WAITING_DELAY
   * indéfiniment suite à un bug ou une déconnexion provider.
   */
  @Cron('0 0 * * * *')
  async expireOrphanedSessions(): Promise<void> {
    const sessions = await this.sessionService.findExpiredActive(MAX_SESSION_DURATION_HOURS);
    if (!sessions.length) return;

    this.logger.warn(
      `FlowSessionCleanerJob: ${sessions.length} sessions orphelines à expirer (> ${MAX_SESSION_DURATION_HOURS}h)`,
    );

    for (const session of sessions) {
      try {
        await this.expireOne(session);
      } catch (err) {
        this.logger.error(
          `FlowSessionCleanerJob: erreur expiration session ${session.id} — ${(err as Error).message}`,
        );
      }
    }
  }

  private async expireOne(session: FlowSession): Promise<void> {
    session.status = FlowSessionStatus.EXPIRED;
    session.completedAt = new Date();
    await this.sessionService.save(session);

    this.logger.log(
      `FlowSession expired id=${session.id} flowId=${session.flowId} convId=${session.conversationId}`,
    );

    // Analytics — compter comme expirée
    await this.analyticsService.recordExpiration(session);

    // Libérer la BotConversation si c'était sa session active
    const conv = await this.convService.findById(session.conversationId);
    if (conv && conv.activeSessionId === session.id) {
      conv.activeSessionId = null;
      conv.status = BotConversationStatus.IDLE;
      await this.convService.save(conv);
    }
  }
}
