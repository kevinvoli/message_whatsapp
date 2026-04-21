import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact, CertificationStatus, ClientCategory } from 'src/contact/entities/contact.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

// ── Payloads entrants depuis l'ERP ─────────────────────────────────────────

export interface OrderCreatedPayload {
  event: 'order_created';
  client_id: number;
  phone?: string;
  order_id: number;
  total_amount?: number;
  items?: unknown[];
  created_at?: string;
}

export interface OrderUpdatedPayload {
  event: 'order_updated' | 'order_cancelled';
  client_id: number;
  phone?: string;
  order_id: number;
  status?: string;
  updated_at?: string;
}

export interface ClientOrderSummaryPayload {
  event: 'client_order_summary_updated';
  client_id: number;
  phone?: string;
  summary: {
    total_orders?: number;
    total_amount?: number;
    last_order_at?: string;
    category?: string;
  };
}

export interface ClientCertificationPayload {
  event: 'client_certification_updated';
  client_id?: number;
  phone?: string;
  is_certified: boolean;
  certified_at?: string;
  certification_status?: string;
}

export interface ReferralUpdatedPayload {
  event: 'referral_updated';
  client_id?: number;
  phone?: string;
  referral_code?: string;
  referral_count?: number;
  referral_commission?: number;
}

export type InboundErpPayload =
  | OrderCreatedPayload
  | OrderUpdatedPayload
  | ClientOrderSummaryPayload
  | ClientCertificationPayload
  | ReferralUpdatedPayload;

@Injectable()
export class InboundIntegrationService {
  private readonly logger = new Logger(InboundIntegrationService.name);

  constructor(
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async handleErpEvent(payload: InboundErpPayload): Promise<{ processed: boolean; event: string }> {
    this.logger.log(`ERP event reçu : ${payload.event}`);

    switch (payload.event) {
      case 'order_created':
      case 'order_updated':
      case 'order_cancelled':
        await this.handleOrderEvent(payload as OrderCreatedPayload | OrderUpdatedPayload);
        break;
      case 'client_order_summary_updated':
        await this.handleOrderSummary(payload as ClientOrderSummaryPayload);
        break;
      case 'client_certification_updated':
        await this.handleCertification(payload as ClientCertificationPayload);
        break;
      case 'referral_updated':
        await this.handleReferral(payload as ReferralUpdatedPayload);
        break;
      default:
        this.logger.warn(`ERP event inconnu : ${(payload as Record<string, unknown>).event}`);
        return { processed: false, event: (payload as Record<string, unknown>).event as string };
    }

    return { processed: true, event: payload.event };
  }

  private async findContact(clientId?: number, phone?: string): Promise<Contact | null> {
    if (clientId) {
      const byId = await this.contactRepo.findOne({ where: { order_client_id: clientId } });
      if (byId) return byId;
    }
    if (phone) {
      const normalized = phone.replace(/\D/g, '');
      return this.contactRepo.findOne({ where: { phone: normalized } });
    }
    return null;
  }

  private async handleOrderEvent(payload: OrderCreatedPayload | OrderUpdatedPayload): Promise<void> {
    const contact = await this.findContact(payload.client_id, payload.phone);
    if (!contact) {
      this.logger.debug(`handleOrderEvent: contact introuvable (client_id=${payload.client_id})`);
      return;
    }
    if (!contact.order_client_id && payload.client_id) {
      contact.order_client_id = payload.client_id;
    }
    if (payload.event === 'order_created') {
      contact.client_category = ClientCategory.COMMANDE_SANS_LIVRAISON;
    }
    await this.contactRepo.save(contact);
  }

  private async handleOrderSummary(payload: ClientOrderSummaryPayload): Promise<void> {
    const contact = await this.findContact(payload.client_id, payload.phone);
    if (!contact) return;

    if (!contact.order_client_id && payload.client_id) {
      contact.order_client_id = payload.client_id;
    }

    contact.client_order_summary = payload.summary;

    const category = payload.summary.category;
    if (category) {
      const categoryMap: Record<string, ClientCategory> = {
        jamais_commande:         ClientCategory.JAMAIS_COMMANDE,
        commande_sans_livraison: ClientCategory.COMMANDE_SANS_LIVRAISON,
        commande_avec_livraison: ClientCategory.COMMANDE_AVEC_LIVRAISON,
        commande_annulee:        ClientCategory.COMMANDE_ANNULEE,
      };
      if (categoryMap[category]) contact.client_category = categoryMap[category];
    }

    await this.contactRepo.save(contact);
  }

  private async handleCertification(payload: ClientCertificationPayload): Promise<void> {
    const contact = await this.findContact(payload.client_id, payload.phone);
    if (!contact) {
      this.logger.debug(`handleCertification: contact introuvable`);
      return;
    }

    if (payload.certification_status) {
      const statusMap: Record<string, CertificationStatus> = {
        non_verifie: CertificationStatus.NON_VERIFIE,
        en_attente:  CertificationStatus.EN_ATTENTE,
        certifie:    CertificationStatus.CERTIFIE,
        rejete:      CertificationStatus.REJETE,
      };
      contact.certification_status = statusMap[payload.certification_status] ?? (
        payload.is_certified ? CertificationStatus.CERTIFIE : CertificationStatus.EN_ATTENTE
      );
    } else {
      contact.certification_status = payload.is_certified
        ? CertificationStatus.CERTIFIE
        : CertificationStatus.EN_ATTENTE;
    }

    if (payload.certified_at) {
      contact.certified_at = new Date(payload.certified_at);
    }

    await this.contactRepo.save(contact);
    this.logger.log(`Contact ${contact.id} certification → ${contact.certification_status}`);
    this.eventEmitter.emit('contact.updated', {
      contactId: contact.id,
      phone: contact.phone,
      changes: { certification_status: contact.certification_status, certified_at: contact.certified_at },
    });
  }

  private async handleReferral(payload: ReferralUpdatedPayload): Promise<void> {
    const contact = await this.findContact(payload.client_id, payload.phone);
    if (!contact) {
      this.logger.debug(`handleReferral: contact introuvable`);
      return;
    }

    if (payload.referral_code !== undefined) contact.referral_code = payload.referral_code;
    if (payload.referral_count !== undefined) contact.referral_count = payload.referral_count;
    if (payload.referral_commission !== undefined) contact.referral_commission = payload.referral_commission;

    await this.contactRepo.save(contact);
    this.logger.log(`Contact ${contact.id} parrainage → code=${contact.referral_code} count=${contact.referral_count}`);
    this.eventEmitter.emit('contact.updated', {
      contactId: contact.id,
      phone: contact.phone,
      changes: { referral_code: contact.referral_code, referral_count: contact.referral_count, referral_commission: contact.referral_commission },
    });
  }
}
