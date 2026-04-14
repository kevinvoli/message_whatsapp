import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlowSessionService } from '../services/flow-session.service';
import { FlowAnalyticsService } from '../services/flow-analytics.service';
import { FlowSession, FlowSessionStatus } from '../entities/flow-session.entity';
import { FlowSessionLog } from '../entities/flow-session-log.entity';
import { BotConversationService } from '../services/bot-conversation.service';
import { BotConversationStatus } from '../entities/bot-conversation.entity';

/** Durée maximale d'une session active (heures) avant expiration forcée */
const MAX_SESSION_DURATION_HOURS = 24;

@Injectable()
export class FlowSessionCleanerJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(FlowSessionCleanerJob.name);

  constructor(
    private readonly sessionService: FlowSessionService,
    private readonly analyticsService: FlowAnalyticsService,
    private readonly convService: BotConversationService,
    @InjectRepository(FlowSessionLog)
    private readonly logRepo: Repository<FlowSessionLog>,
  ) {}

  /**
   * §13.4 — Scan de démarrage : après un restart, les sessions bloquées
   * (ACTIVE, WAITING_DELAY, WAITING_REPLY) depuis > 24h sont immédiatement
   * nettoyées plutôt qu'attendr le prochain cycle horaire.
   */
  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('FlowSessionCleanerJob: startup scan des sessions orphelines...');
    try {
      await this.runCleanup();
    } catch (err) {
      this.logger.error(`FlowSessionCleanerJob: erreur startup scan — ${(err as Error).message}`);
    }
  }

  /**
   * Toutes les heures — expire les sessions orphelines actives depuis plus de 24h.
   *
   * Couvre :
   *  - ACTIVE / WAITING_DELAY > 24h (startedAt)
   *  - WAITING_REPLY sans activité > 24h (lastActivityAt)
   */
  @Cron('0 0 * * * *')
  async expireOrphanedSessions(): Promise<void> {
    await this.runCleanup();
  }

  // ─────────────────────────────────────────────────────────────────────────────

  private async runCleanup(): Promise<void> {
    const [activeStale, waitingReplyStale] = await Promise.all([
      this.sessionService.findExpiredActive(MAX_SESSION_DURATION_HOURS),
      this.sessionService.findStaleWaitingReply(MAX_SESSION_DURATION_HOURS),
    ]);

    const all = [...activeStale, ...waitingReplyStale];
    if (!all.length) return;

    this.logger.warn(
      `FlowSessionCleanerJob: ${all.length} session(s) à expirer ` +
      `(active/delay: ${activeStale.length}, waiting_reply: ${waitingReplyStale.length})`,
    );

    for (const session of all) {
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
      `FlowSession expired id=${session.id} flowId=${session.flowId} ` +
      `convId=${session.conversationId} previousStatus=${session.status}`,
    );

    // Audit trail — entrée dans flow_session_log pour la traçabilité
    const log = this.logRepo.create({
      sessionId: session.id,
      nodeId: null,
      nodeType: null,
      edgeTakenId: null,
      action: 'SESSION_EXPIRED',
      result: `Expirée par FlowSessionCleanerJob (> ${MAX_SESSION_DURATION_HOURS}h)`,
      metadata: { previousStatus: session.status, expiredAt: new Date().toISOString() },
      executedAt: new Date(),
    });
    await this.logRepo.save(log);

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
