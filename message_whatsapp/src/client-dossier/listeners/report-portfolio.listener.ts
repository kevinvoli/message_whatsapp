import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ClientDossierService } from '../client-dossier.service';

interface ReportSubmittedPayload {
  chatId:       string;
  commercialId: string;
  posteId:      string | null;
}

/**
 * À la soumission d'un rapport GICOP, assigne le contact au portefeuille
 * du commercial et notifie la plateforme GICOP — sans attendre la sync DB2.
 */
@Injectable()
export class ReportPortfolioListener {
  private readonly logger = new Logger(ReportPortfolioListener.name);

  constructor(private readonly dossierService: ClientDossierService) {}

  @OnEvent('conversation.report.submitted', { async: true })
  async handle(payload: ReportSubmittedPayload): Promise<void> {
    try {
      await this.dossierService.assignToPortfolio(
        payload.chatId,
        payload.commercialId,
        payload.posteId ?? '',
      );
    } catch (err) {
      this.logger.error(
        `report-portfolio: erreur assignToPortfolio chat=${payload.chatId}: ${(err as Error).message}`,
      );
    }
  }
}
