import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IntegrationOutboxService } from 'src/integration-outbox/integration-outbox.service';
import { NotificationService } from 'src/notification/notification.service';

const STALE_PENDING_MINUTES = 10;
const FAILED_ALERT_THRESHOLD = 5;

@Injectable()
export class OutboxAlertService {
  private readonly logger = new Logger(OutboxAlertService.name);

  private lastStalePendingAlert = 0;
  private lastFailedAlert       = 0;
  private readonly alertCooldownMs = 30 * 60_000; // 30 min entre deux alertes identiques

  constructor(
    private readonly outboxService: IntegrationOutboxService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  @Cron('*/5 * * * *')
  async checkOutboxHealth(): Promise<void> {
    try {
      const [stats, stalePending] = await Promise.all([
        this.outboxService.getStats(),
        this.outboxService.getStalePendingCount(STALE_PENDING_MINUTES),
      ]);

      const now = Date.now();

      if (stalePending > 0 && now - this.lastStalePendingAlert > this.alertCooldownMs) {
        this.lastStalePendingAlert = now;
        const msg = `${stalePending} entrée(s) outbox en attente depuis plus de ${STALE_PENDING_MINUTES} min — DB2 peut-être indisponible.`;
        this.logger.warn(`OUTBOX_ALERT stale_pending=${stalePending}`);
        await this.notify('alert', 'Outbox — synchronisation DB2 bloquée', msg);
      }

      if (stats.failed >= FAILED_ALERT_THRESHOLD && now - this.lastFailedAlert > this.alertCooldownMs) {
        this.lastFailedAlert = now;
        const msg = `${stats.failed} rapport(s) en échec de synchronisation DB2. Vérifiez la connexion et les logs.`;
        this.logger.warn(`OUTBOX_ALERT failed_count=${stats.failed}`);
        await this.notify('alert', 'Outbox — rapports en échec DB2', msg);
      }
    } catch (err) {
      this.logger.error(`Erreur vérification santé outbox: ${(err as Error).message}`);
    }
  }

  private async notify(type: 'alert' | 'info', title: string, message: string): Promise<void> {
    if (!this.notificationService) return;
    await this.notificationService.create(type, title, message).catch(() => undefined);
  }
}
