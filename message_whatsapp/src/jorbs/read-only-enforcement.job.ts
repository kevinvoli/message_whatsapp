import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { Repository } from 'typeorm';
import { CronConfigService } from 'src/jorbs/cron-config.service';
import { ChannelService } from 'src/channel/channel.service';
import { AppLogger } from 'src/logging/app-logger.service';
import { ChatSession } from 'src/chat-session/entities/chat-session.entity';
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
  constructor(
    @InjectRepository(ChatSession)
    private readonly sessionRepo: Repository<ChatSession>,
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
   * Sessions expirées : ended_at IS NULL + auto_close_at < maintenant.
   * Le chat associé doit être non fermé et avoir cette session comme session active.
   * Note : auto_close_at IS NULL est intentionnellement ABSENT (P2).
   */
  private async findExpiredSessions(): Promise<ChatSession[]> {
    return this.sessionRepo
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.chat', 'c')
      .where('c.status != :ferme', { ferme: WhatsappChatStatus.FERME })
      .andWhere('c.active_session_id = s.id')
      .andWhere('s.ended_at IS NULL')
      .andWhere('s.auto_close_at < :now', { now: new Date() })
      .getMany();
  }

  async preview(): Promise<ReadOnlyEnforcementPreview> {
    const sessions = await this.findExpiredSessions();

    const eligible: ChatSession[] = [];
    for (const session of sessions) {
      const chat = session.chat;
      const channelId = chat.channel_id ?? chat.last_msg_client_channel_id ?? null;
      if (channelId && await this.channelService.shouldSkipAutoClose(channelId)) continue;
      eligible.push(session);
    }

    return {
      total: eligible.length,
      conversations: eligible.map((s) => {
        const c = s.chat;
        return {
          chat_id: c.chat_id,
          name: c.name,
          status: c.status,
          last_activity_at: c.last_activity_at,
          idle_hours: s.lastClientMessageAt
            ? Math.floor((Date.now() - new Date(s.lastClientMessageAt).getTime()) / 3_600_000)
            : -1,
        };
      }),
    };
  }

  async enforce(): Promise<string> {
    const sessions = await this.findExpiredSessions();
    this.logger.log(`READ_ONLY_ENFORCE candidates=${sessions.length}`, ReadOnlyEnforcementJob.name);

    let closed = 0;
    let skipped = 0;
    for (const session of sessions) {
      const chat = session.chat;
      const channelId = chat.channel_id ?? chat.last_msg_client_channel_id ?? null;
      if (channelId && await this.channelService.shouldSkipAutoClose(channelId)) {
        skipped++;
        continue;
      }
      await this.chatSessionService.closeExpiredSessionAndChat(session.id, chat.id);
      await this.gateway.emitConversationClosed(chat);
      closed++;
    }
    return `${closed} conversation(s) fermée(s) automatiquement${skipped > 0 ? ` (${skipped} ignorée(s))` : ''}`;
  }
}
