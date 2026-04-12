import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CronConfigService } from './cron-config.service';
import { CronConfig } from './entities/cron-config.entity';
import { MessageAutoService } from 'src/message-auto/message-auto.service';
import { AutoMessageTriggerType } from 'src/message-auto/entities/message-auto.entity';
import { AutoMessageKeyword } from 'src/message-auto/entities/auto-message-keyword.entity';
import { AutoMessageScopeConfigService } from 'src/message-auto/auto-message-scope-config.service';
import { BusinessHoursService } from 'src/message-auto/business-hours.service';
import { AppLogger } from 'src/logging/app-logger.service';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';

const MASTER_KEY = 'auto-message-master';


export interface MasterPreviewConversation {
  chat_id: string;
  name: string;
  status: string;
  trigger: AutoMessageTriggerType;
  minutes_waiting: number;
}

@Injectable()
export class AutoMessageMasterJob implements OnModuleInit {
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,

    @InjectRepository(AutoMessageKeyword)
    private readonly keywordRepo: Repository<AutoMessageKeyword>,

    private readonly cronConfigService: CronConfigService,
    private readonly messageAutoService: MessageAutoService,
    private readonly scopeConfigService: AutoMessageScopeConfigService,
    private readonly businessHoursService: BusinessHoursService,
    private readonly messageService: WhatsappMessageService,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler(MASTER_KEY, () => this.run());
    this.cronConfigService.registerPreviewHandler(MASTER_KEY, () => this.preview());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Exécution principale
  // ─────────────────────────────────────────────────────────────────────────

