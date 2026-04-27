import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CronConfigService } from 'src/jorbs/cron-config.service';
import { CallObligationService } from './call-obligation.service';

/**
 * S6-004 — Contrôle qualité messages GICOP (périodique).
 * Vérifie, pour chaque poste avec un batch actif, que le commercial
 * a répondu au dernier message de chaque conversation active.
 * Résultat persisté dans CommercialObligationBatch.qualityCheckPassed.
 */
@Injectable()
export class ObligationQualityCheckJob implements OnModuleInit {
  private readonly logger = new Logger(ObligationQualityCheckJob.name);

  constructor(
    private readonly cronConfigService: CronConfigService,
    private readonly obligationService: CallObligationService,
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
    return msg;
  }
}
