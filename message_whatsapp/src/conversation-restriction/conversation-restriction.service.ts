import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommercialConversationAccess } from './entities/commercial-conversation-access.entity';
import {
  RestrictionConfigDto,
  RestrictionStatusDto,
} from './dto/restriction-config.dto';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';

@Injectable()
export class ConversationRestrictionService {
  constructor(
    @InjectRepository(CommercialConversationAccess)
    private readonly accessRepository: Repository<CommercialConversationAccess>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  async getRestrictionConfig(): Promise<RestrictionConfigDto> {
    const [enabled, maxStr, minCharsStr, requireLastStr, minCharsSendStr] = await Promise.all([
      this.systemConfigService.get('RESTRICTION_ENABLED'),
      this.systemConfigService.get('RESTRICTION_MAX_UNRESPONDED_CONVS'),
      this.systemConfigService.get('RESTRICTION_MIN_RESPONSE_CHARS'),
      this.systemConfigService.get('RESTRICTION_REQUIRE_LAST_MESSAGE_MINE'),
      this.systemConfigService.get('RESTRICTION_MIN_CHARS_SEND_ENABLED'),
    ]);

    return {
      enabled: enabled !== null ? enabled === 'true' : true,
      maxUnrespondedConvs: maxStr !== null ? parseInt(maxStr, 10) : 1,
      minResponseChars: minCharsStr !== null ? parseInt(minCharsStr, 10) : 50,
      requireLastMessageMine:
        requireLastStr !== null ? requireLastStr === 'true' : false,
      minCharsSendEnabled: minCharsSendStr !== null ? minCharsSendStr === 'true' : false,
    };
  }

  /**
   * Enregistre ou met à jour l'accès d'un commercial à une conversation pour la date du jour.
   * Si un accès existe déjà avec une réponse valide (respondedAt IS NOT NULL), on ne réinitialise pas.
   */
  async recordAccess(commercialId: string, chatId: string): Promise<void> {
    // Ne pas tracer les conversations en lecture seule ou fermées :
    // le commercial ne peut pas y répondre, elles ne doivent pas compter dans la restriction.
    const chat = await this.chatRepository.findOne({ where: { chat_id: chatId } });
    if (!chat || chat.read_only || chat.status === WhatsappChatStatus.FERME) {
      return;
    }

    // Ne pas tracer les conversations sans canal résolvable :
    // le commercial ne peut physiquement pas envoyer de message → ne doit pas déclencher la restriction.
    if (!chat.channel_id && !chat.last_msg_client_channel_id) {
      return;
    }

    const today = this.todayDateString();

    const existing = await this.accessRepository.findOne({
      where: { commercialId, chatId, accessDate: today },
    });

    if (existing) {
      // Ne pas réinitialiser si déjà répondu
      if (existing.respondedAt !== null) {
        return;
      }
      await this.accessRepository.update(existing.id, {
        accessedAt: new Date(),
      });
      return;
    }

    const access = this.accessRepository.create({
      id: this.generateUuid(),
      commercialId,
      chatId,
      accessDate: today,
      accessedAt: new Date(),
      respondedAt: null,
      responseLength: 0,
    });
    await this.accessRepository.save(access);
  }

  /**
   * Enregistre une réponse valide du commercial si la longueur atteint le seuil configuré.
   */
  async recordResponse(
    commercialId: string,
    chatId: string,
    textLength: number,
  ): Promise<void> {
    const config = await this.getRestrictionConfig();
    if (textLength < config.minResponseChars) {
      return;
    }

    const today = this.todayDateString();
    const existing = await this.accessRepository.findOne({
      where: { commercialId, chatId, accessDate: today },
    });

    if (!existing) {
      return;
    }

    await this.accessRepository.update(existing.id, {
      respondedAt: new Date(),
      responseLength: textLength,
    });
  }

  /**
   * Calcule si la restriction doit être déclenchée pour ce commercial.
   */
  async checkRestriction(commercialId: string, posteId?: string): Promise<RestrictionStatusDto> {
    const config = await this.getRestrictionConfig();
    const today = this.todayDateString();

    // Récupérer tous les accès du jour sans réponse enregistrée
    const rawAccesses = await this.accessRepository
      .createQueryBuilder('cca')
      .where('cca.commercialId = :commercialId', { commercialId })
      .andWhere('cca.accessDate = :today', { today })
      .andWhere('cca.respondedAt IS NULL')
      .orderBy('cca.accessedAt', 'DESC')
      .getMany();

    // Précharger les chats en une seule requête
    const chatIds = rawAccesses.map((a) => a.chatId);
    const chats = chatIds.length > 0
      ? await this.chatRepository
          .createQueryBuilder('chat')
          .where('chat.chat_id IN (:...chatIds)', { chatIds })
          .getMany()
      : [];
    const chatMap = new Map(chats.map((c) => [c.chat_id, c]));

    // Début du jour pour la vérification bootstrap
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Filtrer d'abord les accès selon les règles métier (chat valide, poste, canal)
    const candidateAccesses = rawAccesses.filter((access) => {
      const chat = chatMap.get(access.chatId);
      if (!chat) return false;
      if (
        chat.status === WhatsappChatStatus.FERME ||
        (chat.status as string) === 'converti' ||
        chat.read_only
      ) return false;
      if (!chat.channel_id && !chat.last_msg_client_channel_id) return false;
      if (posteId && chat.poste_id !== null && chat.poste_id !== posteId) return false;
      return true;
    });

    // Bootstrap en une seule requête groupée
    const effectiveAccesses: CommercialConversationAccess[] = [];
    if (candidateAccesses.length > 0) {
      const candidateChatIds = candidateAccesses.map((a) => a.chatId);
      const respondedRows = await this.messageRepository
        .createQueryBuilder('msg')
        .select('msg.chat_id', 'chatId')
        .where('msg.chat_id IN (:...candidateChatIds)', { candidateChatIds })
        .andWhere('msg.commercial_id = :commercialId', { commercialId })
        .andWhere('msg.from_me = :fromMe', { fromMe: true })
        .andWhere('msg.timestamp >= :todayStart', { todayStart })
        .andWhere(`CHAR_LENGTH(COALESCE(msg.text, '')) >= :minChars`, { minChars: config.minResponseChars })
        .andWhere('msg.deletedAt IS NULL')
        .groupBy('msg.chat_id')
        .getRawMany<{ chatId: string }>();

      const respondedChatIdSet = new Set(respondedRows.map((r) => r.chatId));

      const toMarkResponded = candidateAccesses.filter((a) => respondedChatIdSet.has(a.chatId));
      if (toMarkResponded.length > 0) {
        void this.accessRepository
          .createQueryBuilder()
          .update()
          .set({ respondedAt: new Date(), responseLength: config.minResponseChars })
          .whereInIds(toMarkResponded.map((a) => a.id))
          .execute();
      }

      for (const access of candidateAccesses) {
        if (!respondedChatIdSet.has(access.chatId)) {
          effectiveAccesses.push(access);
        }
      }
    }

    // Si requireLastMessageMine : filtrer les conversations dont le dernier message est from_me = true
    let effectiveUnresponded = effectiveAccesses;
    if (config.requireLastMessageMine) {
      const filtered: CommercialConversationAccess[] = [];
      for (const access of effectiveAccesses) {
        const lastMsg = await this.messageRepository
          .createQueryBuilder('msg')
          .where('msg.chat_id = :chatId', { chatId: access.chatId })
          .andWhere('msg.deletedAt IS NULL')
          .orderBy('msg.timestamp', 'DESC')
          .limit(1)
          .getOne();

        // Si le dernier message est from_me, on considère la conv comme répondue → exclure
        if (!lastMsg || !lastMsg.from_me) {
          filtered.push(access);
        }
      }
      effectiveUnresponded = filtered;
    }

    const unrespondedCount = effectiveUnresponded.length;
    const triggered = config.enabled && unrespondedCount > config.maxUnrespondedConvs;

    // Enrichir chaque conversation non-répondue (chat déjà en cache)
    const unrespondedConversations = await Promise.all(
      effectiveUnresponded.map(async (access) => {
        const chat = chatMap.get(access.chatId);

        const lastClientMsg = await this.messageRepository
          .createQueryBuilder('msg')
          .where('msg.chat_id = :chatId', { chatId: access.chatId })
          .andWhere('msg.from_me = :fromMe', { fromMe: false })
          .andWhere('msg.deletedAt IS NULL')
          .orderBy('msg.timestamp', 'DESC')
          .limit(1)
          .getOne();

        return {
          chat_id: access.chatId,
          contact_name: chat?.name ?? access.chatId,
          last_client_message: lastClientMsg?.text ?? '',
          accessed_at: access.accessedAt.toISOString(),
        };
      }),
    );

    return {
      triggered,
      unrespondedCount,
      unrespondedConversations,
      config,
    };
  }

  // ── Helpers privés ──────────────────────────────────────────────────────────

  private todayDateString(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