  async run(): Promise<void> {
    const runStart = Date.now();
    // ÉTAPE 1 — Config maître
    const masterConfig = await this.cronConfigService.findByKey(MASTER_KEY);
    if (!masterConfig.enabled) return;

    // ÉTAPE 2 — Plage horaire
    const hour  = new Date().getHours();
    const start = masterConfig.activeHourStart ?? 5;
    const end   = masterConfig.activeHourEnd   ?? 21;
    if (hour < start || hour >= end) {
      this.logger.debug(
        `AutoMessageMasterJob ignoré — hors plage horaire (${hour}h, plage: ${start}h–${end}h)`,
        AutoMessageMasterJob.name,
      );
      return;
    }

    // ÉTAPE 3 — Charger toutes les trigger configs
    const allConfigs = await this.loadTriggerConfigs();

    // ÉTAPE 4 — Fenêtre glissante pour les triggers polling
    const intervalMs = (masterConfig.intervalMinutes ?? 5) * 2 * 60_000;
    const windowStart = new Date(Date.now() - intervalMs);

    this.logger.debug(
      `AutoMessageMasterJob run — ${new Date().toISOString()} — fenêtre: ${windowStart.toISOString()}`,
      AutoMessageMasterJob.name,
    );

    // ÉTAPE 5 — Exécuter chaque trigger (isolés par try/catch)
    await this.safeRun('A-no_response',  () => this.runTriggerA(allConfigs.get('no-response-auto-message')));
    await this.safeRun('C-out_of_hours', () => this.runTriggerC(allConfigs.get('out-of-hours-auto-message'), windowStart));
    await this.safeRun('D-reopened',     () => this.runTriggerD(allConfigs.get('reopened-auto-message'), windowStart));
    await this.safeRun('E-queue_wait',   () => this.runTriggerE(allConfigs.get('queue-wait-auto-message')));
    await this.safeRun('F-keyword',      () => this.runTriggerF(allConfigs.get('keyword-auto-message'), windowStart));
    await this.safeRun('G-client_type',  () => this.runTriggerG(allConfigs.get('client-type-auto-message'), windowStart));
    await this.safeRun('H-inactivity',   () => this.runTriggerH(allConfigs.get('inactivity-auto-message')));
    await this.safeRun('I-on_assign',    () => this.runTriggerI(allConfigs.get('on-assign-auto-message'), windowStart));

    const durationMs = Date.now() - runStart;
    this.logger.debug(
      `AutoMessageMasterJob completed duration=${durationMs}ms`,
      AutoMessageMasterJob.name,
    );
    if (durationMs > 30_000) {
      this.logger.warn(
        `AutoMessageMasterJob SLOW run duration=${durationMs}ms — risque de surcharge DB`,
        AutoMessageMasterJob.name,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRIGGER A — Sans réponse
  // ─────────────────────────────────────────────────────────────────────────

  private async runTriggerA(config: CronConfig | undefined): Promise<void> {
    if (!config?.enabled) return;

    const thresholdMs = (config.noResponseThresholdMinutes ?? 60) * 60_000;
    const maxSteps    = config.maxSteps ?? 1;
    const cutoff      = new Date(Date.now() - thresholdMs);
    const window23h   = new Date(Date.now() - 23 * 60 * 60_000);

    const chats = await this.chatRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.channel', 'channel')
      .where('c.last_client_message_at IS NOT NULL')
      .andWhere('(c.last_poste_message_at IS NULL OR c.last_client_message_at > c.last_poste_message_at)')
      .andWhere('c.no_response_auto_step < :maxSteps', { maxSteps })
      .andWhere('c.last_client_message_at >= :window23h', { window23h })
      .andWhere(
        `(
          (c.no_response_auto_step = 0 AND c.last_client_message_at <= :cutoff)
          OR
          (c.no_response_auto_step > 0
            AND c.last_no_response_auto_sent_at <= :cutoff
            AND c.last_no_response_auto_sent_at >= c.last_client_message_at)
        )`,
        { cutoff },
      )
      .andWhere(config.applyToReadOnly ? '1=1' : 'c.read_only = false')
      .andWhere(
        config.applyToClosed ? '1=1' : 'c.status != :closed',
        config.applyToClosed ? {} : { closed: WhatsappChatStatus.FERME },
      )
      .limit(50)
      .getMany();

    this.logger.debug(`TriggerA: ${chats.length} conversation(s) ciblée(s)`, AutoMessageMasterJob.name);

    for (const chat of chats) {
      await this.safeSend(chat, async () => {
        const scopeOk = await this.scopeConfigService.isEnabledFor(
          chat.poste_id, chat.last_msg_client_channel_id, chat.channel?.provider ?? null,
        );
        if (!scopeOk) return;
        await this.messageAutoService.sendAutoMessageForTrigger(
          chat.chat_id,
          AutoMessageTriggerType.NO_RESPONSE,
          chat.no_response_auto_step + 1,
        );
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRIGGER C — Hors horaires
  // ─────────────────────────────────────────────────────────────────────────

  private async runTriggerC(config: CronConfig | undefined, windowStart: Date): Promise<void> {
    if (!config?.enabled) return;

    const isOpen = await this.businessHoursService.isCurrentlyOpen();
    if (isOpen) return;

    const chats = await this.chatRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.channel', 'channel')
      .where('c.last_client_message_at >= :windowStart', { windowStart })
      .andWhere('c.out_of_hours_auto_sent = false')
      .andWhere('c.status != :closed', { closed: WhatsappChatStatus.FERME })
      .limit(100)
      .getMany();

    this.logger.debug(`TriggerC: ${chats.length} conversation(s) ciblée(s)`, AutoMessageMasterJob.name);

    for (const chat of chats) {
      await this.safeSend(chat, async () => {
        const scopeOk = await this.scopeConfigService.isEnabledFor(
          chat.poste_id, chat.last_msg_client_channel_id, chat.channel?.provider ?? null,
        );
        if (!scopeOk) return;
        await this.messageAutoService.sendAutoMessageForTrigger(
          chat.chat_id, AutoMessageTriggerType.OUT_OF_HOURS, 1,
        );
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRIGGER D — Réouverture
  // ─────────────────────────────────────────────────────────────────────────

  private async runTriggerD(config: CronConfig | undefined, windowStart: Date): Promise<void> {
    if (!config?.enabled) return;

    const chats = await this.chatRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.channel', 'channel')
      .where('c.reopened_at >= :windowStart', { windowStart })
      .andWhere('c.reopened_auto_sent = false')
      .limit(100)
      .getMany();

    this.logger.debug(`TriggerD: ${chats.length} conversation(s) ciblée(s)`, AutoMessageMasterJob.name);

    for (const chat of chats) {
      await this.safeSend(chat, async () => {
        const scopeOk = await this.scopeConfigService.isEnabledFor(
          chat.poste_id, chat.last_msg_client_channel_id, chat.channel?.provider ?? null,
        );
        if (!scopeOk) return;
        await this.messageAutoService.sendAutoMessageForTrigger(
          chat.chat_id, AutoMessageTriggerType.REOPENED, 1,
        );
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRIGGER E — Attente en queue
  // ─────────────────────────────────────────────────────────────────────────

  private async runTriggerE(config: CronConfig | undefined): Promise<void> {
    if (!config?.enabled) return;

    const thresholdMs = (config.queueWaitThresholdMinutes ?? 30) * 60_000;
    const maxSteps    = config.maxSteps ?? 1;
    const cutoff      = new Date(Date.now() - thresholdMs);
    const window23h   = new Date(Date.now() - 23 * 60 * 60_000);

    const chats = await this.chatRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.channel', 'channel')
      .where('c.poste_id IS NULL')
      .andWhere('c.status = :status', { status: WhatsappChatStatus.EN_ATTENTE })
      .andWhere('c.last_client_message_at IS NOT NULL')
      .andWhere('c.last_client_message_at >= :window23h', { window23h })
      .andWhere('c.queue_wait_auto_step < :maxSteps', { maxSteps })
      .andWhere(
        `(
          (c.queue_wait_auto_step = 0 AND c.last_client_message_at <= :cutoff)
          OR
          (c.queue_wait_auto_step > 0
            AND c.last_queue_wait_auto_sent_at <= :cutoff
            AND c.last_queue_wait_auto_sent_at >= c.last_client_message_at)
        )`,
        { cutoff },
      )
      .limit(50)
      .getMany();

    this.logger.debug(`TriggerE: ${chats.length} conversation(s) ciblée(s)`, AutoMessageMasterJob.name);

    for (const chat of chats) {
      await this.safeSend(chat, async () => {
        const scopeOk = await this.scopeConfigService.isEnabledFor(
          chat.poste_id, chat.last_msg_client_channel_id, chat.channel?.provider ?? null,
        );
        if (!scopeOk) return;
        await this.messageAutoService.sendAutoMessageForTrigger(
          chat.chat_id, AutoMessageTriggerType.QUEUE_WAIT, chat.queue_wait_auto_step + 1,
        );
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRIGGER F — Mot-clé détecté
  // ─────────────────────────────────────────────────────────────────────────

  private async runTriggerF(config: CronConfig | undefined, windowStart: Date): Promise<void> {
    if (!config?.enabled) return;

    // Charger tous les mots-clés actifs avec leur template associé
    const keywords = await this.keywordRepo.find({
      where: { actif: true },
      relations: ['messageAuto'],
    });
    if (!keywords.length) return;

    // Conversations récentes dont le keyword n'a pas encore été traité
    const chats = await this.chatRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.channel', 'channel')
      .where('c.last_client_message_at >= :windowStart', { windowStart })
      .andWhere('(c.keyword_auto_sent_at IS NULL OR c.keyword_auto_sent_at < c.last_client_message_at)')
      .andWhere('c.status != :closed', { closed: WhatsappChatStatus.FERME })
      .limit(30)
      .getMany();

    this.logger.debug(`TriggerF: ${chats.length} conversation(s) à analyser`, AutoMessageMasterJob.name);

    for (const chat of chats) {
      await this.safeSend(chat, async () => {
        // Récupérer le texte du dernier message client
        const lastMsg = await this.messageService.findLastInboundMessageBychat_id(chat.chat_id);
        if (!lastMsg?.text) return;

        const matchedKw = keywords.find((kw) => this.matchesKeyword(lastMsg.text!, kw));
        if (!matchedKw) return;

        const scopeOk = await this.scopeConfigService.isEnabledFor(
          chat.poste_id, chat.last_msg_client_channel_id, chat.channel?.provider ?? null,
        );
        if (!scopeOk) return;

        await this.messageAutoService.sendAutoMessageForTrigger(
          chat.chat_id, AutoMessageTriggerType.KEYWORD, matchedKw.messageAuto.position,
        );
      });
    }
  }

  private matchesKeyword(text: string, kw: AutoMessageKeyword): boolean {
    const haystack = kw.caseSensitive ? text : text.toLowerCase();
    const needle   = kw.caseSensitive ? kw.keyword : kw.keyword.toLowerCase();

    switch (kw.matchType) {
      case 'exact':       return haystack === needle;
      case 'starts_with': return haystack.startsWith(needle);
      case 'contains':
      default:            return haystack.includes(needle);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRIGGER G — Type de client
  // ─────────────────────────────────────────────────────────────────────────

  private async runTriggerG(config: CronConfig | undefined, windowStart: Date): Promise<void> {
    if (!config?.enabled) return;

    const chats = await this.chatRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.channel', 'channel')
      .where('c.last_client_message_at >= :windowStart', { windowStart })
      .andWhere('c.client_type_auto_sent = false')
      .limit(100)
      .getMany();

    this.logger.debug(`TriggerG: ${chats.length} conversation(s) ciblée(s)`, AutoMessageMasterJob.name);

    for (const chat of chats) {
      await this.safeSend(chat, async () => {
        const scopeOk = await this.scopeConfigService.isEnabledFor(
          chat.poste_id, chat.last_msg_client_channel_id, chat.channel?.provider ?? null,
        );
        if (!scopeOk) return;

        const clientTypeTarget = chat.is_known_client === true ? 'returning' : 'new';
        await this.messageAutoService.sendAutoMessageForTrigger(
          chat.chat_id, AutoMessageTriggerType.CLIENT_TYPE, 1, { clientTypeTarget },
        );
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRIGGER H — Inactivité totale
  // ─────────────────────────────────────────────────────────────────────────

  private async runTriggerH(config: CronConfig | undefined): Promise<void> {
    if (!config?.enabled) return;

    const thresholdMs = (config.inactivityThresholdMinutes ?? 120) * 60_000;
    const maxSteps    = config.maxSteps ?? 1;
    const cutoff      = new Date(Date.now() - thresholdMs);

    const chats = await this.chatRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.channel', 'channel')
      .where('c.status IN (:...statuses)', { statuses: [WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE] })
      .andWhere('c.last_activity_at IS NOT NULL')
      .andWhere('c.last_activity_at <= :cutoff', { cutoff })
      .andWhere('c.inactivity_auto_step < :maxSteps', { maxSteps })
      .andWhere(
        `(
          c.inactivity_auto_step = 0
          OR (c.inactivity_auto_step > 0 AND c.last_inactivity_auto_sent_at <= :cutoff)
        )`,
        { cutoff },
      )
      .andWhere(config.applyToReadOnly ? '1=1' : 'c.read_only = false')
      .limit(50)
      .getMany();

    this.logger.debug(`TriggerH: ${chats.length} conversation(s) ciblée(s)`, AutoMessageMasterJob.name);

    for (const chat of chats) {
      await this.safeSend(chat, async () => {
        const scopeOk = await this.scopeConfigService.isEnabledFor(
          chat.poste_id, chat.last_msg_client_channel_id, chat.channel?.provider ?? null,
        );
        if (!scopeOk) return;
        await this.messageAutoService.sendAutoMessageForTrigger(
          chat.chat_id, AutoMessageTriggerType.INACTIVITY, chat.inactivity_auto_step + 1,
        );
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRIGGER I — Après assignation
  // ─────────────────────────────────────────────────────────────────────────

  private async runTriggerI(config: CronConfig | undefined, windowStart: Date): Promise<void> {
    if (!config?.enabled) return;

    const chats = await this.chatRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.channel', 'channel')
      .where('c.assigned_at >= :windowStart', { windowStart })
      .andWhere('c.poste_id IS NOT NULL')
      .andWhere('c.on_assign_auto_sent = false')
      .limit(100)
      .getMany();

    this.logger.debug(`TriggerI: ${chats.length} conversation(s) ciblée(s)`, AutoMessageMasterJob.name);

    for (const chat of chats) {
      await this.safeSend(chat, async () => {
        const scopeOk = await this.scopeConfigService.isEnabledFor(
          chat.poste_id, chat.last_msg_client_channel_id, chat.channel?.provider ?? null,
        );
        if (!scopeOk) return;
        await this.messageAutoService.sendAutoMessageForTrigger(
          chat.chat_id, AutoMessageTriggerType.ON_ASSIGN, 1,
        );
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Preview — aperçu sans action
  // ─────────────────────────────────────────────────────────────────────────

  async preview(): Promise<{ total: number; conversations: MasterPreviewConversation[] }> {
    const allConfigs = await this.loadTriggerConfigs();
    const masterConfig = await this.cronConfigService.findByKey(MASTER_KEY);
    const intervalMs = (masterConfig.intervalMinutes ?? 5) * 2 * 60_000;
    const windowStart = new Date(Date.now() - intervalMs);
    const results: MasterPreviewConversation[] = [];

    // A — Sans réponse
    const cfgA = allConfigs.get('no-response-auto-message');
    if (cfgA?.enabled) {
      const cutoff = new Date(Date.now() - (cfgA.noResponseThresholdMinutes ?? 60) * 60_000);
      const chats = await this.chatRepo.find({
        where: {
          last_client_message_at: LessThan(cutoff),
          last_poste_message_at: IsNull(),
        },
        take: 50,
      });
      for (const c of chats) {
        results.push({
          chat_id: c.chat_id,
          name: c.name,
          status: c.status,
          trigger: AutoMessageTriggerType.NO_RESPONSE,
          minutes_waiting: c.last_client_message_at
            ? Math.floor((Date.now() - new Date(c.last_client_message_at).getTime()) / 60_000)
            : 0,
        });
      }
    }

    return { total: results.length, conversations: results };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers privés
  // ─────────────────────────────────────────────────────────────────────────

  private loadTriggerConfigs(): Promise<Map<string, CronConfig>> {
    return this.cronConfigService.findByKeys([
      'no-response-auto-message', 'out-of-hours-auto-message', 'reopened-auto-message',
      'queue-wait-auto-message', 'keyword-auto-message', 'client-type-auto-message',
      'inactivity-auto-message', 'on-assign-auto-message',
    ]);
  }

  /** Exécute un trigger de façon isolée — une erreur ne bloque pas les suivants */
  private async safeRun(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(
        `AutoMessageMasterJob — trigger ${label} failed: ${msg}`,
        stack,
        AutoMessageMasterJob.name,
      );
    }
  }

  /** Exécute l'envoi pour un chat de façon isolée — une erreur n'arrête pas les autres chats */
  private async safeSend(chat: WhatsappChat, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `AutoMessageMasterJob — send failed for ${chat.chat_id}: ${msg}`,
        undefined,
        AutoMessageMasterJob.name,
      );
    }
  }
}
