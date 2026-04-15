import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { CommunicationWhapiService } from 'src/communication_whapi/communication_whapi.service';
import { CommunicationMetaService } from 'src/communication_whapi/communication_meta.service';
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
  /** ID du message Whapi — pour vérification dans le dashboard Whapi */
  providerMessageId: string | null;
  /** Statut de livraison retourné par Whapi */
  messageStatus: 'pending' | 'sent' | 'delivered' | 'read' | null;
  /** Champ `sent` de la réponse Whapi (false = refusé malgré HTTP 200) */
  whapiFlagged: boolean;
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
    private readonly whapiService: CommunicationWhapiService,
    private readonly metaService: CommunicationMetaService,
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

    const allChannels = await this.channelRepo.find();

    // Priorité : canaux Whapi d'abord (envoi brut possible), Meta en fallback
    // (fenêtre 24h requise). Les autres providers (Messenger, Instagram, Telegram)
    // ne peuvent pas envoyer à un numéro brut — ils sont exclus.
    const eligible = allChannels.filter(
      (c) => !c.provider || c.provider === 'whapi' || c.provider === 'meta',
    );

    if (!eligible.length) {
      const msg =
        allChannels.length > 0
          ? `Aucun canal Whapi/Meta disponible (${allChannels.length} canal(aux) non éligible(s))`
          : 'Aucun canal configuré dans le système';
      this.logger.error(msg);
      return this.config.recipients.map((r) => ({
        recipientName: r.name,
        recipientPhone: r.phone,
        success: false,
        channelId: null,
        channelName: null,
        error: msg,
        providerMessageId: null,
        messageStatus: null,
        whapiFlagged: false,
      }));
    }

    // Ordonner : canal par défaut en premier, puis Whapi, puis Meta (fallback)
    let channels: WhapiChannel[];
    const whapiChannels = eligible.filter((c) => !c.provider || c.provider === 'whapi');
    const metaChannels = eligible.filter((c) => c.provider === 'meta');

    if (this.config.defaultChannelId) {
      const preferred = eligible.find((c) => c.channel_id === this.config.defaultChannelId);
      if (preferred) {
        const rest = eligible.filter((c) => c.channel_id !== this.config.defaultChannelId);
        // Remettre Whapi avant Meta dans le reste
        const restOrdered = [
          ...rest.filter((c) => !c.provider || c.provider === 'whapi'),
          ...rest.filter((c) => c.provider === 'meta'),
        ];
        channels = [preferred, ...restOrdered];
        this.logger.log(
          `Canal préféré : ${preferred.label ?? preferred.channel_id} (${preferred.provider ?? 'whapi'}) + ${rest.length} fallback(s)`,
        );
      } else {
        this.logger.warn(
          `Canal par défaut "${this.config.defaultChannelId}" introuvable — utilisation de tous les canaux éligibles`,
        );
        channels = [...whapiChannels, ...metaChannels];
      }
    } else {
      channels = [...whapiChannels, ...metaChannels];
    }

    if (metaChannels.length > 0) {
      this.logger.warn(
        `⚠️ ${metaChannels.length} canal(aux) Meta inclus — envoi possible uniquement dans la fenêtre de 24h (contact initié par le client).`,
      );
    }

    this.logger.log(
      `Ordre d'essai (${channels.length} canal(aux)): ${channels.map((c) => `${c.label ?? c.channel_id}[${c.provider ?? 'whapi'}]`).join(' → ')}`,
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
    const channelErrors: string[] = [];

    for (const channel of channels) {
      const channelLabel = channel.label ?? channel.channel_id;
      const provider = channel.provider ?? 'whapi';
      try {
        this.logger.log(
          `Tentative envoi alerte → ${recipient.name} (${normalizedPhone}) via ${channelLabel} [${provider}]`,
        );

        if (provider === 'meta') {
          // Meta Cloud API — nécessite fenêtre 24h ou template HSM
          if (!channel.external_id || !channel.token) {
            const reason = `Canal Meta "${channelLabel}" sans phoneNumberId ou accessToken`;
            channelErrors.push(`[${channelLabel}] ${reason}`);
            this.logger.warn(`❌ ${reason}`);
            continue;
          }

          const result = await this.metaService.sendTextMessage({
            text,
            to: normalizedPhone,
            phoneNumberId: channel.external_id,
            accessToken: channel.token?.trim() ?? '',
          });

          const msgId = result.providerMessageId;
          this.logger.log(
            `✅ Alerte envoyée à ${recipient.name} via Meta ${channelLabel} — id=${msgId}`,
          );
          return {
            recipientName: recipient.name,
            recipientPhone: normalizedPhone,
            success: true,
            channelId: channel.channel_id,
            channelName: channelLabel,
            error: null,
            providerMessageId: msgId,
            messageStatus: 'sent',
            whapiFlagged: false,
          };
        }

        // Provider Whapi (par défaut) — CommunicationWhapiService attend uniquement des chiffres (^\d{8,20}$)
        const response = await this.whapiService.sendToWhapiChannel({
          text,
          to: normalizedPhone,
          channelId: channel.channel_id,
        });

        const msgId = response.message?.id ?? null;
        const msgStatus = response.message?.status ?? null;
        const whapiFlagged = response.sent === false;

        if (whapiFlagged) {
          const reason = `Whapi a retourné sent=false (status=${msgStatus ?? 'inconnu'}, id=${msgId ?? 'none'})`;
          channelErrors.push(`[${channelLabel}] ${reason}`);
          this.logger.warn(`❌ ${channelLabel} refus Whapi: ${reason}`);
          continue;
        }

        this.logger.log(
          `✅ Alerte envoyée à ${recipient.name} via ${channelLabel} — id=${msgId}, status=${msgStatus}`,
        );
        return {
          recipientName: recipient.name,
          recipientPhone: normalizedPhone,
          success: true,
          channelId: channel.channel_id,
          channelName: channelLabel,
          error: null,
          providerMessageId: msgId,
          messageStatus: msgStatus,
          whapiFlagged: false,
        };
      } catch (err) {
        const msg = (err as Error).message;
        channelErrors.push(`[${channelLabel}][${provider}] ${msg}`);
        this.logger.warn(`❌ ${channelLabel} erreur pour ${recipient.name}: ${msg}`);
      }
    }

    const detailedError =
      channelErrors.length > 0
        ? `Tous les canaux ont échoué :\n${channelErrors.join('\n')}`
        : 'Aucun canal essayé';

    this.logger.error(detailedError);
    return {
      recipientName: recipient.name,
      recipientPhone: normalizedPhone,
      success: false,
      channelId: null,
      channelName: null,
      error: detailedError,
      providerMessageId: null,
      messageStatus: null,
      whapiFlagged: false,
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
