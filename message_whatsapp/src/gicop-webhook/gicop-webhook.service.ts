import { Injectable, Logger, Optional } from '@nestjs/common';
import { InboundIntegrationService } from 'src/inbound-integration/inbound-integration.service';
import { CallEventService } from 'src/window/services/call-event.service';
import { CallObligationService } from 'src/call-obligations/call-obligation.service';
import { GicopMessage } from './dto/gicop-webhook.dto';

export interface GicopProcessResult {
  id: string;
  type: string;
  processed: boolean;
  reason?: string;
}

@Injectable()
export class GicopWebhookService {
  private readonly logger = new Logger(GicopWebhookService.name);

  constructor(
    private readonly erpService: InboundIntegrationService,
    private readonly callEventService: CallEventService,

    @Optional()
    private readonly obligationService: CallObligationService,
  ) {}

  async processMessages(messages: GicopMessage[]): Promise<GicopProcessResult[]> {
    const results: GicopProcessResult[] = [];

    for (const msg of messages) {
      const result = await this.processOne(msg);
      results.push(result);
    }

    return results;
  }

  private async processOne(msg: GicopMessage): Promise<GicopProcessResult> {
    try {
      switch (msg.type) {
        // ── Événements commandes ERP ────────────────────────────────────────
        case 'order_created':
        case 'order_updated':
        case 'order_cancelled':
        case 'client_order_summary_updated':
        case 'client_certification_updated':
        case 'referral_updated': {
          const erp = await this.erpService.handleErpEvent({
            event: msg.type as any,
            ...this.extractErpFields(msg),
          });
          this.logger.log(`GICOP erp/${msg.type} id=${msg.id} processed=${erp.processed}`);
          return { id: msg.id, type: msg.type, processed: erp.processed };
        }

        // ── Notification d'appel téléphonique ──────────────────────────────
        case 'call_event': {
          const d = msg.data as Record<string, unknown>;
          const clientPhone  = String(d.client_phone  ?? msg.from ?? '');
          const commercialPhone = String(d.commercial_phone ?? d.from ?? '');
          const durationSeconds = d.duration_seconds != null ? Number(d.duration_seconds) : null;

          const callEvent = await this.callEventService.receiveCallEvent({
            external_id: msg.id,
            event_at: new Date((msg.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
            commercial_phone: commercialPhone,
            client_phone: clientPhone,
            call_status: String(d.call_status ?? 'unknown'),
            duration_seconds: durationSeconds,
            recording_url: d.recording_url != null ? String(d.recording_url) : null,
            order_id: d.order_id != null ? String(d.order_id) : null,
          });

          // Tentative de correspondance avec une tâche d'obligation GICOP
          // Le poste est résolu automatiquement via commercial_phone → WhatsappCommercial
          if (this.obligationService) {
            const match = await this.obligationService.tryMatchCallToTask({
              clientPhone,
              commercialPhone,
              callEventId: callEvent.id,
              durationSeconds,
              posteId: null, // résolu en interne via commercialPhone
            });
            this.logger.log(
              `GICOP call_event id=${msg.id} — obligation: ${match.matched ? `OUI (tâche ${match.taskId})` : `NON (${match.reason})`}`,
            );
          }

          return { id: msg.id, type: msg.type, processed: true };
        }

        // ── Expédition (Sprint 7 — à implémenter) ─────────────────────────
        case 'shipment_code_created': {
          this.logger.warn(`GICOP shipment_code_created id=${msg.id} — non implémenté (Sprint 7)`);
          return { id: msg.id, type: msg.type, processed: false, reason: 'not_implemented' };
        }

        default: {
          this.logger.warn(`GICOP type inconnu "${msg.type}" id=${msg.id}`);
          return { id: msg.id, type: msg.type, processed: false, reason: 'unknown_type' };
        }
      }
    } catch (err) {
      const message = (err as Error).message;
      // Idempotence : un doublon n'est pas une erreur
      if (message?.includes('déjà traité') || message?.includes('Conflict')) {
        return { id: msg.id, type: msg.type, processed: true, reason: 'duplicate' };
      }
      this.logger.error(`GICOP erreur type=${msg.type} id=${msg.id} — ${message}`);
      return { id: msg.id, type: msg.type, processed: false, reason: message };
    }
  }

  private extractErpFields(msg: GicopMessage): Record<string, unknown> {
    const d = msg.data as Record<string, unknown>;
    return {
      client_id: d.client_id ?? null,
      phone: d.phone ?? msg.from ?? null,
      order_id: d.order_id ?? null,
      total_amount: d.total_amount ?? null,
      items: d.items ?? null,
      status: d.status ?? null,
      updated_at: d.updated_at ?? null,
      created_at: d.created_at ?? null,
      summary: d.summary ?? null,
      is_certified: d.is_certified ?? null,
      certified_at: d.certified_at ?? null,
      certification_status: d.certification_status ?? null,
      referral_code: d.referral_code ?? null,
      referral_count: d.referral_count ?? null,
      referral_commission: d.referral_commission ?? null,
    };
  }
}
