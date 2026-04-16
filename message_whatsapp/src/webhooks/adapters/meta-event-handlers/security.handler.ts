import { Injectable, Logger } from '@nestjs/common';
import { SystemAlertService } from 'src/system-alert/system-alert.service';
import { MetaEventContext, MetaSecurityEvent } from './meta-event.interface';

/**
 * P4.1.1 — Handler événement Meta `security`.
 *
 * Déclenché quand Meta détecte une activité de sécurité suspecte
 * sur le compte : token révoqué, IP suspecte, etc.
 */
@Injectable()
export class SecurityEventHandler {
  private readonly logger = new Logger(SecurityEventHandler.name);

  constructor(private readonly systemAlert: SystemAlertService) {}

  async handle(event: MetaSecurityEvent, ctx: MetaEventContext): Promise<void> {
    this.logger.warn(
      `META_SECURITY tenant=${ctx.tenantId} channel=${ctx.channelId} data=${JSON.stringify(event.data)}`,
    );

    // Déclencher une alerte admin via le service d'alertes existant
    await this.systemAlert.onSecurityEvent({
      source: 'meta_webhook',
      tenantId: ctx.tenantId,
      channelId: ctx.channelId,
      message: `Événement de sécurité Meta reçu : ${JSON.stringify(event.data)}`,
      severity: 'high',
    });
  }
}
