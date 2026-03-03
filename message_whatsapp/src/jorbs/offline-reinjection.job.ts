import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { IsNull, Repository } from 'typeorm';
import { CronConfigService } from './cron-config.service';

@Injectable()
export class OfflineReinjectionJob implements OnModuleInit {
  private readonly logger = new Logger(OfflineReinjectionJob.name);
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly dispatcher: DispatcherService,
    private readonly cronConfigService: CronConfigService,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('offline-reinject', () =>
      this.offlineReinject(),
    );
  }

  async offlineReinject() {
    this.logger.debug('Offline reinjection cron started');

    const chats = await this.chatRepo.find({
      where: {
        status: WhatsappChatStatus.ACTIF,
        last_poste_message_at: IsNull(),
      },
      relations: ['poste'],
    });

    for (const chat of chats) {
      const poste = chat.poste;
      if (!poste) continue;
      if (poste.is_active) continue;

      await this.dispatcher.reinjectConversation(chat);
    }
  }
}
