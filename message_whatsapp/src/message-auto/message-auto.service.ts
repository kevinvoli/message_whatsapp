import * as fs from 'fs';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MessageAuto, AutoMessageTriggerType } from './entities/message-auto.entity';
import { AutoMessageKeyword } from './entities/auto-message-keyword.entity';
import { Repository } from 'typeorm';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { CreateMessageAutoDto, CreateAutoMessageKeywordDto } from './dto/create-message-auto.dto';
import { UpdateMessageAutoDto } from './dto/update-message-auto.dto';
import { AppLogger } from 'src/logging/app-logger.service';
import { ChannelService } from 'src/channel/channel.service';
import { MediaAssetService } from 'src/media-asset/media-asset.service';

@Injectable()
export class MessageAutoService {
  constructor(
    @InjectRepository(MessageAuto)
    private readonly autoMessageRepo: Repository<MessageAuto>,

    @InjectRepository(AutoMessageKeyword)
    private readonly keywordRepo: Repository<AutoMessageKeyword>,

    private readonly chatService: WhatsappChatService,
    private readonly messageService: WhatsappMessageService,
    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly gateway: WhatsappMessageGateway,
    private readonly logger: AppLogger,
    private readonly channelService: ChannelService,
    private readonly mediaAssetService: MediaAssetService,
  ) {}

  // ─── CRUD de base ─────────────────────────────────────────────────────────

  async create(dto: CreateMessageAutoDto): Promise<MessageAuto> {
    const { keywords, ...rest } = dto;
    const body = dto.body ?? '';
    if (!dto.mediaAssetId && !body.trim()) {
      throw new BadRequestException('body ou mediaAssetId est requis');
    }
    const message = this.autoMessageRepo.create(rest);
    const saved = await this.autoMessageRepo.save(message);

    if (keywords?.length) {
      const kws = keywords.map((k) =>
        this.keywordRepo.create({ ...k, messageAutoId: saved.id }),
      );
      await this.keywordRepo.save(kws);
    }

    if (dto.mediaAssetId) {
      await this.mediaAssetService.incrementUsage(dto.mediaAssetId);
    }

    return this.findOne(saved.id);
  }

  async findAll(): Promise<MessageAuto[]> {
    return this.autoMessageRepo.find({
      order: { trigger_type: 'ASC', position: 'ASC' },
      relations: ['keywords', 'mediaAsset'],
    });
  }

  async findByTrigger(trigger: AutoMessageTriggerType): Promise<MessageAuto[]> {
    return this.autoMessageRepo.find({
      where: { trigger_type: trigger },
      order: { scope_type: 'ASC', position: 'ASC' },
      relations: ['keywords', 'mediaAsset'],
    });
  }

  async findOne(id: string): Promise<MessageAuto> {
    const message = await this.autoMessageRepo.findOne({
      where: { id },
      relations: ['keywords', 'mediaAsset'],
    });
    if (!message) {
      throw new NotFoundException(`Auto message with ID ${id} not found`);
    }
    return message;
  }

