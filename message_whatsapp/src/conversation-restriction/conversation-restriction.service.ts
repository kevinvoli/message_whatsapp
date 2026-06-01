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
    const [enabled, maxStr, minCharsStr, requireLastStr] = await Promise.all([
      this.systemConfigService.get('RESTRICTION_ENABLED'),
      this.systemConfigService.get('RESTRICTION_MAX_UNRESPONDED_CONVS'),
      this.systemConfigService.get('RESTRICTION_MIN_RESPONSE_CHARS'),
      this.systemConfigService.get('RESTRICTION_REQUIRE_LAST_MESSAGE_MINE'),
    ]);

    return {
      enabled: enabled !== null ? enabled === 'true' : true,
      maxUnrespondedConvs: maxStr !== null ? parseInt(maxStr, 10) : 1,
      minResponseChars: minCharsStr !== null ? parseInt(minCharsStr, 10) : 50,
      requireLastMessageMine:
        requireLastStr !== null ? requireLastStr === 'true' : false,
    };
  }

  /**
   * Enregistre ou met à jour l'accès d'un commercial à une conversation pour la date du jour.
   * Si un accès existe déjà avec une réponse valide (respondedAt IS NOT NULL), on ne réinitialise pas.
   */
  async recordAccess(commercialId: string, chatId: string): Promise<void> {
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

    // Filtrer les accès :
    // 1. Exclure les convs en lecture seule (commercial bloqué, ne peut pas répondre)
    // 2. Bootstrap : si la commerciale a déjà envoyé un msg qualifiant aujourd'hui, marquer répondu
    const effectiveAccesses: CommercialConversationAccess[] = [];
    for (const access of rawAccesses) {
      const chat = chatMap.get(access.chatId);

      // Exclure si fermée ou en lecture seule → commercial ne peut pas répondre
      if (!chat || chat.status === WhatsappChatStatus.FERME || chat.read_only) continue;

      // Exclure si la conversation n'est plus sur le poste de la commerciale
      if (posteId && chat.poste_id !== null && chat.poste_id !== posteId) continue;

      // Bootstrap : vérifier si un message qualifiant existe aujourd'hui dans whatsapp_message
      const hasQualifyingMsg = await this.messageRepository
        .createQueryBuilder('msg')
        .where('msg.chat_id = :chatId', { chatId: access.chatId })
        .andWhere('msg.commercial_id = :commercialId', { commercialId })
        .andWhere('msg.from_me = :fromMe', { fromMe: true })
        .andWhere('msg.timestamp >= :todayStart', { todayStart })
        .andWhere(`CHAR_LENGTH(COALESCE(msg.text, '')) >= :minChars`, { minChars: config.minResponseChars })
        .andWhere('msg.deletedAt IS NULL')
        .getCount();

      if (hasQualifyingMsg > 0) {
        // Synchroniser le cache DB pour les prochains appels
        void this.accessRepository.update(access.id, {
          respondedAt: new Date(),
          responseLength: config.minResponseChars,
        });
        continue;
      }

      effectiveAccesses.push(access);
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
    const triggered = config.enabled && unrespondedCount >= config.maxUnrespondedConvs;

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
