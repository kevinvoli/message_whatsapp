import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { OutboundRouterService } from 'src/communication_whapi/outbound-router.service';
import { Server } from 'socket.io';

export interface AlertRecipient {
  phone: string; // format international sans + ex: 213556056396
  name: string;
}

export interface AlertConfig {
  enabled: boolean;
  silenceThresholdMinutes: number;
  retryAfterMinutes: number;
  recipients: AlertRecipient[];
}

@Injectable()
export class SystemAlertService {
  private readonly logger = new Logger(SystemAlertService.name);

  /** Timestamp du dernier message client entrant */
  private lastInboundAt: number = Date.now();

  /** Timer principal — déclenche l'alerte si aucun message dans le délai */
  private silenceTimer: NodeJS.Timeout | null = null;

  /** Timer de retry — planifié si tous les canaux ont échoué */
  private retryTimer: NodeJS.Timeout | null = null;

  /** Référence au server Socket.io pour notifier le panel admin */
  private io: Server | null = null;

  /** Config en mémoire — modifiable via API admin sans redémarrage */
  private config: AlertConfig = {
    enabled: true,
    silenceThresholdMinutes: 10,
    retryAfterMinutes: 15,
    recipients: [
      { phone: '2250556056396', name: 'Mr Voli' },
      { phone: '2250748905150', name: 'Mr AKA' },
    ],
  };

  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,
    private readonly outboundRouter: OutboundRouterService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Appelé par la gateway Socket.io au démarrage
  // ─────────────────────────────────────────────────────────────────────────

  setSocketServer(io: Server): void {
    this.io = io;
    // Démarrer le timer dès le boot du serveur
    this.resetTimer();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Appelé à chaque message entrant du client
  // ─────────────────────────────────────────────────────────────────────────

  onInboundMessage(): void {
    this.lastInboundAt = Date.now();

    // Annuler un éventuel retry en cours — le système est vivant
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
      this.logger.log('Alerte annulée — système rétabli (nouveau message entrant)');
    }

    // Notifier le panel admin que le système est OK
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

    // Notifier le panel admin via Socket.io
    this.emitAdminStatus(true, silenceMin);

    // Envoyer les alertes WhatsApp
    const sent = await this.sendAlertsToAll(silenceMin);

    if (!sent) {
      // Tous les canaux ont échoué — planifier un retry
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.triggerAlert();
      }, this.config.retryAfterMinutes * 60 * 1000);
      this.logger.warn(
        `Retry planifié dans ${this.config.retryAfterMinutes} min`,
      );
    }

    // Reprendre le timer pour la prochaine vérification
    this.resetTimer();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Envoi WhatsApp avec fallback sur les canaux
  // ─────────────────────────────────────────────────────────────────────────

  private async sendAlertsToAll(silenceMin: number): Promise<boolean> {
    const channels = await this.channelRepo.find();
    if (!channels.length) {
      this.logger.error('Aucun canal disponible pour envoyer les alertes');
      return false;
    }

    let allSent = true;
    for (const recipient of this.config.recipients) {
      const sent = await this.sendWithFallback(channels, recipient, silenceMin);
      if (!sent) allSent = false;
    }
    return allSent;
  }

  private async sendWithFallback(
    channels: WhapiChannel[],
    recipient: AlertRecipient,
    silenceMin: number,
  ): Promise<boolean> {
    const to = `${recipient.phone}@s.whatsapp.net`;
    const text =
      `🚨 *ALERTE SYSTÈME* — Aucun message entrant depuis *${silenceMin} minutes*.\n` +
      `Le serveur WhatsApp est peut-être hors ligne. Vérifiez immédiatement.`;

    for (const channel of channels) {
      try {
        await this.outboundRouter.sendTextMessage({
          text,
          to,
          channelId: channel.channel_id,
        });
        this.logger.log(
          `Alerte envoyée à ${recipient.name} via canal ${channel.channel_id}`,
        );
        return true;
      } catch (err) {
        this.logger.warn(
          `Canal ${channel.channel_id} échoué pour ${recipient.name}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.error(
      `Tous les canaux ont échoué pour ${recipient.name} (${recipient.phone})`,
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
    return { ...this.config };
  }

  updateConfig(patch: Partial<AlertConfig>): AlertConfig {
    this.config = { ...this.config, ...patch };
    // Réinitialiser le timer avec le nouveau seuil
    this.resetTimer();
    return this.getConfig();
  }

  getStatus(): { alerting: boolean; silenceMinutes: number; lastInboundAt: string } {
    const silenceMin = Math.floor((Date.now() - this.lastInboundAt) / 60_000);
    return {
      alerting: silenceMin >= this.config.silenceThresholdMinutes,
      silenceMinutes: silenceMin,
      lastInboundAt: new Date(this.lastInboundAt).toISOString(),
    };
  }
}
