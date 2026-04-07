import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { OutboundRouterService } from 'src/communication_whapi/outbound-router.service';
import { Server } from 'socket.io';
import {
  AlertRecipient,
  SystemAlertConfig,
} from './entities/system-alert-config.entity';

export { AlertRecipient };

export interface AlertConfig {
  enabled: boolean;
  silenceThresholdMinutes: number;
  retryAfterMinutes: number;
  recipients: AlertRecipient[];
  /**
   * Modèle du message. Placeholder : {silenceMin}
   * Valeur par défaut si null : message système standard.
   */
  messageTemplate: string | null;
}

const DEFAULT_MESSAGE_TEMPLATE =
  '🚨 *ALERTE SYSTÈME* — Aucun message entrant depuis *{silenceMin} minutes*.\n' +
  'Le serveur WhatsApp est peut-être hors ligne. Vérifiez immédiatement.';

/** ID de la ligne singleton en BDD */
const CONFIG_ROW_ID = 1;

@Injectable()
export class SystemAlertService implements OnModuleInit {
  private readonly logger = new Logger(SystemAlertService.name);

  /** Timestamp du dernier message client entrant */
  private lastInboundAt: number = Date.now();

  /** Timer principal — déclenche l'alerte si aucun message dans le délai */
  private silenceTimer: NodeJS.Timeout | null = null;

  /** Timer de retry — planifié si tous les canaux ont échoué */
  private retryTimer: NodeJS.Timeout | null = null;

  /** Référence au server Socket.io pour notifier le panel admin */
  private io: Server | null = null;

  /** Config chargée depuis la BDD (en cache mémoire) */
  private config: AlertConfig = {
    enabled: true,
    silenceThresholdMinutes: 60,
    retryAfterMinutes: 15,
    recipients: [],
    messageTemplate: null,
  };

  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,
    @InjectRepository(SystemAlertConfig)
    private readonly configRepo: Repository<SystemAlertConfig>,
    private readonly outboundRouter: OutboundRouterService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadConfigFromDb();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Chargement / persistance BDD
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
        };
        this.logger.log(
          `Config alerte chargée depuis BDD — seuil: ${this.config.silenceThresholdMinutes} min, ` +
          `${this.config.recipients.length} destinataire(s)`,
        );
      } else {
        // Première exécution : créer la ligne singleton
        await this.configRepo.save({
          id: CONFIG_ROW_ID,
          enabled: this.config.enabled,
          silenceThresholdMinutes: this.config.silenceThresholdMinutes,
          retryAfterMinutes: this.config.retryAfterMinutes,
          recipients: this.config.recipients,
          messageTemplate: this.config.messageTemplate,
        });
        this.logger.warn('Ligne config alerte créée en BDD (première exécution)');
      }
    } catch (err) {
      this.logger.error(
        `Impossible de charger la config alerte depuis la BDD: ${(err as Error).message} — utilisation des valeurs par défaut`,
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
      });
    } catch (err) {
      this.logger.error(
        `Erreur lors de la sauvegarde de la config alerte: ${(err as Error).message}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Appelé par la gateway Socket.io au démarrage
  // ─────────────────────────────────────────────────────────────────────────

  setSocketServer(io: Server): void {
    this.io = io;
    this.resetTimer();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Appelé à chaque message entrant du client
  // ─────────────────────────────────────────────────────────────────────────

  onInboundMessage(): void {
    this.lastInboundAt = Date.now();

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
      this.logger.log('Alerte annulée — système rétabli (nouveau message entrant)');
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
    this.logger.warn(
      `HEALTH_ALERT — aucun message entrant depuis ${silenceMin} min`,
    );

    this.emitAdminStatus(true, silenceMin);

    const sent = await this.sendAlertsToAll(silenceMin);

    if (!sent) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.triggerAlert();
      }, this.config.retryAfterMinutes * 60 * 1000);
      this.logger.warn(
        `Retry planifié dans ${this.config.retryAfterMinutes} min`,
      );
    }

    this.resetTimer();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Envoi WhatsApp avec fallback sur les canaux
  // ─────────────────────────────────────────────────────────────────────────

  private buildMessage(silenceMin: number): string {
    const template = this.config.messageTemplate ?? DEFAULT_MESSAGE_TEMPLATE;
    return template.replace(/\{silenceMin\}/g, String(silenceMin));
  }

  /** Normalise un numéro de téléphone en format international sans + ni 00 */
  static normalizePhone(raw: string): string {
    let phone = raw.trim().replace(/\s/g, '');
    if (phone.startsWith('+')) phone = phone.slice(1);
    if (phone.startsWith('00')) phone = phone.slice(2);
    return phone;
  }

  private async sendAlertsToAll(silenceMin: number): Promise<boolean> {
    if (this.config.recipients.length === 0) {
      this.logger.warn('Aucun destinataire configuré pour les alertes système');
      return true; // Ne pas planifier de retry si pas de destinataires
    }

    const channels = await this.channelRepo.find();
    if (!channels.length) {
      this.logger.error('Aucun canal disponible pour envoyer les alertes');
      return false;
    }

    const text = this.buildMessage(silenceMin);

    let allSent = true;
    for (const recipient of this.config.recipients) {
      const sent = await this.sendWithFallback(channels, recipient, text);
      if (!sent) allSent = false;
    }
    return allSent;
  }

  private async sendWithFallback(
    channels: WhapiChannel[],
    recipient: AlertRecipient,
    text: string,
  ): Promise<boolean> {
    const normalizedPhone = SystemAlertService.normalizePhone(recipient.phone);
    const to = `${normalizedPhone}@s.whatsapp.net`;

    for (const channel of channels) {
      try {
        await this.outboundRouter.sendTextMessage({
          text,
          to,
          channelId: channel.channel_id,
        });
        this.logger.log(
          `Alerte envoyée à ${recipient.name} (${normalizedPhone}) via canal ${channel.channel_id}`,
        );
        return true;
      } catch (err) {
        this.logger.warn(
          `Canal ${channel.channel_id} échoué pour ${recipient.name}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.error(
      `Tous les canaux ont échoué pour ${recipient.name} (${normalizedPhone})`,
    );
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Notification Socket.io → panel admin
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
    // Normaliser les numéros à la sauvegarde
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

  getStatus(): { alerting: boolean; silenceMinutes: number; lastInboundAt: string } {
    const silenceMin = Math.floor((Date.now() - this.lastInboundAt) / 60_000);
    return {
      alerting: this.config.enabled && silenceMin >= this.config.silenceThresholdMinutes,
      silenceMinutes: silenceMin,
      lastInboundAt: new Date(this.lastInboundAt).toISOString(),
    };
  }

  getDefaultMessageTemplate(): string {
    return DEFAULT_MESSAGE_TEMPLATE;
  }
}
