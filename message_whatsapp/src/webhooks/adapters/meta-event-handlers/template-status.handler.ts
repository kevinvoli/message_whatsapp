import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MetaEventContext, MetaTemplateStatusEvent } from './meta-event.interface';

export const META_TEMPLATE_STATUS_EVENT = 'meta.template.status_update';

/**
 * P4.1.3 — Handler événement Meta `message_template_status_update`.
 *
 * Émis quand Meta change le statut d'un template : APPROVED, REJECTED, PAUSED.
 * Émet un événement interne pour que WhatsappTemplateService puisse réagir
 * (P4.2 — module templates) sans dépendance circulaire.
 */
@Injectable()
export class TemplateStatusHandler {
  private readonly logger = new Logger(TemplateStatusHandler.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  handle(event: MetaTemplateStatusEvent, ctx: MetaEventContext): void {
    this.logger.log(
      `TEMPLATE_STATUS_UPDATE tenant=${ctx.tenantId} template=${event.messageTemplateName} ` +
        `id=${event.messageTemplateId} status=${event.event}` +
        (event.reason ? ` reason=${event.reason}` : ''),
    );

    this.eventEmitter.emit(META_TEMPLATE_STATUS_EVENT, {
      tenantId: ctx.tenantId,
      channelId: ctx.channelId,
      metaTemplateId: event.messageTemplateId,
      templateName: event.messageTemplateName,
      language: event.messageTemplateLanguage,
      newStatus: event.event,
      reason: event.reason ?? null,
    });
  }
}
