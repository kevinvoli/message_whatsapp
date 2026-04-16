import { Injectable, Logger } from '@nestjs/common';
import { SecurityEventHandler } from './security.handler';
import { AccountAlertsHandler } from './account-alerts.handler';
import { TemplateStatusHandler } from './template-status.handler';
import { AccountUpdateHandler } from './account-update.handler';
import { MetaEventContext } from './meta-event.interface';
import { MetaWebhookPayload } from 'src/whapi/interface/whatsapp-whebhook.interface';

/**
 * P4.1.8 — Router/Registre des handlers Meta non-message.
 *
 * Reçoit un payload Meta complet et route chaque `change.field` vers
 * son handler dédié. Appelé depuis UnifiedIngressService/WhapiService
 * après extraction des messages/statuses normaux.
 */
@Injectable()
export class MetaNonMessageHandler {
  private readonly logger = new Logger(MetaNonMessageHandler.name);

  constructor(
    private readonly securityHandler: SecurityEventHandler,
    private readonly accountAlertsHandler: AccountAlertsHandler,
    private readonly templateStatusHandler: TemplateStatusHandler,
    private readonly accountUpdateHandler: AccountUpdateHandler,
  ) {}

  async handle(payload: MetaWebhookPayload, ctx: MetaEventContext): Promise<void> {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const field = change.field;
        const value = change.value as any;

        try {
          await this.routeField(field, value, ctx);
        } catch (err) {
          // Non-fatal : ne pas bloquer le pipeline pour les événements non-message
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `META_HANDLER_ERROR field=${field} tenant=${ctx.tenantId}: ${message}`,
          );
        }
      }
    }
  }

  private async routeField(
    field: string,
    value: unknown,
    ctx: MetaEventContext,
  ): Promise<void> {
    switch (field) {
      case 'security':
        await this.securityHandler.handle(
          { type: 'security', data: (value as any) ?? {} },
          ctx,
        );
        break;

      case 'account_alerts':
        await this.accountAlertsHandler.handle(
          { type: 'account_alerts', alerts: (value as any)?.alerts ?? [] },
          ctx,
        );
        break;

      case 'message_template_status_update':
        this.templateStatusHandler.handle(value as any, ctx);
        break;

      case 'account_update':
        await this.accountUpdateHandler.handle(value as any, ctx);
        break;

      case 'messaging_handovers':
      case 'flows':
      case 'history':
      case 'user_preferences':
      case 'account_review_update':
        this.logger.log(
          `META_EVENT_LOGGED field=${field} tenant=${ctx.tenantId} — traitement minimal (log only)`,
        );
        break;

      case 'messages':
        // Traité par MetaAdapter.normalizeMessages — ignoré ici
        break;

      default:
        this.logger.debug(
          `META_EVENT_UNKNOWN field=${field} tenant=${ctx.tenantId} — ignoré`,
        );
    }
  }
}
