import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { ClientIdentityMapping } from './entities/client-identity-mapping.entity';
import { CommercialIdentityMapping } from './entities/commercial-identity-mapping.entity';

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export interface ErpEvent {
  event: string;
  timestamp: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  constructor(
    @InjectRepository(ClientIdentityMapping)
    private readonly clientMappingRepo: Repository<ClientIdentityMapping>,
    @InjectRepository(CommercialIdentityMapping)
    private readonly commercialMappingRepo: Repository<CommercialIdentityMapping>,
    private readonly config: ConfigService,
  ) {}

  // ─── Identity mapping — client ────────────────────────────────────────────

  async upsertClientMapping(
    contactId: string,
    externalId: number,
    phone?: string,
  ): Promise<ClientIdentityMapping> {
    let mapping = await this.clientMappingRepo.findOne({ where: { contact_id: contactId } });
    if (!mapping) {
      mapping = this.clientMappingRepo.create({
        contact_id: contactId,
        external_id: externalId,
        phone_normalized: phone ? normalizePhone(phone) : null,
      });
    } else {
      mapping.external_id = externalId;
      if (phone) mapping.phone_normalized = normalizePhone(phone);
    }
    return this.clientMappingRepo.save(mapping);
  }

  async resolveClientExternalId(contactId: string): Promise<number | null> {
    const m = await this.clientMappingRepo.findOne({ where: { contact_id: contactId } });
    return m?.external_id ?? null;
  }

  async resolveContactIdByPhone(phone: string): Promise<string | null> {
    const normalized = normalizePhone(phone);
    const m = await this.clientMappingRepo.findOne({ where: { phone_normalized: normalized } });
    return m?.contact_id ?? null;
  }

  async findAllClientMappings(): Promise<ClientIdentityMapping[]> {
    return this.clientMappingRepo.find({ order: { createdAt: 'DESC' } });
  }

  async deleteClientMapping(id: string): Promise<void> {
    await this.clientMappingRepo.delete(id);
  }

  // ─── Identity mapping — commercial ────────────────────────────────────────

  async upsertCommercialMapping(
    commercialId: string,
    externalId: number,
    name?: string,
  ): Promise<CommercialIdentityMapping> {
    let mapping = await this.commercialMappingRepo.findOne({
      where: { commercial_id: commercialId },
    });
    if (!mapping) {
      mapping = this.commercialMappingRepo.create({
        commercial_id: commercialId,
        external_id: externalId,
        commercial_name: name ?? null,
      });
    } else {
      mapping.external_id = externalId;
      if (name) mapping.commercial_name = name;
    }
    return this.commercialMappingRepo.save(mapping);
  }

  async resolveCommercialExternalId(commercialId: string): Promise<number | null> {
    const m = await this.commercialMappingRepo.findOne({
      where: { commercial_id: commercialId },
    });
    return m?.external_id ?? null;
  }

  async findAllCommercialMappings(): Promise<CommercialIdentityMapping[]> {
    return this.commercialMappingRepo.find({ order: { createdAt: 'DESC' } });
  }

  async deleteCommercialMapping(id: string): Promise<void> {
    await this.commercialMappingRepo.delete(id);
  }

  // ─── Envoi d'événements vers l'ERP ───────────────────────────────────────

  async dispatchToErp(event: ErpEvent): Promise<void> {
    const erpUrl = this.config.get<string>('INTEGRATION_ERP_URL');
    if (!erpUrl) return;

    const secret = this.config.get<string>('INTEGRATION_SECRET') ?? '';
    const body = JSON.stringify(event);
    const signature = secret
      ? createHmac('sha256', secret).update(body).digest('hex')
      : undefined;

    try {
      const res = await fetch(erpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(signature ? { 'x-signature': `sha256=${signature}` } : {}),
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        this.logger.warn(`ERP dispatch ${event.event} → HTTP ${res.status}`);
      } else {
        this.logger.debug(`ERP dispatch ${event.event} → OK`);
      }
    } catch (err) {
      this.logger.warn(`ERP dispatch ${event.event} failed: ${(err as Error).message}`);
    }
  }

  async dispatchLeadCreated(payload: {
    contactId: string;
    phone: string;
    name: string;
    source?: string;
    poste_id?: string;
  }): Promise<void> {
    const externalId = await this.resolveClientExternalId(payload.contactId);
    await this.dispatchToErp({
      event: 'lead_created',
      timestamp: new Date().toISOString(),
      contact_id: payload.contactId,
      external_client_id: externalId,
      phone: payload.phone,
      name: payload.name,
      source: payload.source ?? null,
      poste_id: payload.poste_id ?? null,
    });
  }

  async dispatchClientUpdated(payload: {
    contactId: string;
    phone?: string;
    changes: Record<string, unknown>;
  }): Promise<void> {
    const externalId = await this.resolveClientExternalId(payload.contactId);
    await this.dispatchToErp({
      event: 'client_updated',
      timestamp: new Date().toISOString(),
      contact_id: payload.contactId,
      external_client_id: externalId,
      phone: payload.phone ?? null,
      changes: payload.changes,
    });
  }

  async dispatchConversationStatusChanged(payload: {
    chatId: string;
    contactId?: string;
    oldStatus: string;
    newStatus: string;
    result?: string | null;
  }): Promise<void> {
    const externalId = payload.contactId
      ? await this.resolveClientExternalId(payload.contactId)
      : null;
    await this.dispatchToErp({
      event: 'conversation_status_changed',
      timestamp: new Date().toISOString(),
      chat_id: payload.chatId,
      external_client_id: externalId,
      old_status: payload.oldStatus,
      new_status: payload.newStatus,
      result: payload.result ?? null,
    });
  }

  async dispatchFollowUpCreated(payload: {
    followUpId: string;
    contactId: string;
    commercialId: string;
    scheduledAt: Date;
    notes?: string;
  }): Promise<void> {
    const [clientExtId, commercialExtId] = await Promise.all([
      this.resolveClientExternalId(payload.contactId),
      this.resolveCommercialExternalId(payload.commercialId),
    ]);
    await this.dispatchToErp({
      event: 'follow_up.created',
      timestamp: new Date().toISOString(),
      follow_up_id: payload.followUpId,
      external_client_id: clientExtId,
      external_commercial_id: commercialExtId,
      scheduled_at: payload.scheduledAt.toISOString(),
      notes: payload.notes ?? null,
    });
  }

  async dispatchFollowUpCompleted(payload: {
    followUpId: string;
    contactId: string;
    commercialId: string;
    outcome?: string;
    completedAt: Date;
  }): Promise<void> {
    const [clientExtId, commercialExtId] = await Promise.all([
      this.resolveClientExternalId(payload.contactId),
      this.resolveCommercialExternalId(payload.commercialId),
    ]);
    await this.dispatchToErp({
      event: 'follow_up.completed',
      timestamp: new Date().toISOString(),
      follow_up_id: payload.followUpId,
      external_client_id: clientExtId,
      external_commercial_id: commercialExtId,
      outcome: payload.outcome ?? null,
      completed_at: payload.completedAt.toISOString(),
    });
  }
}
