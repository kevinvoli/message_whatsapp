import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { IsNull, LessThan, Not, Repository } from 'typeorm';
import { CronConfigService } from 'src/jorbs/cron-config.service';

export interface ReadOnlyEnforcementPreview {
  total: number;
  conversations: {
    chat_id: string;
    name: string;
    status: string;
    last_poste_message_at: Date | null;
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
   * - last_poste_message_at < seuil   → commercial a répondu mais c'était il y a longtemps
   * - OU last_poste_message_at IS NULL ET createdAt < seuil
   *   → jamais de réponse commerciale et la conversation est vieille
   */
  private async findEligible(limit: Date): Promise<WhatsappChat[]> {
    return this.chatRepo.find({
      where: [
        {
          status: Not(WhatsappChatStatus.FERME),
          last_poste_message_at: LessThan(limit),
        },
        {
          status: Not(WhatsappChatStatus.FERME),
          last_poste_message_at: IsNull(),
          createdAt: LessThan(limit),
        },
      ],
    });
  }

  async preview(): Promise<ReadOnlyEnforcementPreview> {
    const thresholdMs = await this.getThresholdMs();
    const limit = new Date(Date.now() - thresholdMs);
    const chats = await this.findEligible(limit);

    return {
      total: chats.length,
      conversations: chats.map((c) => {
        const ref = c.last_poste_message_at ?? c.createdAt;
        return {
          chat_id: c.chat_id,
          name: c.name,
          status: c.status,
          last_poste_message_at: c.last_poste_message_at,
          idle_hours: ref
            ? Math.floor((Date.now() - new Date(ref).getTime()) / 3_600_000)
            : 0,
        };
      }),
    };
  }

  async enforce() {
    const thresholdMs = await this.getThresholdMs();
    const limit = new Date(Date.now() - thresholdMs);
    const chats = await this.findEligible(limit);

    for (const chat of chats) {
      chat.status = WhatsappChatStatus.FERME;
      chat.read_only = false;
      await this.chatRepo.save(chat);
      await this.gateway.emitConversationClosed(chat);
    }
  }
}
