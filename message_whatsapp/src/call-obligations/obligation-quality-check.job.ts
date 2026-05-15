import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CronConfigService } from 'src/jorbs/cron-config.service';
import { CallObligationService } from './call-obligation.service';
import { NotificationService } from 'src/notification/notification.service';
import { CommercialObligationBatch } from './entities/commercial-obligation-batch.entity';

/**
 * S6-004 — Contrôle qualité messages GICOP (périodique).
 * N10 — Alerting escalade : batches bloqués depuis > 3 jours.
 * FIX-H6: Anti-doublon persisté en DB (last_alert_at) — résistant aux redémarrages.
 */
@Injectable()
export class ObligationQualityCheckJob implements OnModuleInit {
  private readonly logger = new Logger(ObligationQualityCheckJob.name);

  constructor(
    private readonly cronConfigService: CronConfigService,
    private readonly obligationService: CallObligationService,
    private readonly notificationService: NotificationService,
    @InjectRepository(CommercialObligationBatch)
    private readonly batchRepo: Repository<CommercialObligationBatch>,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('obligation-quality-check', () =>
      this.run(),
    );
  }

  async run(): Promise<string> {
    if (!await this.obligationService.isEnabled()) return "Obligations d'appels désactivées — vérification ignorée";
    const posteIds = await this.obligationService.getActivePosteIds();
    if (posteIds.length === 0) return 'Aucun batch actif — rien à vérifier';

    let passed = 0;
    let failed = 0;
    for (const posteId of posteIds) {
      const ok = await this.obligationService.runQualityCheck(posteId);
      if (ok) passed++; else failed++;
    }

    const msg = 'Contrôle qualité GICOP — ' + passed + ' poste(s) OK, ' + failed + ' poste(s) KO';
    this.logger.log(msg);

    // N10 — Alerting batches bloqués depuis > 3 jours
    await this.alertStuckBatches();

    return msg;
  }

  private async alertStuckBatches(): Promise<void> {
    const stuckBatches = await this.obligationService.getStuckBatches(3);
    if (stuckBatches.length === 0) return;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const batch of stuckBatches) {
      // FIX-H6: Vérifier la dernière alerte en DB (résistant aux redémarrages)
      const lastAlert = batch.lastAlertAt;
      if (lastAlert && lastAlert > oneDayAgo) {
        this.logger.debug(
          'STUCK_BATCH_ALERT_SKIPPED batchId=' + batch.id + ' — alerte envoyee il y a moins de 24h (persiste en DB)',
        );
        continue;
      }

      await this.notificationService.create(
        'alert',
        'Batch obligations bloqué',
        'Poste ' + batch.posteId + ' — Batch #' + batch.batchNumber + ' bloqué depuis > 3j (qualité KO). Vérifier les conversations actives.',
      );

      // FIX-H6: Persister la date d'alerte en DB
      await this.batchRepo.update(batch.id, { lastAlertAt: new Date() });
      this.logger.warn(
        'STUCK_BATCH_ALERT_SENT batchId=' + batch.id + ' posteId=' + batch.posteId + ' batchNumber=' + batch.batchNumber,
      );
    }
  }
}