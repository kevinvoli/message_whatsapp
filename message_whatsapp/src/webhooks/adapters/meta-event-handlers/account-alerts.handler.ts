import { Injectable, Logger } from '@nestjs/common';
import { SystemAlertService } from 'src/system-alert/system-alert.service';
import { MetaAccountAlertEvent, MetaEventContext } from './meta-event.interface';

/**
 * P4.1.2 — Handler événement Meta `account_alerts`.
 *
 * Types Meta : PAYMENT_ISSUE, RATE_LIMIT_HIT, MESSAGING_LIMIT_CHANGE, NAME_UPDATE.
 */
@Injectable()
export class AccountAlertsHandler {
  private readonly logger = new Logger(AccountAlertsHandler.name);

  /** Alertes critiques → notification admin, les autres → log seulement */
  private readonly CRITICAL_TYPES = new Set(['PAYMENT_ISSUE', 'ACCOUNT_BANNED']);

  constructor(private readonly systemAlert: SystemAlertService) {}

  async handle(event: MetaAccountAlertEvent, ctx: MetaEventContext): Promise<void> {
    for (const alert of event.alerts ?? []) {
      const severity = this.CRITICAL_TYPES.has(alert.type) ? 'critical' : 'medium';
      this.logger.warn(
        `META_ACCOUNT_ALERT tenant=${ctx.tenantId} type=${alert.type} severity=${severity}`,
      );

      await this.systemAlert.onSecurityEvent({
        source: 'meta_account_alerts',
        tenantId: ctx.tenantId,
        channelId: ctx.channelId,
        message: `Alerte compte Meta — type: ${alert.type}${alert.message ? ` — ${alert.message}` : ''}`,
        severity,
      });
    }
  }
}
