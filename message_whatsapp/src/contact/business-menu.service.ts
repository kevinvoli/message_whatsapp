import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ORDER_DB_AVAILABLE } from 'src/order-db/order-db.constants';
import { OrderSegmentationReadService } from 'src/order-read/services/order-segmentation-read.service';
import { CommercialIdentityMapping } from 'src/integration/entities/commercial-identity-mapping.entity';
import { Contact } from './entities/contact.entity';
import { ContactService } from './contact.service';

export interface BusinessMenuContact {
  id:              string | null;   // contact_id DB1 (null si mapping absent)
  name:            string;
  phone:           string;
  chat_id?:        string | null;
  client_category?: string | null;
  last_message_date?: string | null;
}

@Injectable()
export class BusinessMenuService {
  private readonly logger = new Logger(BusinessMenuService.name);

  constructor(
    @Inject(ORDER_DB_AVAILABLE)
    private readonly dbAvailable: boolean,

    private readonly segmentation: OrderSegmentationReadService,
    private readonly contactService: ContactService,

    @InjectRepository(CommercialIdentityMapping)
    private readonly commercialMappingRepo: Repository<CommercialIdentityMapping>,

    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
  ) {}

  async getProspects(commercialIdDb1: string, limit = 50): Promise<BusinessMenuContact[]> {
    if (this.dbAvailable) {
      return this.fromDb2WithoutDelivery(commercialIdDb1, limit);
    }
    return this.fromDb1ByCategory(commercialIdDb1, ['jamais_commande', 'commande_sans_livraison'], limit);
  }

  async getAnnulee(commercialIdDb1: string, limit = 50): Promise<BusinessMenuContact[]> {
    if (this.dbAvailable) {
      return this.fromDb2Cancelled(commercialIdDb1, limit);
    }
    return this.fromDb1ByCategory(commercialIdDb1, ['commande_annulee'], limit);
  }

  async getAnciennes(commercialIdDb1: string, days = 60, limit = 50): Promise<BusinessMenuContact[]> {
    if (this.dbAvailable) {
      return this.fromDb2Dormant(commercialIdDb1, days, limit);
    }
    return this.fromDb1Inactive(commercialIdDb1, days, limit);
  }

  // ── Chemins DB2 ──────────────────────────────────────────────────────────────

  private async fromDb2WithoutDelivery(commercialIdDb1: string, limit: number): Promise<BusinessMenuContact[]> {
    const idCommercial = await this.resolveIdCommercial(commercialIdDb1);
    if (!idCommercial) return this.fromDb1ByCategory(commercialIdDb1, ['jamais_commande', 'commande_sans_livraison'], limit);

    const rows = await this.segmentation.findWithoutDeliveryClients(idCommercial, limit);
    return this.enrichFromDb1(rows.map((r) => ({
      contactId:      r.contactId,
      phone:          r.phoneNormalized ?? '',
      lastOrderDate:  r.lastOrderDate,
    })));
  }

  private async fromDb2Cancelled(commercialIdDb1: string, limit: number): Promise<BusinessMenuContact[]> {
    const idCommercial = await this.resolveIdCommercial(commercialIdDb1);
    if (!idCommercial) return this.fromDb1ByCategory(commercialIdDb1, ['commande_annulee'], limit);

    const rows = await this.segmentation.findCancelledOrderClients(idCommercial, limit);
    return this.enrichFromDb1(rows.map((r) => ({
      contactId:      r.contactId,
      phone:          r.phoneNormalized ?? '',
      lastOrderDate:  r.lastOrderDate,
      extra:          r.motifAnnulation ?? undefined,
    })));
  }

  private async fromDb2Dormant(commercialIdDb1: string, days: number, limit: number): Promise<BusinessMenuContact[]> {
    const idCommercial = await this.resolveIdCommercial(commercialIdDb1);
    if (!idCommercial) return this.fromDb1Inactive(commercialIdDb1, days, limit);

    const rows = await this.segmentation.findDormantClients(idCommercial, days, limit);
    return this.enrichFromDb1(rows.map((r) => ({
      contactId:     r.contactId,
      phone:         r.phoneNormalized ?? '',
      lastOrderDate: r.lastOrderDate,
    })));
  }

  /** Résout commercial UUID (DB1) → id_commercial int (DB2). */
  private async resolveIdCommercial(commercialIdDb1: string): Promise<number | null> {
    const m = await this.commercialMappingRepo.findOne({
      where:  { commercial_id: commercialIdDb1 },
      select: ['external_id'],
    });
    if (!m) {
      this.logger.warn(`Pas de mapping DB2 pour commercial ${commercialIdDb1} — fallback DB1`);
    }
    return m?.external_id ?? null;
  }

  /** Enrichit les résultats DB2 avec le Contact DB1 (nom, chat_id, etc.). */
  private async enrichFromDb1(
    rows: Array<{ contactId: string | null; phone: string; lastOrderDate: Date | null; extra?: string }>,
  ): Promise<BusinessMenuContact[]> {
    const contactIds = rows.map((r) => r.contactId).filter(Boolean) as string[];

    const contacts = contactIds.length > 0
      ? await this.contactRepo.find({
          where:  { id: In(contactIds) },
          select: ['id', 'name', 'phone', 'chat_id'],
        })
      : [];

    const byId = new Map(contacts.map((c) => [c.id, c]));

    return rows.map((r) => {
      const contact = r.contactId ? byId.get(r.contactId) : undefined;
      return {
        id:               r.contactId,
        name:             contact?.name ?? r.phone,
        phone:            contact?.phone ?? r.phone,
        chat_id:          contact?.chat_id ?? null,
        last_message_date: r.lastOrderDate?.toISOString() ?? null,
      };
    }).filter((c) => c.phone);
  }

  // ── Chemins DB1 (fallback) ───────────────────────────────────────────────────

  private async fromDb1ByCategory(
    commercialIdDb1: string,
    categories: string[],
    limit: number,
  ): Promise<BusinessMenuContact[]> {
    const contacts = await this.contactService.findByCategory(commercialIdDb1, categories, limit);
    return contacts.map((c) => ({
      id:               c.id,
      name:             c.name,
      phone:            c.phone,
      chat_id:          c.chat_id ?? null,
      client_category:  c.client_category ?? null,
      last_message_date: c.last_message_date?.toISOString() ?? null,
    }));
  }

  private async fromDb1Inactive(
    commercialIdDb1: string,
    days: number,
    limit: number,
  ): Promise<BusinessMenuContact[]> {
    const contacts = await this.contactService.findInactive(commercialIdDb1, days, limit);
    return contacts.map((c) => ({
      id:               c.id,
      name:             c.name,
      phone:            c.phone,
      chat_id:          c.chat_id ?? null,
      last_message_date: c.last_message_date?.toISOString() ?? null,
    }));
  }
}
