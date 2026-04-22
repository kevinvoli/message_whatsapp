import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { ConversationPublisher } from 'src/realtime/publishers/conversation.publisher';
import { LessThan, Not, Repository } from 'typeorm';
import { CronConfigService } from 'src/jorbs/cron-config.service';
import { transitionStatus } from 'src/conversations/domain/conversation-state-machine';
import { ChannelService } from 'src/channel/channel.service';
import { ConversationReportService } from 'src/gicop-report/conversation-report.service';
import { SystemConfigService } from 'src/system-config/system-config.service';

export interface ReadOnlyEnforcementPreview {
  total: number;
  conversations: {
    chat_id: string;
    name: string;
    status: string;
    last_activity_at: Date;
    idle_hours: number;
  }[];
}

@Injectable()
export class ReadOnlyEnforcementJob implements OnModuleInit {
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly conversationPublisher: ConversationPublisher,
    private readonly cronConfigService: CronConfigService,
    private readonly channelService: ChannelService,

    @Optional()
    private readonly reportService: ConversationReportService,

    @Optional()
    private readonly systemConfig: SystemConfigService,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('read-only-enforcement', () =>
      this.enforce(),
    );
    this.cronConfigService.registerPreviewHandler('read-only-enforcement', () =>
      this.preview(),
    );
  }

  private async getThresholdMs(): Promise<number> {
    try {
      const config = await this.cronConfigService.findByKey('read-only-enforcement');
      const hours = config.ttlDays && config.ttlDays > 0 ? config.ttlDays : 24;
      return hours * 60 * 60 * 1000;
    } catch {
      return 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Conversations éligibles à la fermeture automatique :
   * - status != fermé
   * - last_activity_at < seuil → aucune activité (client ou commercial) depuis plus de N heures
   *
   * On se base sur last_activity_at plutôt que last_poste_message_at ou createdAt
   * pour éviter de refermer une conversation que le client vient de rouvrir.
   * last_activity_at est mis à jour à chaque message entrant (incrementUnreadCount).
   */
  private async findEligible(limit: Date): Promise<WhatsappChat[]> {
    return this.chatRepo.find({
      where: {
        status: Not(WhatsappChatStatus.FERME),
        last_activity_at: LessThan(limit),
      },
    });
  }

  async preview(): Promise<ReadOnlyEnforcementPreview> {
    const thresholdMs = await this.getThresholdMs();
    const limit = new Date(Date.now() - thresholdMs);
    const chats = await this.findEligible(limit);

    return {
      total: chats.length,
      conversations: chats.map((c) => ({
        chat_id: c.chat_id,
        name: c.name,
        status: c.status,
        last_activity_at: c.last_activity_at,
        idle_hours: Math.floor(
          (Date.now() - new Date(c.last_activity_at).getTime()) / 3_600_000,
        ),
      })),
    };
  }

  async enforce(): Promise<string> {
    const thresholdMs = await this.getThresholdMs();
    const limit = new Date(Date.now() - thresholdMs);
    const chats = await this.findEligible(limit);

    const gicoRequired = this.systemConfig
      ? (await this.systemConfig.get('FF_GICOP_REPORT_REQUIRED')) === 'true'
      : false;

    let closed = 0;
    let skipped = 0;
    for (const chat of chats) {
      // Ne jamais fermer une conversation si no_close est activé sur le canal
      const channelId = chat.last_msg_client_channel_id ?? null;
      if (channelId && await this.channelService.isCloseBlocked(channelId)) {
        skipped++;
        continue;
      }
      // S4-005 — Ne pas fermer auto si rapport GICOP requis et incomplet
      if (gicoRequired && this.reportService) {
        const complete = await this.reportService.isReportComplete(chat.chat_id);
        if (!complete) {
          skipped++;
          continue;
        }
      }
      transitionStatus(chat.chat_id, chat.status, WhatsappChatStatus.FERME, 'ReadOnlyEnforcementJob');
      chat.status = WhatsappChatStatus.FERME;
      chat.read_only = false;
      await this.chatRepo.save(chat);
      await this.conversationPublisher.emitConversationClosed(chat);
      closed++;
    }
    return `${closed} conversation(s) fermée(s) automatiquement${skipped > 0 ? ` (${skipped} ignorée(s))` : ''}`;
  }
}
