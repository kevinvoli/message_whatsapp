import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import { MessageAutoService } from 'src/message-auto/message-auto.service';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { In, IsNull, LessThan, Repository } from 'typeorm';
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
    this.cronConfigService.registerHandler('sla-checker', async () => {
      // Désactivé entre 21h et 5h — tous les commerciaux sont hors ligne
      const hour = new Date().getHours();
      if (hour >= 21 || hour < 5) {
        this.logger.debug(
          `SLA checker ignoré — hors plage horaire (${hour}h, plage active : 5h–21h)`,
        );
        return `Ignoré — hors plage horaire (${hour}h, actif 5h–21h)`;
      }
      return this.dispatcher.jobRunnerAllPostes();
    });
    this.cronConfigService.registerPreviewHandler('sla-checker', () =>
      this.previewExpiredSla(),
    );
  }

  async previewExpiredSla(): Promise<{
    total: number;
    conversations: { chat_id: string; name: string; status: string; first_response_deadline_at: Date | null; minutes_overdue: number }[];
  }> {
    const now = new Date();
    const chats = await this.chatRepo.find({
      where: {
        status: In([WhatsappChatStatus.EN_ATTENTE, WhatsappChatStatus.ACTIF]),
        last_poste_message_at: IsNull(),
        first_response_deadline_at: LessThan(now),
      },
    });
    return {
      total: chats.length,
      conversations: chats.map((c) => ({
        chat_id: c.chat_id,
        name: c.name,
        status: c.status,
        first_response_deadline_at: c.first_response_deadline_at ?? null,
        minutes_overdue: c.first_response_deadline_at
          ? Math.floor((Date.now() - new Date(c.first_response_deadline_at).getTime()) / 60_000)
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
