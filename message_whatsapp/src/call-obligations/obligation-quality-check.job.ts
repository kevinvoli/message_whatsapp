import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CronConfigService } from 'src/jorbs/cron-config.service';
import { CallObligationService } from './call-obligation.service';
import { NotificationService } from 'src/notification/notification.service';

/**
 * S6-004 — Contrôle qualité messages GICOP (périodique).
 * Vérifie, pour chaque poste avec un batch actif, que le commercial
 * a répondu au dernier message de chaque conversation active.
 * Résultat persisté dans CommercialObligationBatch.qualityCheckPassed.
 *
 * N10 — Alerting escalade : après le contrôle qualité, détecte les batches
 * bloqués depuis > 3 jours et émet une notification WARNING.
 * Anti-doublon en mémoire : un batch ne déclenche qu'une alerte par tranche de 24h.
 */
@Injectable()
export class ObligationQualityCheckJob implements OnModuleInit {
  private readonly logger = new Logger(ObligationQualityCheckJob.name);

  /**
   * Map batchId → timestamp de la dernière alerte émise.
   * Réinitialisée au redémarrage du process (suffisant : le job tourne toutes les heures max).
   */
  private readonly lastAlertAt = new Map<string, number>();

  constructor(
    private readonly cronConfigService: CronConfigService,
    private readonly obligationService: CallObligationService,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('obligation-quality-check', () =>
      this.run(),
    );
  }

  async run(): Promise<string> {
    if (!await this.obligationService.isEnabled()) return 'Obligations d\'appels désactivées — vérification ignorée';
    const posteIds = await this.obligationService.getActivePosteIds();
    if (posteIds.length === 0) return 'Aucun batch actif — rien à vérifier';

    let passed = 0;
    let failed = 0;
    for (const posteId of posteIds) {
      const ok = await this.obligationService.runQualityCheck(posteId);
      if (ok) passed++; else failed++;
    }

    const msg = `Contrôle qualité GICOP — ${passed} poste(s) OK, ${failed} poste(s) KO`;
    this.logger.log(msg);

    // N10 — Alerting batches bloqués depuis > 3 jours
    await this.alertStuckBatches();

    return msg;
  }

  private async alertStuckBatches(): Promise<void> {
    const stuckBatches = await this.obligationService.getStuckBatches(3);
    if (stuckBatches.length === 0) return;

    const now = Date.now();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    for (const batch of stuckBatches) {
      const lastAlert = this.lastAlertAt.get(batch.id);
      if (lastAlert !== undefined && now - lastAlert < twentyFourHoursMs) {
        this.logger.debug(
          `STUCK_BATCH_ALERT_SKIPPED batchId=${batch.id} posteId=${batch.posteId} — alerte déjà émise il y a moins de 24h`,
        );
        continue;
      }

      await this.notificationService.create(
        'alert',
        'Batch obligations bloqué',
        `Poste ${batch.posteId} — Batch #${batch.batchNumber} bloqué depuis > 3j (qualité KO). Vérifier les conversations actives.`,
      );

      this.lastAlertAt.set(batch.id, now);
      this.logger.warn(
        `STUCK_BATCH_ALERT_SENT batchId=${batch.id} posteId=${batch.posteId} batchNumber=${batch.batchNumber}`,
      );
    }
  }
}
