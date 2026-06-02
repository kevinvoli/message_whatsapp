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
    private readonly gateway: WhatsappMessageGateway,
    private readonly cronConfigService: CronConfigService,
    private readonly channelService: ChannelService,
    private readonly logger: AppLogger,
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
   * Conversations éligibles par inactivité client :
   * - status != fermé
   * - last_client_message_at < seuil OU null (client n'a jamais/plus écrit)
   */
  private async findEligibleByClientInactivity(limit: Date): Promise<WhatsappChat[]> {
    return this.chatRepo
      .createQueryBuilder('chat')
      .where('chat.status != :ferme', { ferme: WhatsappChatStatus.FERME })
      .andWhere(
        '(chat.last_client_message_at IS NULL OR chat.last_client_message_at < :limit)',
        { limit },
      )
      .getMany();
  }

  async preview(): Promise<ReadOnlyEnforcementPreview> {
    const thresholdMs = await this.getThresholdMs();
    const limit = new Date(Date.now() - thresholdMs);
    const chats = await this.findEligibleByClientInactivity(limit);

    const eligible: typeof chats = [];
    for (const c of chats) {
      const channelId = c.channel_id ?? c.last_msg_client_channel_id ?? null;
      if (channelId && await this.channelService.shouldSkipAutoClose(channelId)) continue;
      eligible.push(c);
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
    const thresholdMs = await this.getThresholdMs();
    const limit = new Date(Date.now() - thresholdMs);
    const chats = await this.findEligibleByClientInactivity(limit);

    this.logger.log(
      `READ_ONLY_ENFORCE candidates=${chats.length}`,
      ReadOnlyEnforcementJob.name,
    );

    let closed = 0;
    let skipped = 0;
    for (const chat of chats) {
      const channelId = chat.channel_id ?? chat.last_msg_client_channel_id ?? null;
      if (channelId && await this.channelService.shouldSkipAutoClose(channelId)) {
        skipped++;
        continue;
      }
      chat.status = WhatsappChatStatus.FERME;
      chat.read_only = false;
      await this.chatRepo.save(chat);
      await this.gateway.emitConversationClosed(chat);
      closed++;
    }
    return `${closed} conversation(s) fermée(s) automatiquement${skipped > 0 ? ` (${skipped} ignorée(s) — canal dédié ou no_close)` : ''}`;
  }
}
