import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InboundIntegrationService } from 'src/inbound-integration/inbound-integration.service';
import { CallEventService } from 'src/window/services/call-event.service';
import { CallObligationService } from 'src/call-obligations/call-obligation.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { GicopMessage } from './dto/gicop-webhook.dto';

export interface DirectCallEventDto {
  external_id: string;
  event_at: string;
  client_phone: string;
  commercial_phone: string;
  commercial_email?: string | null;
  call_status: string;
  duration_seconds?: number | null;
  recording_url?: string | null;
}

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

    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,

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

  /**
   * Point d'entrée direct pour les appels — format simplifié sans enveloppe Whapi.
   * Résout le commercial par phone en priorité, puis par email en fallback.
   */
  async receiveDirectCallEvent(dto: DirectCallEventDto): Promise<{ processed: boolean; reason?: string }> {
    try {
      // Résolution commercial_id
      let commercial: WhatsappCommercial | null = null;
      if (dto.commercial_phone) {
        const norm = dto.commercial_phone.replace(/\D/g, '');
        commercial = await this.commercialRepo
          .createQueryBuilder('c')
          .where('c.phone LIKE :phone', { phone: `%${norm.slice(-8)}` })
          .andWhere('c.deletedAt IS NULL')
          .getOne();
      }
      if (!commercial && dto.commercial_email) {
        commercial = await this.commercialRepo.findOne({
          where: { email: dto.commercial_email },
        });
      }

      const callEvent = await this.callEventService.receiveCallEvent({
        external_id:      dto.external_id,
        event_at:         dto.event_at,
        commercial_phone: dto.commercial_phone,
        commercial_email: dto.commercial_email ?? null,
        client_phone:     dto.client_phone,
        call_status:      dto.call_status,
        duration_seconds: dto.duration_seconds ?? null,
        recording_url:    dto.recording_url ?? null,
        commercial_id:    commercial?.id ?? null,
      });

      if (this.obligationService && commercial) {
        const poste = await this.commercialRepo
          .createQueryBuilder('c')
          .leftJoinAndSelect('c.poste', 'p')
          .where('c.id = :id', { id: commercial.id })
          .getOne();

        await this.obligationService.tryMatchCallToTask({
          clientPhone: dto.client_phone,
          commercialPhone: dto.commercial_phone,
          callEventId: callEvent.id,
          durationSeconds: dto.duration_seconds ?? null,
          posteId: poste?.poste?.id ?? null,
        });
      }

      return { processed: true };
    } catch (err) {
      const msg = (err as Error).message;
      if (msg?.includes('déjà traité') || msg?.includes('Conflict')) {
        return { processed: true, reason: 'duplicate' };
      }
      this.logger.error(`DirectCallEvent error id=${dto.external_id} — ${msg}`);
      return { processed: false, reason: msg };
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