  async update(id: string, dto: UpdateMessageAutoDto): Promise<MessageAuto> {
    const message = await this.findOne(id);
    const { keywords, ...rest } = dto as CreateMessageAutoDto;

    const nextBody = dto.body ?? message.body ?? '';
    const nextMediaAssetId = dto.mediaAssetId !== undefined ? dto.mediaAssetId : message.mediaAssetId;
    if (!nextMediaAssetId && !nextBody.trim()) {
      throw new BadRequestException('body ou mediaAssetId est requis');
    }

    const ancien = message.mediaAssetId;
    const nouveau = dto.mediaAssetId !== undefined ? (dto.mediaAssetId ?? null) : message.mediaAssetId;

    Object.assign(message, rest);
    const saved = await this.autoMessageRepo.save(message);

    if (ancien !== nouveau) {
      if (nouveau) await this.mediaAssetService.incrementUsage(nouveau);
      if (ancien) await this.mediaAssetService.decrementUsage(ancien);
    }

    return saved;
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findOne(id);
    if (existing.mediaAssetId) {
      await this.mediaAssetService.decrementUsage(existing.mediaAssetId);
    }
    const result = await this.autoMessageRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Auto message with ID ${id} not found`);
    }
  }

  // ─── Gestion des mots-clés ────────────────────────────────────────────────

  async addKeyword(messageAutoId: string, dto: CreateAutoMessageKeywordDto): Promise<AutoMessageKeyword> {
    await this.findOne(messageAutoId); // 404 si inexistant
    const kw = this.keywordRepo.create({ ...dto, messageAutoId });
    return this.keywordRepo.save(kw);
  }

  async removeKeyword(messageAutoId: string, keywordId: string): Promise<void> {
    const result = await this.keywordRepo.delete({ id: keywordId, messageAutoId });
    if (result.affected === 0) {
      throw new NotFoundException(`Keyword ${keywordId} not found on template ${messageAutoId}`);
    }
  }

  getKeywords(messageAutoId: string): Promise<AutoMessageKeyword[]> {
    return this.keywordRepo.find({ where: { messageAutoId } });
  }

  // ─── Sélection universelle de template ───────────────────────────────────

  /**
   * Sélectionne le bon template pour un trigger et une étape donnés.
   * Priorité : poste scopé > canal scopé > global.
   * Tirage aléatoire dans le pool retenu.
   */
  async getTemplateForTrigger(
    trigger: AutoMessageTriggerType,
    step: number,
    options?: {
      posteId?: string | null;
      channelId?: string | null;
      clientTypeTarget?: 'new' | 'returning' | 'all';
    },
  ): Promise<MessageAuto | null> {
    const allTemplates = await this.autoMessageRepo.find({
      where: { trigger_type: trigger, position: step, actif: true },
      relations: ['mediaAsset'],
    });

    if (!allTemplates.length) return null;

    // Filtre client_type_target
    let filtered = allTemplates;
    if (options?.clientTypeTarget && options.clientTypeTarget !== 'all') {
      filtered = allTemplates.filter(
        (t) => !t.client_type_target || t.client_type_target === 'all' || t.client_type_target === options.clientTypeTarget,
      );
      if (!filtered.length) filtered = allTemplates.filter((t) => !t.client_type_target || t.client_type_target === 'all');
    }

    if (!filtered.length) return null;

    // Pools de priorité
    const poolPoste = options?.posteId
      ? filtered.filter((t) => t.scope_type === 'poste' && t.scope_id === options.posteId)
      : [];
    const poolCanal = options?.channelId
      ? filtered.filter((t) => t.scope_type === 'canal' && t.scope_id === options.channelId)
      : [];
    // Le global est le fallback pour tout canal sans template scopé.
    // Les exclusions (excluded_channel_ids / excluded_poste_ids) permettent d'empêcher
    // le global de s'appliquer à un canal dédié spécifique.
    const poolGlobal = filtered.filter((t) => {
      if (t.scope_type) return false;
      const excChannels: string[] = t.conditions?.excluded_channel_ids ?? [];
      const excPostes: string[] = t.conditions?.excluded_poste_ids ?? [];
      if (options?.channelId && excChannels.includes(options.channelId)) return false;
      if (options?.posteId && excPostes.includes(options.posteId)) return false;
      return true;
    });

    const pool = poolPoste.length ? poolPoste : poolCanal.length ? poolCanal : poolGlobal;

    if (!pool.length) return null;

    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ─── Scope helpers ────────────────────────────────────────────────────────

  private templateMatchesChatScope(
    template: MessageAuto,
    chat: { poste_id?: string | null; last_msg_client_channel_id?: string | null },
  ): boolean {
    if (template.scope_type === 'poste') {
      return template.scope_id === chat.poste_id;
    }
    if (template.scope_type === 'canal') {
      return template.scope_id === chat.last_msg_client_channel_id;
    }
    const excChannels: string[] = (template.conditions as any)?.excluded_channel_ids ?? [];
    const excPostes: string[]   = (template.conditions as any)?.excluded_poste_ids   ?? [];
    if (chat.last_msg_client_channel_id && excChannels.includes(chat.last_msg_client_channel_id)) return false;
    if (chat.poste_id && excPostes.includes(chat.poste_id)) return false;
    return true;
  }

  selectBestKeywordTemplateForChat(
    matchingKeywords: AutoMessageKeyword[],
    chat: { poste_id?: string | null; last_msg_client_channel_id?: string | null },
  ): AutoMessageKeyword | undefined {
    const scopedMatches = matchingKeywords.filter(
      (kw) => this.templateMatchesChatScope(kw.messageAuto, chat),
    );
    return (
      scopedMatches.find(
        (kw) => kw.messageAuto.scope_type === 'poste' && kw.messageAuto.scope_id === chat.poste_id,
      ) ??
      scopedMatches.find(
        (kw) => kw.messageAuto.scope_type === 'canal' &&
                 kw.messageAuto.scope_id === chat.last_msg_client_channel_id,
      ) ??
      scopedMatches.find((kw) => !kw.messageAuto.scope_type)
    );
  }

  // ─── Envoi universel ──────────────────────────────────────────────────────

  /**
   * Envoie un message auto pour le trigger donné à l'étape donnée.
   * Met à jour uniquement les champs de suivi propres au trigger.
   */
  async sendAutoMessageForTrigger(
    chatId: string,
    trigger: AutoMessageTriggerType,
    step: number,
    options?: { clientTypeTarget?: 'new' | 'returning' | 'all' },
  ): Promise<void> {
    const chat = await this.chatService.findBychat_id(chatId);
    if (!chat) return;

    if (!chat.last_msg_client_channel_id) {
      throw new Error(
        `Impossible d'envoyer un message auto (${trigger}): channel manquant pour ${chatId}`,
      );
    }

    const template = await this.getTemplateForTrigger(trigger, step, {
      posteId: chat.poste_id,
      channelId: chat.last_msg_client_channel_id,
      clientTypeTarget: options?.clientTypeTarget,
    });

    if (!template) {
      this.logger.debug(
        `No active template for trigger=${trigger} step=${step} — skipping ${chatId}`,
        MessageAutoService.name,
      );
      return;
    }

    // Marquer le tracking AVANT l'envoi pour rendre l'opération idempotente.
    // Si l'envoi échoue, le message ne sera PAS renvoyé en double au prochain tick.
    await this.updateTriggerTracking(chatId, trigger, step);

    // Typing WA start (best-effort)
    void this.messageService.typingStart(chatId).catch(() => {});

    try {
      const text = this.formatMessageAuto({
        message: template.body ?? '',
        name: chat.name,
        numero: chat.contact_client,
      });

      if (template.mediaAsset) {
        const fileBuffer = await fs.promises.readFile(template.mediaAsset.filePath);
        const caption = text.trim() ? text : undefined;
        const message = await this.messageService.createAgentMediaMessage({
          chat_id: chat.chat_id,
          poste_id: null,
          timestamp: new Date(),
          channel_id: chat.last_msg_client_channel_id,
          mediaBuffer: fileBuffer,
          mimeType: template.mediaAsset.mimeType,
          fileName: template.mediaAsset.originalName,
          mediaType: template.mediaAsset.mediaType,
          caption,
        });
        await this.gateway.notifyAutoMessage(message, chat);
      } else {
        const message = await this.messageService.createAgentMessage({
          chat_id: chat.chat_id,
          poste_id: null,
          text,
          timestamp: new Date(),
          channel_id: chat.last_msg_client_channel_id,
        });
        await this.gateway.notifyAutoMessage(message, chat);
      }

    } catch (err) {
      // Envoi échoué, mais le tracking est déjà mis à jour → pas de double envoi au prochain tick
      this.logger.error(
        `sendAutoMessageForTrigger: envoi échoué pour ${chatId} trigger=${trigger} step=${step}: ${(err as Error).message}`,
        undefined,
        MessageAutoService.name,
      );
    } finally {
      void this.messageService.typingStop(chatId).catch(() => {});
    }
  }

  /**
   * Envoie directement un template (déjà sélectionné) pour un chat donné.
   * Utilisé par le job keyword pour bypasser le re-chargement du template.
   */
  async sendAutoMessageTemplate(
    chatId: string,
    template: MessageAuto,
  ): Promise<void> {
    const chat = await this.chatService.findBychat_id(chatId);
    if (!chat || !chat.last_msg_client_channel_id) return;

    if (!this.templateMatchesChatScope(template, chat)) return;

    await this.updateTriggerTracking(chatId, AutoMessageTriggerType.KEYWORD, template.position);

    void this.messageService.typingStart(chatId).catch(() => {});
    try {
      if (template.mediaAsset) {
        const fileBuffer = await fs.promises.readFile(template.mediaAsset.filePath);
        const caption = template.body?.trim()
          ? this.formatMessageAuto({ message: template.body, name: chat.name, numero: chat.contact_client })
          : undefined;
        const msg = await this.messageService.createAgentMediaMessage({
          chat_id: chat.chat_id,
          poste_id: null,
          timestamp: new Date(),
          channel_id: chat.last_msg_client_channel_id,
          mediaBuffer: fileBuffer,
          mimeType: template.mediaAsset.mimeType,
          fileName: template.mediaAsset.originalName,
          mediaType: template.mediaAsset.mediaType,
          caption,
        });
        await this.gateway.notifyAutoMessage(msg, chat);
      } else {
        const text = this.formatMessageAuto({ message: template.body ?? '', name: chat.name, numero: chat.contact_client });
        const msg = await this.messageService.createAgentMessage({
          chat_id: chat.chat_id,
          poste_id: null,
          text,
          timestamp: new Date(),
          channel_id: chat.last_msg_client_channel_id,
        });
        await this.gateway.notifyAutoMessage(msg, chat);
      }
    } catch (err) {
      this.logger.error(
        `sendAutoMessageTemplate: échec ${chatId}: ${(err as Error).message}`,
        undefined,
        MessageAutoService.name,
      );
    } finally {
      void this.messageService.typingStop(chatId).catch(() => {});
    }
  }

  private async updateTriggerTracking(
    chatId: string,
    trigger: AutoMessageTriggerType,
    step: number,
  ): Promise<void> {
    const now = new Date();
    const patch: Record<string, unknown> = {};

    switch (trigger) {
      case AutoMessageTriggerType.NO_RESPONSE:
        patch.no_response_auto_step = step;
        patch.last_no_response_auto_sent_at = now;
        break;
      case AutoMessageTriggerType.OUT_OF_HOURS:
        patch.out_of_hours_auto_sent = true;
        break;
      case AutoMessageTriggerType.REOPENED:
        patch.reopened_auto_sent = true;
        break;
      case AutoMessageTriggerType.QUEUE_WAIT:
        patch.queue_wait_auto_step = step;
        patch.last_queue_wait_auto_sent_at = now;
        break;
      case AutoMessageTriggerType.KEYWORD:
        patch.keyword_auto_sent_at = now;
        break;
      case AutoMessageTriggerType.CLIENT_TYPE:
        patch.client_type_auto_sent = true;
        break;
      case AutoMessageTriggerType.INACTIVITY:
        patch.inactivity_auto_step = step;
        patch.last_inactivity_auto_sent_at = now;
        break;
      case AutoMessageTriggerType.ON_ASSIGN:
        patch.on_assign_auto_sent = true;
        break;
      default:
        break;
    }

    if (Object.keys(patch).length) {
      await this.chatService.update(chatId, patch as any);
    }
  }

  // ─── Méthodes héritées (mode séquence) ───────────────────────────────────

  /**
   * Récupère un message auto actif par position (mode séquence — backward compat).
   */
  async getAutoMessageByPosition(position: number): Promise<MessageAuto | null> {
    const messages = await this.autoMessageRepo.find({
      where: { position, actif: true, trigger_type: AutoMessageTriggerType.SEQUENCE },
    });
    if (!messages.length) return null;
    return messages[Math.floor(Math.random() * messages.length)];
  }

  /**
   * Lance l'envoi d'un message auto de séquence (mode séquence — backward compat).
   */
  async sendAutoMessage(chatId: string, position: number): Promise<void> {
    const chat = await this.chatService.findBychat_id(chatId);

    if (!chat) return;

    if (!chat.last_msg_client_channel_id) {
      throw new Error(
        `Impossible d'envoyer un message auto : channel manquant pour le chat ${chatId}`,
      );
    }

    const provider = chat.channel?.provider ?? 'unknown';
    this.logger.log(
      `AUTO_MESSAGE_ATTEMPT chatId=${chatId} step=${chat.auto_message_step} provider=${provider} channel=${chat.last_msg_client_channel_id}`,
      MessageAutoService.name,
    );

    // Utilise getTemplateForTrigger pour respecter le scope (canal/poste/global).
    // getAutoMessageByPosition ignorait le scope → les templates scopés sur un canal
    // étaient envoyés à tous les clients indépendamment de leur canal.
    const template = await this.getTemplateForTrigger(
      AutoMessageTriggerType.SEQUENCE,
      position,
      {
        posteId: chat.poste_id,
        channelId: chat.last_msg_client_channel_id,
      },
    );

    if (!template) {
      this.logger.warn(
        `AUTO_MESSAGE_NO_TEMPLATE chatId=${chatId} position=${position} provider=${provider} channel=${chat.last_msg_client_channel_id} poste=${chat.poste_id ?? 'null'} — Aucun template SEQUENCE actif pour ce scope. Vérifiez la configuration des messages auto dans l'interface admin.`,
        MessageAutoService.name,
      );
      return;
    }

    await this.chatService.update(chatId, { auto_message_status: 'sending' });

    try {
      const mes = this.formatMessageAuto({
        message: template.body,
        name: chat.name,
        numero: chat.contact_client,
      });

      void this.messageService.typingStart(chatId).catch(() => {});

      const message = await this.messageService.createAgentMessage({
        chat_id: chat.chat_id,
        poste_id: null,
        text: mes,
        timestamp: new Date(),
        channel_id: chat.last_msg_client_channel_id,
      });

      await this.gateway.notifyAutoMessage(message, chat);

      const isDedicated = chat.last_msg_client_channel_id
        ? await this.channelService.isChannelDedicated(chat.last_msg_client_channel_id)
        : false;
      await this.chatService.update(chatId, {
        // Canal dédié → jamais en lecture seule
        ...(isDedicated ? {} : { read_only: true }),
        auto_message_status: 'sent',
        auto_message_id: template.id,
      });
      if (!isDedicated) {
        this.gateway.emitConversationReadonly({ ...chat, read_only: true } as typeof chat);
      }
    } catch (err) {
      await this.chatService.update(chatId, {
        read_only: false,
        auto_message_status: 'failed',
      });
      this.gateway.emitConversationReadonly({ ...chat, read_only: false } as typeof chat);
      throw err;
    } finally {
      void this.messageService.typingStop(chatId).catch(() => {});
    }
  }

  // ─── Helpers privés ───────────────────────────────────────────────────────

  private formatMessageAuto(data: {
    message: string;
    name?: string;
    numero?: string;
  }): string {
    const safeName = this.normalizeClientName(data.name);
    return data.message
      .replace(/#name#/gi, safeName)
      .replace(/#numero#/gi, data.numero ?? '');
  }

  private normalizeClientName(rawName?: string): string {
    if (!rawName) return 'Client';
    const titlesRegex = /(^|\s)(mr\.?|monsieur|mme\.?|madame|mademoiselle)\s+/gi;
    const cleaned = rawName.replace(titlesRegex, '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return 'Client';
    const firstName = cleaned.split(' ')[0];
    return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  }
}
