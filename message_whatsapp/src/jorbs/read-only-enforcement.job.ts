import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { LessThan, Repository } from 'typeorm';
import { CronConfigService } from 'src/jorbs/cron-config.service';

export interface ReadOnlyEnforcementPreview {
  total: number;
  conversations: { chat_id: string; name: string; last_client_message_at: Date | null; idle_hours: number }[];
}

@Injectable()
export class ReadOnlyEnforcementJob implements OnModuleInit {
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly gateway: WhatsappMessageGateway,
    private readonly cronConfigService: CronConfigService,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('read-only-enforcement', () =>
      this.enforce24h(),
    );
    this.cronConfigService.registerPreviewHandler('read-only-enforcement', () =>
      this.preview(),
    );
  }

  async preview(): Promise<ReadOnlyEnforcementPreview> {
    const limit = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const chats = await this.chatRepo.find({
      where: { read_only: false, last_client_message_at: LessThan(limit), status: WhatsappChatStatus.ACTIF },
    });
    return {
      total: chats.length,
      conversations: chats.map((c) => ({
        chat_id: c.chat_id,
        name: c.name,
        last_client_message_at: c.last_client_message_at,
        idle_hours: c.last_client_message_at
          ? Math.floor((Date.now() - new Date(c.last_client_message_at).getTime()) / 3_600_000)
          : 0,
      })),
    };
  }

  async enforce24h() {
    const limit = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const chats = await this.chatRepo.find({
      where: {
        read_only: false,
        last_client_message_at: LessThan(limit),
        status: WhatsappChatStatus.ACTIF,
      },
    });

    for (const chat of chats) {
      chat.read_only = true;
      await this.chatRepo.save(chat);
      this.gateway.emitConversationReadonly(chat);
    }
  }
}
