import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { MessageAutoService } from 'src/message-auto/message-auto.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { Repository } from 'typeorm';
import { CronConfigService } from './cron-config.service';

@Injectable()
export class FirstResponseTimeoutJob implements OnModuleInit {
  private readonly logger = new Logger(FirstResponseTimeoutJob.name);

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly dispatcher: DispatcherService,
    private readonly messageAutoService: MessageAutoService,
    private readonly cronConfigService: CronConfigService,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('sla-checker', async (manual = false) => {
      // Plage horaire ignorée pour les exécutions manuelles (bouton admin)
      if (!manual) {
        const hour = new Date().getHours();
        if (hour >= 21 || hour < 5) {
          this.logger.debug(
            `SLA checker ignoré — hors plage horaire (${hour}h, plage active : 5h–21h)`,
          );
          return `Ignoré — hors plage horaire (${hour}h, actif 5h–21h)`;
        }
      }
      // noResponseThresholdMinutes : seuil de redispatch (défaut 60 min, configurable).
      // intervalMinutes : fréquence du cron (configurable librement) — ces deux valeurs sont indépendantes.
      const config = await this.cronConfigService.findByKey('sla-checker');
      const thresholdMinutes = config.noResponseThresholdMinutes ?? 15;
      const batchSize = config.maxSteps ?? 300;
      return this.dispatcher.jobRunnerAllPostes(thresholdMinutes, batchSize);
    });
    this.cronConfigService.registerPreviewHandler('sla-checker', () =>
      this.previewExpiredSla(),
    );
  }

  async previewExpiredSla(): Promise<{
    total: number;
    threshold_minutes: number;
    conversations: { chat_id: string; name: string; status: string; last_client_message_at: Date | null; minutes_waiting: number }[];
  }> {
    const config = await this.cronConfigService.findByKey('sla-checker');
    const thresholdMinutes = config.noResponseThresholdMinutes ?? 15;
    const threshold = new Date(Date.now() - thresholdMinutes * 60_000);

    const dedicatedExclusion = `(
      (chat.channel_id IS NULL OR chat.channel_id NOT IN
        (SELECT c.channel_id FROM whapi_channels c WHERE c.poste_id IS NOT NULL))
      AND (chat.poste_id IS NULL OR chat.poste_id NOT IN
        (SELECT c.poste_id FROM whapi_channels c WHERE c.poste_id IS NOT NULL))
    )`;

    const chats = await this.chatRepo
      .createQueryBuilder('chat')
      .where('chat.unread_count > 0')
      .andWhere('chat.last_client_message_at < :threshold', { threshold })
      .andWhere('chat.deletedAt IS NULL')
      .andWhere(dedicatedExclusion)
      .orderBy('chat.last_client_message_at', 'ASC')
      .getMany();

    return {
      total: chats.length,
      threshold_minutes: thresholdMinutes,
      conversations: chats.map((c) => ({
        chat_id: c.chat_id,
        name: c.name,
        status: c.status,
        last_client_message_at: c.last_client_message_at ?? null,
        minutes_waiting: c.last_client_message_at
          ? Math.floor((Date.now() - new Date(c.last_client_message_at).getTime()) / 60_000)
          : 0,
      })),
    };
  }

  /** Appelé par la gateway à la connexion d'un agent : check immédiat pour ce poste. */
  async startAgentSlaMonitor(posteId: string): Promise<void> {
    this.logger.debug(`SLA immediate check on agent connect (poste ${posteId})`);
    try {
      await this.dispatcher.jobRunnertcheque(posteId);
    } catch (error) {
      this.logger.warn(`SLA immediate check error (${posteId}): ${String(error)}`);
    }
  }

  /** Appelé par la gateway à la déconnexion d'un agent (hook de nettoyage si besoin). */
  stopAgentSlaMonitor(posteId: string): void {
    this.logger.debug(`Agent disconnected, SLA monitor stopped (poste ${posteId})`);
  }
}
