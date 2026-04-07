import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { OutboundRouterService } from 'src/communication_whapi/outbound-router.service';
import { Server } from 'socket.io';
import {
  AlertRecipient,
  SystemAlertConfig,
} from './entities/system-alert-config.entity';
import { NotificationService } from 'src/notification/notification.service';

export { AlertRecipient };

export interface AlertConfig {
  enabled: boolean;
  silenceThresholdMinutes: number;
  retryAfterMinutes: number;
  recipients: AlertRecipient[];
  /** Modèle du message. Placeholder : {silenceMin}. null = message par défaut. */
  messageTemplate: string | null;
  /**
   * Canal Whapi prioritaire pour l'envoi des alertes (channel_id externe).
   * null = essaie tous les canaux Whapi dans l'ordre jusqu'au premier succès.
   */
  defaultChannelId: string | null;
}

/** Résultat d'un envoi pour un destinataire */
export interface AlertSendResult {
  recipientName: string;
  recipientPhone: string;
  success: boolean;
  channelId: string | null;
  channelName: string | null;
  error: string | null;
}

/** Statut du dernier déclenchement d'alerte */
export interface LastAlertAttempt {
  triggeredAt: string;         // ISO date
  silenceMinutes: number;
  results: AlertSendResult[];
  overallSuccess: boolean;
}

const DEFAULT_MESSAGE_TEMPLATE =
  '🚨 *ALERTE SYSTÈME* — Aucun message entrant depuis *{silenceMin} minutes*.\n' +
  'Le serveur WhatsApp est peut-être hors ligne. Vérifiez immédiatement.';

const CONFIG_ROW_ID = 1;

@Injectable()
export class SystemAlertService implements OnModuleInit {
  private readonly logger = new Logger(SystemAlertService.name);

  private lastInboundAt: number = Date.now();
  private silenceTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private io: Server | null = null;

  /** Dernier déclenchement — conservé en mémoire pour l'API status */
  private lastAlertAttempt: LastAlertAttempt | null = null;

  private config: AlertConfig = {
    enabled: true,
    silenceThresholdMinutes: 60,
    retryAfterMinutes: 15,
    recipients: [],
    messageTemplate: null,
    defaultChannelId: null,
  };

  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,
    @InjectRepository(SystemAlertConfig)
    private readonly configRepo: Repository<SystemAlertConfig>,
    private readonly outboundRouter: OutboundRouterService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadConfigFromDb();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BDD
  // ─────────────────────────────────────────────────────────────────────────

  private async loadConfigFromDb(): Promise<void> {
    try {
      const row = await this.configRepo.findOne({ where: { id: CONFIG_ROW_ID } });
      if (row) {
        this.config = {
          enabled: row.enabled,
          silenceThresholdMinutes: row.silenceThresholdMinutes,
          retryAfterMinutes: row.retryAfterMinutes,
          recipients: row.recipients ?? [],
          messageTemplate: row.messageTemplate ?? null,
          defaultChannelId: row.defaultChannelId ?? null,
        };
        this.logger.log(
          `Config alerte chargée — seuil: ${this.config.silenceThresholdMinutes} min, ` +
          `${this.config.recipients.length} destinataire(s)`,
        );
      } else {
        await this.configRepo.save({
          id: CONFIG_ROW_ID,
          enabled: this.config.enabled,
          silenceThresholdMinutes: this.config.silenceThresholdMinutes,
          retryAfterMinutes: this.config.retryAfterMinutes,
          recipients: this.config.recipients,
          messageTemplate: this.config.messageTemplate,
          defaultChannelId: this.config.defaultChannelId,
        });
        this.logger.warn('Ligne config alerte créée en BDD (première exécution)');
      }
    } catch (err) {
      this.logger.error(
        `Impossible de charger la config alerte: ${(err as Error).message}`,
      );
    }
  }

