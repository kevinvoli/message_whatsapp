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
   * Cas normal : windowExpiresAt explicitement renseigné et expiré.
   * Couvre toutes les conversations (ACTIF et EN_ATTENTE) même sans session ouverte.
   */
  private async findExplicitlyExpiredChats(): Promise<WhatsappChat[]> {
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

  /**
   * Cas orphelins : windowExpiresAt NULL mais fenêtre détectable via :
   *   1. Session ouverte avec auto_close_at expiré (désync cache↔session)
   *   2. last_client_message_at + 24h dépassé sans session encore valide
   *   3. last_client_message_at IS NULL sans session encore valide
   *
   * Les conversations qui ont encore une session ouverte valide (auto_close_at >= now)
   * sont exclues pour ne pas fermer prématurément.
   */
  private async findOrphanedExpiredChats(): Promise<WhatsappChat[]> {
    const cutoff = new Date(Date.now() - 24 * 3_600_000);
    const now = new Date();

    // Sous-cas 1 : désync — session ouverte mais auto_close_at expiré
    const desynced = await this.chatRepo
      .createQueryBuilder('c')
      .innerJoin(
        'chat_session',
        's',
        's.whatsapp_chat_id = c.id AND s.ended_at IS NULL AND s.auto_close_at < :now',
        { now },
      )
      .where('c.status IN (:...statuses)', {
        statuses: [WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE],
      })
      .andWhere('c.windowExpiresAt IS NULL')
      .andWhere('c.deletedAt IS NULL')
      .getMany();

    // Sous-cas 2 & 3 : pas de session valide + délai dépassé ou pas de message client
    const noValidSession = await this.chatRepo
      .createQueryBuilder('c')
      .where('c.status IN (:...statuses)', {
        statuses: [WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE],
      })
      .andWhere('c.windowExpiresAt IS NULL')
      .andWhere('c.deletedAt IS NULL')
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM chat_session s2
          WHERE s2.whatsapp_chat_id = c.id
            AND s2.ended_at IS NULL
            AND s2.auto_close_at >= :now
        )`,
        { now },
      )
      .andWhere(
        '(c.last_client_message_at IS NULL OR c.last_client_message_at < :cutoff)',
        { cutoff },
      )
      .getMany();

    const seen = new Set<string>();
    const result: WhatsappChat[] = [];
    for (const c of [...desynced, ...noValidSession]) {
      if (!seen.has(c.id)) { seen.add(c.id); result.push(c); }
    }
    return result;
  }

  private async buildSkipSet(chats: WhatsappChat[]): Promise<Set<string>> {
    const channelIds = [
      ...new Set(
        chats
          .map((c) => c.channel_id ?? c.last_msg_client_channel_id ?? null)
          .filter((id): id is string => id !== null),
      ),
    ];
    return this.channelService.getChannelIdsToSkipAutoClose(channelIds);
  }

  async preview(): Promise<ReadOnlyEnforcementPreview> {
    const [explicit, orphaned] = await Promise.all([
      this.findExplicitlyExpiredChats(),
      this.findOrphanedExpiredChats(),
    ]);

    const seen = new Set<string>();
    const chats: WhatsappChat[] = [];
    for (const c of [...explicit, ...orphaned]) {
      if (!seen.has(c.id)) { seen.add(c.id); chats.push(c); }
    }

    const skipSet = await this.buildSkipSet(chats);
    const eligible = chats.filter((c) => {
      const cid = c.channel_id ?? c.last_msg_client_channel_id ?? null;
      return !(cid && skipSet.has(cid));
    });

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
    const [explicit, orphaned] = await Promise.all([
      this.findExplicitlyExpiredChats(),
      this.findOrphanedExpiredChats(),
    ]);

    const seen = new Set<string>();
    const chats: WhatsappChat[] = [];
    for (const c of [...explicit, ...orphaned]) {
      if (!seen.has(c.id)) { seen.add(c.id); chats.push(c); }
    }

    this.logger.log(
      `READ_ONLY_ENFORCE candidates=${chats.length} (explicit=${explicit.length} orphaned=${orphaned.length})`,
      ReadOnlyEnforcementJob.name,
    );

    const skipSet = await this.buildSkipSet(chats);

    let closed = 0;
    let skipped = 0;
    let errors = 0;

    for (const chat of chats) {
      const channelId = chat.channel_id ?? chat.last_msg_client_channel_id ?? null;
      if (channelId && skipSet.has(channelId)) {
        skipped++;
        continue;
      }

      try {
        // Ferme la session ouverte (ended_at = NOW) ET met le chat à FERME dans une transaction
        await this.chatSessionService.closeExpiredChatByWindowExpiry(chat.id);
        chat.status = WhatsappChatStatus.FERME;
        chat.windowExpiresAt = null;
        await this.gateway.emitConversationClosed(chat);
        closed++;
      } catch (err) {
        errors++;
        this.logger.error(
          `READ_ONLY_ENFORCE_CLOSE_FAILED chat_id=${chat.chat_id} id=${chat.id}: ${String(err)}`,
          ReadOnlyEnforcementJob.name,
        );
      }
    }

    if (chats.length > 0 && closed === 0) {
      this.consecutiveZeroClosures++;
      if (this.consecutiveZeroClosures >= 3) {
        this.logger.warn(
          `READ_ONLY_ENFORCE_STALLED candidates=${chats.length} closed=0 skipped=${skipped} errors=${errors} cycles_consecutifs=${this.consecutiveZeroClosures} — possible régression silencieuse`,
          ReadOnlyEnforcementJob.name,
        );
      }
    } else {
      this.consecutiveZeroClosures = 0;
    }

    return `${closed} conversation(s) fermée(s) automatiquement${skipped > 0 ? ` (${skipped} ignorée(s))` : ''}${errors > 0 ? ` [${errors} erreur(s)]` : ''}`;
  }
}
