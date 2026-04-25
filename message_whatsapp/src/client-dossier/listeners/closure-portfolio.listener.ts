import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ClientDossierService } from '../client-dossier.service';

interface ConversationClosedPayload {
  chatId:             string;
  commercialId:       string | null;
  posteId:            string | null;
  conversationResult: string | null;
  closedAt:           Date;
}

/**
 * À la clôture d'une conversation, assigne le contact au portefeuille
 * du commercial et notifie la plateforme GICOP.
 */
@Injectable()
export class ClosurePortfolioListener {
  private readonly logger = new Logger(ClosurePortfolioListener.name);

  constructor(private readonly dossierService: ClientDossierService) {}

  @OnEvent('conversation.closed', { async: true })
  async handle(payload: ConversationClosedPayload): Promise<void> {
    if (!payload.commercialId) {
      this.logger.warn(`closure-portfolio: commercialId absent pour chat=${payload.chatId} — skip`);
      return;
    }

    try {
      await this.dossierService.assignToPortfolio(
        payload.chatId,
        payload.commercialId,
        payload.posteId ?? '',
      );
    } catch (err) {
      this.logger.error(
        `closure-portfolio: erreur assignToPortfolio chat=${payload.chatId}: ${(err as Error).message}`,
      );
    }
  }
}