  private async persistConfig(): Promise<void> {
    try {
      await this.configRepo.save({
        id: CONFIG_ROW_ID,
        enabled: this.config.enabled,
        silenceThresholdMinutes: this.config.silenceThresholdMinutes,
        retryAfterMinutes: this.config.retryAfterMinutes,
        recipients: this.config.recipients,
        messageTemplate: this.config.messageTemplate,
        defaultChannelId: this.config.defaultChannelId,
      });
    } catch (err) {
      this.logger.error(
        `Erreur sauvegarde config alerte: ${(err as Error).message}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Gateway Socket.io
  // ─────────────────────────────────────────────────────────────────────────

  setSocketServer(io: Server): void {
    this.io = io;
    this.resetTimer();
    this.logger.log('Timer alerte démarré (Socket.io prêt)');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Message entrant
  // ─────────────────────────────────────────────────────────────────────────

  onInboundMessage(): void {
    this.lastInboundAt = Date.now();

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
      this.logger.log('Alerte annulée — système rétabli');
    }

    this.emitAdminStatus(false);
    this.resetTimer();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Timer
  // ─────────────────────────────────────────────────────────────────────────

  private resetTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (!this.config.enabled) return;

    const ms = this.config.silenceThresholdMinutes * 60 * 1000;
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      void this.triggerAlert();
    }, ms);
  }

  private async triggerAlert(): Promise<void> {
    const silenceMin = Math.floor((Date.now() - this.lastInboundAt) / 60_000);
    this.logger.warn(`HEALTH_ALERT — silence depuis ${silenceMin} min`);

    this.emitAdminStatus(true, silenceMin);

    const results = await this.sendAlertsToAll(silenceMin);
    const overallSuccess = results.length > 0 && results.every((r) => r.success);

    // Mémoriser le dernier déclenchement
    this.lastAlertAttempt = {
      triggeredAt: new Date().toISOString(),
      silenceMinutes: silenceMin,
      results,
      overallSuccess,
    };

    // Notification dans l'onglet admin
    if (this.notificationService) {
      const summary = this.buildResultSummary(results, silenceMin);
      void this.notificationService
        .create(overallSuccess ? 'alert' : 'alert', '🚨 Alerte système', summary)
        .catch(() => undefined);
    }

    if (!overallSuccess) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.triggerAlert();
      }, this.config.retryAfterMinutes * 60 * 1000);
      this.logger.warn(`Retry dans ${this.config.retryAfterMinutes} min`);
    }

    this.resetTimer();
  }

  private buildResultSummary(results: AlertSendResult[], silenceMin: number): string {
    if (results.length === 0) {
      return `Alerte déclenchée (silence ${silenceMin} min) — aucun destinataire configuré.`;
    }

    const lines = results.map((r) => {
      if (r.success) {
        return `✅ ${r.recipientName} (${r.recipientPhone}) via canal ${r.channelName ?? r.channelId}`;
      }
      return `❌ ${r.recipientName} (${r.recipientPhone}) — ${r.error ?? 'échec inconnu'}`;
    });

    return `Alerte déclenchée (silence ${silenceMin} min) :\n${lines.join('\n')}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Envoi WhatsApp
  // ─────────────────────────────────────────────────────────────────────────

  private buildMessage(silenceMin: number): string {
    const template = this.config.messageTemplate ?? DEFAULT_MESSAGE_TEMPLATE;
    return template.replace(/\{silenceMin\}/g, String(silenceMin));
  }

  static normalizePhone(raw: string): string {
    let phone = raw.trim().replace(/\s/g, '');
    if (phone.startsWith('+')) phone = phone.slice(1);
    if (phone.startsWith('00')) phone = phone.slice(2);
    return phone;
  }

  private async sendAlertsToAll(silenceMin: number): Promise<AlertSendResult[]> {
    if (this.config.recipients.length === 0) {
      this.logger.warn('Aucun destinataire configuré');
      return [];
    }

    // On envoie uniquement via des canaux Whapi (provider = 'whapi' ou null).
    // Les canaux Meta/Messenger/Instagram/Telegram ne peuvent pas envoyer à un
    // numéro WhatsApp brut — ils nécessitent un PSID ou un chat_id spécifique.
    const allChannels = await this.channelRepo.find();
    const whapiChannels = allChannels.filter(
      (c) => !c.provider || c.provider === 'whapi',
    );

    if (!whapiChannels.length) {
      const msg =
        allChannels.length > 0
          ? `Aucun canal Whapi disponible (${allChannels.length} canal(aux) ignoré(s) : Meta/Messenger/Instagram/Telegram)`
          : 'Aucun canal configuré dans le système';
      this.logger.error(msg);
      return this.config.recipients.map((r) => ({
        recipientName: r.name,
        recipientPhone: r.phone,
        success: false,
        channelId: null,
        channelName: null,
        error: msg,
      }));
    }

    // Si un canal par défaut est configuré, le mettre en premier dans la liste.
    // Les autres canaux Whapi servent de fallback si le canal par défaut échoue.
    let channels: WhapiChannel[];
    if (this.config.defaultChannelId) {
      const preferred = whapiChannels.find(
        (c) => c.channel_id === this.config.defaultChannelId,
      );
      if (preferred) {
        const rest = whapiChannels.filter(
          (c) => c.channel_id !== this.config.defaultChannelId,
        );
        channels = [preferred, ...rest];
        this.logger.log(
          `Canal préféré : ${preferred.label ?? preferred.channel_id} + ${rest.length} fallback(s)`,
        );
      } else {
        this.logger.warn(
          `Canal par défaut "${this.config.defaultChannelId}" introuvable parmi les canaux Whapi — utilisation de tous les canaux`,
        );
        channels = whapiChannels;
      }
    } else {
      channels = whapiChannels;
    }

    this.logger.log(
      `Ordre d'essai (${channels.length} canal(aux)): ${channels.map((c) => c.label ?? c.channel_id).join(' → ')}`,
    );

    const text = this.buildMessage(silenceMin);
    const results: AlertSendResult[] = [];

    for (const recipient of this.config.recipients) {
      const result = await this.sendWithFallback(channels, recipient, text);
      results.push(result);
    }

    return results;
  }

  private async sendWithFallback(
    channels: WhapiChannel[],
    recipient: AlertRecipient,
    text: string,
  ): Promise<AlertSendResult> {
    const normalizedPhone = SystemAlertService.normalizePhone(recipient.phone);

    // CommunicationWhapiService.validateWhapiRecipient() attend UNIQUEMENT des
    // chiffres (regex ^\d{8,20}$) — PAS de suffixe @s.whatsapp.net.
    const to = normalizedPhone;

    const channelErrors: string[] = [];

    for (const channel of channels) {
      try {
        this.logger.log(
          `Tentative envoi alerte → ${recipient.name} (${normalizedPhone}) via canal ${channel.label ?? channel.channel_id}`,
        );
        await this.outboundRouter.sendTextMessage({
          text,
          to,
          channelId: channel.channel_id,
        });
        this.logger.log(
          `✅ Alerte envoyée à ${recipient.name} via canal ${channel.label ?? channel.channel_id}`,
        );
        return {
          recipientName: recipient.name,
          recipientPhone: normalizedPhone,
          success: true,
          channelId: channel.channel_id,
          channelName: channel.label ?? channel.channel_id,
          error: null,
        };
      } catch (err) {
        const msg = (err as Error).message;
        channelErrors.push(`[${channel.label ?? channel.channel_id}] ${msg}`);
        this.logger.warn(
          `❌ Canal ${channel.label ?? channel.channel_id} échoué pour ${recipient.name}: ${msg}`,
        );
      }
    }

    const errMsg = `Tous les canaux ont échoué (${channels.length} canal(aux) essayé(s))`;
    const detailedError =
      channelErrors.length > 0
        ? `Tous les canaux ont échoué :\n${channelErrors.join('\n')}`
        : `Aucun canal essayé`;

    this.logger.error(detailedError);
    return {
      recipientName: recipient.name,
      recipientPhone: normalizedPhone,
      success: false,
      channelId: null,
      channelName: null,
      error: detailedError,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test manuel (bouton admin)
  // ─────────────────────────────────────────────────────────────────────────

  async sendTestAlert(): Promise<{ results: AlertSendResult[]; message: string }> {
    const silenceMin = Math.floor((Date.now() - this.lastInboundAt) / 60_000);
    this.logger.warn(`TEST ALERT manuel déclenché (silence actuel: ${silenceMin} min)`);

    const results = await this.sendAlertsToAll(silenceMin);
    const overallSuccess = results.length > 0 && results.every((r) => r.success);

    this.lastAlertAttempt = {
      triggeredAt: new Date().toISOString(),
      silenceMinutes: silenceMin,
      results,
      overallSuccess,
    };

    if (this.notificationService) {
      const summary = '[TEST] ' + this.buildResultSummary(results, silenceMin);
      void this.notificationService
        .create('info', '🧪 Test alerte système', summary)
        .catch(() => undefined);
    }

    const successCount = results.filter((r) => r.success).length;
    const message =
      results.length === 0
        ? 'Aucun destinataire configuré'
        : overallSuccess
          ? `Test réussi — ${successCount}/${results.length} message(s) envoyé(s)`
          : `Échec partiel — ${successCount}/${results.length} envoyé(s)`;

    return { results, message };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Socket.io
  // ─────────────────────────────────────────────────────────────────────────

  private emitAdminStatus(alerting: boolean, silenceMin = 0): void {
    if (!this.io) return;
    this.io.emit('system:health', {
      alerting,
      silenceMinutes: silenceMin,
      lastInboundAt: new Date(this.lastInboundAt).toISOString(),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // API admin
  // ─────────────────────────────────────────────────────────────────────────

  getConfig(): AlertConfig {
    return { ...this.config, recipients: [...this.config.recipients] };
  }

  async updateConfig(patch: Partial<AlertConfig>): Promise<AlertConfig> {
    if (patch.recipients) {
      patch.recipients = patch.recipients.map((r) => ({
        ...r,
        phone: SystemAlertService.normalizePhone(r.phone),
      }));
    }
    this.config = { ...this.config, ...patch };
    await this.persistConfig();
    this.resetTimer();
    return this.getConfig();
  }

  getStatus(): {
    alerting: boolean;
    silenceMinutes: number;
    lastInboundAt: string;
    lastAlertAttempt: LastAlertAttempt | null;
    timerActive: boolean;
    enabled: boolean;
  } {
    const silenceMin = Math.floor((Date.now() - this.lastInboundAt) / 60_000);
    return {
      alerting: this.config.enabled && silenceMin >= this.config.silenceThresholdMinutes,
      silenceMinutes: silenceMin,
      lastInboundAt: new Date(this.lastInboundAt).toISOString(),
      lastAlertAttempt: this.lastAlertAttempt,
      timerActive: this.silenceTimer !== null,
      enabled: this.config.enabled,
    };
  }

  getDefaultMessageTemplate(): string {
    return DEFAULT_MESSAGE_TEMPLATE;
  }
}
