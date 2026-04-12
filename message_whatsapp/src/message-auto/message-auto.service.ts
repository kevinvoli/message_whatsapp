import {
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
  ) {}

  // ─── CRUD de base ─────────────────────────────────────────────────────────

  async create(dto: CreateMessageAutoDto): Promise<MessageAuto> {
    const { keywords, ...rest } = dto;
    const message = this.autoMessageRepo.create(rest);
    const saved = await this.autoMessageRepo.save(message);

    if (keywords?.length) {
      const kws = keywords.map((k) =>
        this.keywordRepo.create({ ...k, messageAutoId: saved.id }),
      );
      await this.keywordRepo.save(kws);
    }

    return this.findOne(saved.id);
  }

  async findAll(): Promise<MessageAuto[]> {
    return this.autoMessageRepo.find({
      order: { trigger_type: 'ASC', position: 'ASC' },
      relations: ['keywords'],
    });
  }

  async findByTrigger(trigger: AutoMessageTriggerType): Promise<MessageAuto[]> {
    return this.autoMessageRepo.find({
      where: { trigger_type: trigger },
      order: { scope_type: 'ASC', position: 'ASC' },
      relations: ['keywords'],
    });
  }

  async findOne(id: string): Promise<MessageAuto> {
    const message = await this.autoMessageRepo.findOne({
      where: { id },
      relations: ['keywords'],
    });
    if (!message) {
      throw new NotFoundException(`Auto message with ID ${id} not found`);
    }
    return message;
  }

  async update(id: string, dto: UpdateMessageAutoDto): Promise<MessageAuto> {
    const message = await this.findOne(id);
    const { keywords, ...rest } = dto as CreateMessageAutoDto;
    Object.assign(message, rest);
    return this.autoMessageRepo.save(message);
  }

  async remove(id: string): Promise<void> {
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
    const poolGlobal = filtered.filter((t) => !t.scope_type);

    const pool = poolPoste.length ? poolPoste : poolCanal.length ? poolCanal : poolGlobal;

    if (!pool.length) return null;

    return pool[Math.floor(Math.random() * pool.length)];
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
        message: template.body,
        name: chat.name,
        numero: chat.contact_client,
      });

      const message = await this.messageService.createAgentMessage({
        chat_id: chat.chat_id,
        poste_id: null,
        text,
        timestamp: new Date(),
        channel_id: chat.last_msg_client_channel_id,
      });

      await this.gateway.notifyAutoMessage(message, chat);

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

    this.logger.debug(
      `Auto message step ${chat.auto_message_step} for ${chat.chat_id}`,
      MessageAutoService.name,
    );

    const template = await this.getAutoMessageByPosition(position);

    if (!template) {
      this.logger.debug(
        `No active template at position ${position} — skipping auto message for ${chatId}`,
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

      await this.chatService.update(chatId, {
        read_only: true,
        auto_message_status: 'sent',
        auto_message_id: template.id,
      });
      this.gateway.emitConversationReadonly({ ...chat, read_only: true } as typeof chat);
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
