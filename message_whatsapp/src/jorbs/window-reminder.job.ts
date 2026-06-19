import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CronConfigService } from 'src/jorbs/cron-config.service';
import { ChatSession } from 'src/chat-session/entities/chat-session.entity';
import { ChatSessionService } from 'src/chat-session/chat-session.service';

/**
 * Job window-reminder (D1).
 * Envoie un rappel avant la fermeture automatique de la fenêtre de messagerie.
 *
 * Logique :
 *  - Sessions actives (ended_at IS NULL) dont autoCloseAt est dans N min
 *  - N configurable : windowReminderNormalStartMin (défaut 120) / windowReminderCtwaStartMin (défaut 240)
 *  - Plafond bas : windowReminderNormalEndMin (défaut 10) / windowReminderCtwaEndMin (défaut 10)
 *  - Idempotent : lastWindowReminderSentAt IS NULL (une seule fois par session)
 *  - minReplies : le commercial doit avoir envoyé au moins N messages (défaut 1)
 */
@Injectable()
export class WindowReminderJob implements OnModuleInit {
  private readonly logger = new Logger(WindowReminderJob.name);

  constructor(
    @InjectRepository(ChatSession)
    private readonly sessionRepo: Repository<ChatSession>,
    private readonly cronConfigService: CronConfigService,
    private readonly chatSessionService: ChatSessionService,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('window-reminder', () =>
      this.run(),
    );
  }

  async run(): Promise<string> {
    const config = await this.cronConfigService.findByKey('window-reminder').catch(() => null);
    if (!config?.enabled) {
      return 'window-reminder désactivé';
    }

    const now = new Date();

    // Fenêtre normale
    const normalStartMin = config.windowReminderNormalStartMin ?? 120;
    const normalEndMin   = config.windowReminderNormalEndMin   ?? 10;

    // Fenêtre CTWA
    const ctwaStartMin = config.windowReminderCtwaStartMin ?? 240;
    const ctwaEndMin   = config.windowReminderCtwaEndMin   ?? 10;

    const minReplies = config.windowReminderMinReplies ?? 1;

    // Calculer les bornes temporelles
    const normalUpperBound = new Date(now.getTime() + normalStartMin * 60_000);
    const normalLowerBound = new Date(now.getTime() + normalEndMin   * 60_000);
    const ctwaUpperBound   = new Date(now.getTime() + ctwaStartMin   * 60_000);
    const ctwaLowerBound   = new Date(now.getTime() + ctwaEndMin     * 60_000);

    // Sessions candidates : actives, non rappelées, dans la fenêtre
    const candidates = await this.sessionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.chat', 'chat')
      .where('s.endedAt IS NULL')
      .andWhere('s.lastWindowReminderSentAt IS NULL')
      .andWhere('s.autoCloseAt IS NOT NULL')
      .andWhere(
        `(
          (s.isCtwa = false AND s.autoCloseAt > :normalLower AND s.autoCloseAt < :normalUpper)
          OR
          (s.isCtwa = true  AND s.autoCloseAt > :ctwaLower   AND s.autoCloseAt < :ctwaUpper)
        )`,
        { normalLower: normalLowerBound, normalUpper: normalUpperBound, ctwaLower: ctwaLowerBound, ctwaUpper: ctwaUpperBound },
      )
      .getMany();

    if (candidates.length === 0) {
      return 'window-reminder: aucune session candidate';
    }

    let sent = 0;
    let skipped = 0;

    for (const session of candidates) {
      try {
        // Vérifier le nombre minimum de réponses commerciales
        if (minReplies > 0) {
          const replyCount: Array<{ cnt: string }> = await this.sessionRepo.query(
            `SELECT COUNT(*) AS cnt
             FROM whatsapp_message
             WHERE chat_id = (SELECT chat_id FROM whatsapp_chat WHERE id = ?)
               AND from_me = 1
               AND deleted_at IS NULL
               AND timestamp >= ?`,
            [session.whatsappChatId, session.startedAt],
          );
          const count = parseInt(replyCount[0]?.cnt ?? '0', 10);
          if (count < minReplies) {
            skipped++;
            continue;
          }
        }

        // Marquer atomiquement (idempotent — retourne false si déjà fait)
        const marked = await this.chatSessionService.markWindowReminderSent(
          session.id,
          session.whatsappChatId,
        );
        if (!marked) {
          skipped++;
          continue;
        }

        this.logger.log(
          `window-reminder: rappel marqué session=${session.id} chat=${session.whatsappChatId} isCtwa=${session.isCtwa} autoCloseAt=${session.autoCloseAt?.toISOString()}`,
        );
        sent++;
      } catch (err) {
        this.logger.error(
          `window-reminder: erreur session=${session.id}: ${(err as Error).message}`,
        );
      }
    }

    return `window-reminder: ${sent} rappel(s) envoyé(s), ${skipped} ignoré(s) sur ${candidates.length} candidat(s)`;
  }
}
