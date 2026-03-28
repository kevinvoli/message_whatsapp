import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { IsNull, Repository } from 'typeorm';
import { CronConfigService } from './cron-config.service';

export interface OfflineReinjectionPreview {
  total: number;
  conversations: { chat_id: string; name: string; poste_id: string | null; unread_count: number; last_activity_at: Date | null; read_only: boolean }[];
}

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
    this.cronConfigService.registerPreviewHandler('offline-reinject', () =>
      this.preview(),
    );
  }

  async preview(): Promise<OfflineReinjectionPreview> {
    const chats = await this.chatRepo.find({
      where: { status: WhatsappChatStatus.ACTIF, last_poste_message_at: IsNull() },
      relations: ['poste'],
    });
    const candidates = chats.filter((c) => c.poste && !c.poste.is_active);
    return {
      total: candidates.length,
      conversations: candidates.map((c) => ({
        chat_id: c.chat_id,
        name: c.name,
        poste_id: c.poste_id ?? null,
        unread_count: c.unread_count,
        last_activity_at: c.last_activity_at ?? null,
        read_only: c.read_only,
      })),
    };
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
