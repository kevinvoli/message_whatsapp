import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { In, IsNull, Repository } from 'typeorm';
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
    // Conversations actives sur un poste hors-ligne
    const activesHorsLigne = await this.chatRepo.find({
      where: { status: WhatsappChatStatus.ACTIF, last_poste_message_at: IsNull() },
      relations: ['poste'],
    });
    const candidatesHorsLigne = activesHorsLigne.filter((c) => c.poste && !c.poste.is_active);

    // Conversations orphelines (poste_id = null, pas encore fermées/converties)
    const orphelines = await this.chatRepo.find({
      where: {
        poste_id: IsNull(),
        status: In([WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE]),
        read_only: false,
      },
    });

    const all = [...candidatesHorsLigne, ...orphelines];
    return {
      total: all.length,
      conversations: all.map((c) => ({
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

    // 1. Conversations actives sur un poste hors-ligne
    const actives = await this.chatRepo.find({
      where: {
        status: WhatsappChatStatus.ACTIF,
        last_poste_message_at: IsNull(),
      },
      relations: ['poste'],
    });

    for (const chat of actives) {
      const poste = chat.poste;
      if (!poste) continue;
      if (poste.is_active) continue;
      await this.dispatcher.reinjectConversation(chat);
    }

    // 2. Conversations orphelines (poste_id = null) — jamais assignées ou perdues
    const orphelines = await this.chatRepo.find({
      where: {
        poste_id: IsNull(),
        status: In([WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE]),
        read_only: false,
      },
    });

    this.logger.debug(`Orphelines trouvées : ${orphelines.length}`);
    for (const chat of orphelines) {
      await this.dispatcher.dispatchOrphanConversation(chat);
    }
  }
}
