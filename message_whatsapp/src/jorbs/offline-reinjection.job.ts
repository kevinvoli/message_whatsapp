import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ReinjectConversationUseCase } from 'src/dispatcher/application/reinject-conversation.use-case';
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
    private readonly reinjectUseCase: ReinjectConversationUseCase,
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
    // AM#4 — Phase 2 supprimée : les orphelins sont gérés par orphan-checker (toutes les 15 min).
    // Preview = uniquement les conversations actives sur un poste hors-ligne.
    const activesHorsLigne = await this.chatRepo.find({
      where: { status: WhatsappChatStatus.ACTIF, last_poste_message_at: IsNull() },
      relations: ['poste'],
    });
    const candidates = activesHorsLigne.filter((c) => c.poste && !c.poste.is_active);

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

  async offlineReinject(): Promise<string> {
    // RÈGLE PERMANENTE — Une conversation appartient définitivement à son poste.
    // Elle reste en EN_ATTENTE sur ce poste jusqu'à ce que l'agent se reconnecte.
    // La réinjection offline est désactivée.
    this.logger.debug('Offline reinjection ignorée — règle poste permanent active');
    return 'Ignoré — règle poste permanent (les conversations restent sur leur poste même hors-ligne)';
  }
}
