import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { In, IsNull, Repository } from 'typeorm';
import { CronConfigService } from './cron-config.service';

@Injectable()
export class OrphanCheckerJob implements OnModuleInit {
  private readonly logger = new Logger(OrphanCheckerJob.name);

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly dispatcher: DispatcherService,
    private readonly cronConfigService: CronConfigService,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('orphan-checker', () =>
      this.checkOrphans(),
    );
  }

  async checkOrphans(): Promise<string> {
    // Désactivé entre 21h et 5h — commerciaux hors ligne
    const hour = new Date().getHours();
    if (hour >= 21 || hour < 5) {
      this.logger.debug(
        `Orphan checker ignoré — hors plage horaire (${hour}h, actif 5h–21h)`,
      );
      return `Ignoré — hors plage horaire (${hour}h, actif 5h–21h)`;
    }

    const orphans = await this.chatRepo.find({
      where: {
        poste_id: IsNull(),
        status: In([WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE]),
        read_only: false,
      },
      order: { last_activity_at: 'ASC' },
      take: 20,
    });

    if (orphans.length === 0) {
      return 'Aucun orphelin trouvé';
    }

    this.logger.warn(`Orphan checker — ${orphans.length} orphelin(s) trouvé(s)`);

    let dispatched = 0;
    let stillWaiting = 0;

    for (const chat of orphans) {
      try {
        await this.dispatcher.dispatchOrphanConversation(chat);
        dispatched++;
      } catch (err) {
        this.logger.error(
          `Erreur dispatch orphelin ${chat.chat_id}: ${(err as Error).message}`,
        );
        stillWaiting++;
      }
    }

    return `${dispatched} orphelin(s) dispatché(s), ${stillWaiting} encore en attente`;
  }
}
