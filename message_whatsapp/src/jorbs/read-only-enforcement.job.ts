import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { Repository } from 'typeorm';
import { CronConfigService } from 'src/jorbs/cron-config.service';
import { ChannelService } from 'src/channel/channel.service';
import { AppLogger } from 'src/logging/app-logger.service';
import { ChatSessionService } from 'src/chat-session/chat-session.service';

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
  private consecutiveZeroClosures = 0;

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly gateway: WhatsappMessageGateway,
    private readonly cronConfigService: CronConfigService,
    private readonly channelService: ChannelService,
    private readonly logger: AppLogger,
    private readonly chatSessionService: ChatSessionService,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('read-only-enforcement', () =>
      this.enforce(),
    );
    this.cronConfigService.registerPreviewHandler('read-only-enforcement', () =>
      this.preview(),
    );
  }

  /**
   * Requête directe sur WhatsappChat.windowExpiresAt — couvre toutes les
   * conversations (ACTIF et EN_ATTENTE) même sans session chat_session ouverte,
   * ce qu'un INNER JOIN sur chat_session rate.
   */
  private async findExpiredChats(): Promise<WhatsappChat[]> {
    const now = new Date();
    return this.chatRepo
      .createQueryBuilder('c')
      .where('c.status IN (:...statuses)', {
        statuses: [WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE],
      })
      .andWhere('c.windowExpiresAt IS NOT NULL')
      .andWhere('c.windowExpiresAt < :now', { now })
      .andWhere('c.deletedAt IS NULL')
      .getMany();
  }

  async preview(): Promise<ReadOnlyEnforcementPreview> {
    const chats = await this.findExpiredChats();

    const eligible: WhatsappChat[] = [];
    for (const chat of chats) {
      const channelId = chat.channel_id ?? chat.last_msg_client_channel_id ?? null;
      if (channelId && await this.channelService.shouldSkipAutoClose(channelId)) continue;
      eligible.push(chat);
    }

    return {
      total: eligible.length,
      conversations: eligible.map((c) => ({
        chat_id: c.chat_id,
        name: c.name,
        status: c.status,
        last_activity_at: c.last_activity_at,
        idle_hours: c.last_client_message_at
          ? Math.floor((Date.now() - new Date(c.last_client_message_at).getTime()) / 3_600_000)
          : -1,
      })),
    };
  }

  async enforce(): Promise<string> {
    const chats = await this.findExpiredChats();
    this.logger.log(`READ_ONLY_ENFORCE candidates=${chats.length}`, ReadOnlyEnforcementJob.name);

    let closed = 0;
    let skipped = 0;
    for (const chat of chats) {
      const channelId = chat.channel_id ?? chat.last_msg_client_channel_id ?? null;
      if (channelId && await this.channelService.shouldSkipAutoClose(channelId)) {
        skipped++;
        continue;
      }
      await this.chatSessionService.closeExpiredChatByWindowExpiry(chat.id);
      chat.status = WhatsappChatStatus.FERME;
      chat.windowExpiresAt = null;
      await this.gateway.emitConversationClosed(chat);
      closed++;
    }

    if (chats.length > 0 && closed === 0) {
      this.consecutiveZeroClosures++;
      if (this.consecutiveZeroClosures >= 3) {
        this.logger.warn(
          `READ_ONLY_ENFORCE_STALLED candidates=${chats.length} closed=0 cycles_consecutifs=${this.consecutiveZeroClosures} — possible régression silencieuse`,
          ReadOnlyEnforcementJob.name,
        );
      }
    } else {
      this.consecutiveZeroClosures = 0;
    }

    return `${closed} conversation(s) fermée(s) automatiquement${skipped > 0 ? ` (${skipped} ignorée(s))` : ''}`;
  }
}
