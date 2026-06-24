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
import { ChatSession } from 'src/chat-session/entities/chat-session.entity';
import { ChatSessionService } from 'src/chat-session/chat-session.service';

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

    @InjectRepository(ChatSession)
    private readonly sessionRepo: Repository<ChatSession>,

    private readonly cronConfigService: CronConfigService,
    private readonly messageAutoService: MessageAutoService,
    private readonly scopeConfigService: AutoMessageScopeConfigService,
    private readonly businessHoursService: BusinessHoursService,
    private readonly messageService: WhatsappMessageService,
    private readonly logger: AppLogger,
    private readonly chatSessionService: ChatSessionService,
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

    // ÉTAPE 4b — Détecter si l'orchestrateur événementiel est aussi actif
    // Si oui, exclure les chats déjà pris en charge (auto_message_step > 0 ou
    // waiting_client_reply = true) pour éviter les doublons de messages.
    const orchestratorConfig = await this.cronConfigService.findByKey('auto-message').catch(() => null);
    const orchestratorActive = orchestratorConfig?.enabled === true;

    this.logger.debug(
      `AutoMessageMasterJob run — ${new Date().toISOString()} — fenêtre: ${windowStart.toISOString()} — orchestrateur: ${orchestratorActive ? 'ACTIF (garde-fou ON)' : 'inactif'}`,
      AutoMessageMasterJob.name,
    );

    // ÉTAPE 5 — Exécuter chaque trigger (isolés par try/catch)
    await this.safeRun('A-no_response',  () => this.runTriggerA(allConfigs.get('no-response-auto-message'), orchestratorActive));
    await this.safeRun('C-out_of_hours', () => this.runTriggerC(allConfigs.get('out-of-hours-auto-message'), windowStart));
    await this.safeRun('D-reopened',     () => this.runTriggerD(allConfigs.get('reopened-auto-message'), windowStart));
    await this.safeRun('E-queue_wait',   () => this.runTriggerE(allConfigs.get('queue-wait-auto-message'), orchestratorActive));
    await this.safeRun('F-keyword',      () => this.runTriggerF(allConfigs.get('keyword-auto-message'), windowStart));
    await this.safeRun('G-client_type',  () => this.runTriggerG(allConfigs.get('client-type-auto-message'), windowStart));
    await this.safeRun('H-inactivity',   () => this.runTriggerH(allConfigs.get('inactivity-auto-message'), orchestratorActive));
    await this.safeRun('I-on_assign',    () => this.runTriggerI(allConfigs.get('on-assign-auto-message'), windowStart));
    await this.safeRun('J-window-reminder', () => this.runWindowReminder());

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

  private async runTriggerA(config: CronConfig | undefined, orchestratorActive = false): Promise<void> {
    if (!config?.enabled) return;

    const thresholdMs = (config.noResponseThresholdMinutes ?? 60) * 60_000;
    const maxSteps    = config.maxSteps ?? 1;
    const cutoff      = new Date(Date.now() - thresholdMs);
    const window23h   = new Date(Date.now() - 23 * 60 * 60_000);
    const window72h   = new Date(Date.now() - 72 * 60 * 60_000);

    const qb = this.chatRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.channel', 'channel')
      .where('c.last_client_message_at IS NOT NULL')
      .andWhere('(c.last_poste_message_at IS NULL OR c.last_client_message_at > c.last_poste_message_at)')
      .andWhere('c.no_response_auto_step < :maxSteps', { maxSteps })
      .andWhere(
        `((c.is_ctwa = 0 AND c.last_client_message_at >= :window23h)
          OR (c.is_ctwa = 1 AND c.last_client_message_at >= :window72h))`,
        { window23h, window72h },
      )
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
      );

    // Garde-fou cohabitation : si l'orchestrateur est aussi actif, exclure les
    // chats qu'il gère déjà (auto_message_step > 0 ou en attente de réponse client)
    if (orchestratorActive) {
      qb.andWhere('c.auto_message_step = 0').andWhere('c.waiting_client_reply = false');
    }

    const chats = await qb.limit(50).getMany();

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

  private async runTriggerE(config: CronConfig | undefined, orchestratorActive = false): Promise<void> {
    if (!config?.enabled) return;

    const thresholdMs = (config.queueWaitThresholdMinutes ?? 30) * 60_000;
    const maxSteps    = config.maxSteps ?? 1;
    const cutoff      = new Date(Date.now() - thresholdMs);
    const window23h   = new Date(Date.now() - 23 * 60 * 60_000);
    const window72h   = new Date(Date.now() - 72 * 60 * 60_000);

    const qb = this.chatRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.channel', 'channel')
      .where('c.poste_id IS NULL')
      .andWhere('c.status = :status', { status: WhatsappChatStatus.EN_ATTENTE })
      .andWhere('c.last_client_message_at IS NOT NULL')
      .andWhere(
        `((c.is_ctwa = 0 AND c.last_client_message_at >= :window23h)
          OR (c.is_ctwa = 1 AND c.last_client_message_at >= :window72h))`,
        { window23h, window72h },
      )
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
      );

    if (orchestratorActive) {
      qb.andWhere('c.auto_message_step = 0').andWhere('c.waiting_client_reply = false');
    }

    const chats = await qb.limit(50).getMany();

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

    // Charger tous les mots-clés actifs avec leur template associé (+ média)
    const keywords = await this.keywordRepo.find({
      where: { actif: true },
      relations: ['messageAuto', 'messageAuto.mediaAsset'],
    });
    if (!keywords.length) return;

    // Filtrer une seule fois hors boucle : templates actifs avec trigger keyword
    const activeKeywords = keywords.filter(
      (kw) => kw.messageAuto.actif && kw.messageAuto.trigger_type === AutoMessageTriggerType.KEYWORD,
    );

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

        // Trouver tous les mots-clés qui matchent le dernier message
        const matchingKeywords = activeKeywords.filter(
          (kw) => this.matchesKeyword(lastMsg.text!, kw),
        );
        if (!matchingKeywords.length) return;

        // Sélection priorisée : poste > canal > global
        const matchedKw = this.messageAutoService.selectBestKeywordTemplateForChat(
          matchingKeywords, chat,
        );
        if (!matchedKw) return;

        const scopeOk = await this.scopeConfigService.isEnabledFor(
          chat.poste_id, chat.last_msg_client_channel_id, chat.channel?.provider ?? null,
        );
        if (!scopeOk) return;

        await this.messageAutoService.sendAutoMessageTemplate(
          chat.chat_id, matchedKw.messageAuto,
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

  private async runTriggerH(config: CronConfig | undefined, orchestratorActive = false): Promise<void> {
    if (!config?.enabled) return;

    const thresholdMs = (config.inactivityThresholdMinutes ?? 120) * 60_000;
    const maxSteps    = config.maxSteps ?? 1;
    const cutoff      = new Date(Date.now() - thresholdMs);

    const qb = this.chatRepo
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
      .andWhere(config.applyToReadOnly ? '1=1' : 'c.read_only = false');

    if (orchestratorActive) {
      qb.andWhere('c.auto_message_step = 0').andWhere('c.waiting_client_reply = false');
    }

    const chats = await qb.limit(50).getMany();

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
  // TRIGGER J — Rappel fenêtre glissante
  // ─────────────────────────────────────────────────────────────────────────

  private async runWindowReminder(): Promise<void> {
    const config = await this.cronConfigService.findByKey('window-reminder-auto-message').catch(() => null);
    if (!config?.enabled) return;

    const maxAttempts  = config.windowReminderMaxAttempts           ?? 1;
    const intervalMin  = config.windowReminderAttemptIntervalMin    ?? 30;
    const normalStartMin = config.windowReminderNormalStartMin      ?? 10;
    const normalEndMin   = config.windowReminderNormalEndMin        ?? 2 * 60;
    const ctwaStartMin   = config.windowReminderCtwaStartMin        ?? 10;
    const ctwaEndMin     = config.windowReminderCtwaEndMin          ?? 4 * 60;
    const minReplies     = config.windowReminderMinReplies          ?? 1;
    const now = Date.now();

    // Fast-exit : aucun template J actif du tout
    const [hasJ1, hasJ2] = await Promise.all([
      this.messageAutoService.hasWindowReminderTemplate('with_replies'),
      this.messageAutoService.hasWindowReminderTemplate('no_replies'),
    ]);
    if (!hasJ1 && !hasJ2) return;

    // Bornes de fenêtre : auto_close_at dans [now + startMin, now + endMin]
    const normalMin = new Date(now + normalStartMin * 60_000);
    const normalMax = new Date(now + normalEndMin   * 60_000);
    const ctwaMin   = new Date(now + ctwaStartMin   * 60_000);
    const ctwaMax   = new Date(now + ctwaEndMin     * 60_000);
    // Seuil de délai inter-tentatives : la dernière tentative doit être antérieure à ce seuil
    const intervalThreshold = new Date(now - intervalMin * 60_000);

    // Source de vérité : ChatSession — jointure WhatsappChat pour statut/canal
    // Les sous-requêtes sur window_reminder_log utilisent les noms de colonnes SQL (snake_case)
    const sessions = await this.sessionRepo
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.chat', 'c')
      .leftJoinAndSelect('c.channel', 'channel')
      .where('c.status != :ferme', { ferme: WhatsappChatStatus.FERME })
      .andWhere('c.activeSessionId = s.id')
      .andWhere('s.endedAt IS NULL')
      .andWhere('s.autoCloseAt > NOW()')
      .andWhere(`(
        (s.isCtwa = 0 AND s.autoCloseAt BETWEEN :normalMin AND :normalMax)
        OR (s.isCtwa = 1 AND s.autoCloseAt BETWEEN :ctwaMin AND :ctwaMax)
      )`)
      .andWhere(
        `(SELECT COUNT(*) FROM window_reminder_log l WHERE l.session_id = s.id) < :maxAttempts`,
        { maxAttempts },
      )
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM window_reminder_log l WHERE l.session_id = s.id AND l.client_responded_at IS NOT NULL)`,
      )
      .andWhere(`(
        (SELECT MAX(l.sent_at) FROM window_reminder_log l WHERE l.session_id = s.id) IS NULL
        OR (SELECT MAX(l.sent_at) FROM window_reminder_log l WHERE l.session_id = s.id) <= :intervalThreshold
      )`, { intervalThreshold })
      .setParameters({ normalMin, normalMax, ctwaMin, ctwaMax })
      .limit(100)
      .getMany();

    this.logger.debug(
      `TriggerJ: ${sessions.length} session(s) éligible(s)`,
      AutoMessageMasterJob.name,
    );

    // Pré-chargement du nombre de tentatives en une seule requête (évite N+1 dans la boucle)
    const sessionIds = sessions.map((s) => s.id);
    const attemptCountRows: { session_id: string; count: string }[] =
      sessionIds.length > 0
        ? await this.sessionRepo.query(
            `SELECT session_id, COUNT(*) AS count FROM window_reminder_log WHERE session_id IN (${sessionIds.map(() => '?').join(',')}) GROUP BY session_id`,
            sessionIds,
          )
        : [];
    const attemptCountMap = new Map(
      attemptCountRows.map((r) => [r.session_id, parseInt(r.count) || 0]),
    );

    for (const session of sessions) {
      await this.safeSend(session.chat, async () => {
        const chat = session.chat;

        // Vérification scope auto-message (même pattern que triggers A-I)
        const scopeOk = await this.scopeConfigService.isEnabledFor(
          chat.poste_id, chat.last_msg_client_channel_id, chat.channel?.provider ?? null,
        );
        if (!scopeOk) return;

        const nextAttemptNumber = (attemptCountMap.get(session.id) ?? 0) + 1;

        // J1 vs J2 : le commercial a-t-il répondu au moins minReplies fois dans cette session ?
        const hasPosteReply = !!(
          session.lastPosteMessageAt &&
          session.lastClientMessageAt &&
          session.lastPosteMessageAt >= session.lastClientMessageAt
        );
        const variant: 'with_replies' | 'no_replies' =
          (hasPosteReply ? 1 : 0) >= minReplies ? 'with_replies' : 'no_replies';

        // Résolution du template (scope-aware)
        const template = await this.messageAutoService.getTemplateForTrigger(
          AutoMessageTriggerType.WINDOW_REMINDER,
          1,
          {
            posteId: chat.poste_id,
            channelId: chat.last_msg_client_channel_id,
            windowReminderTarget: variant,
          },
        );
        if (!template) return;

        // Anti-concurrence : mark AVANT envoi pour bloquer les instances concurrentes
        const marked = await this.chatSessionService.markWindowReminderAttempt(
          session.id, nextAttemptNumber, chat.id,
        );
        if (!marked) return;

        // Envoi — rollback du mark si l'envoi échoue pour permettre une relance au prochain cron
        const sent = await this.messageAutoService.sendWindowReminderWithTemplate(chat.chat_id, template);
        if (!sent) {
          await this.chatSessionService.deleteWindowReminderAttempt(session.id, nextAttemptNumber);
        }
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
      'window-reminder-auto-message',
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
