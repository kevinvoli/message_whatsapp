import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ORDER_DB_AVAILABLE, ORDER_DB_DATA_SOURCE } from 'src/order-db/order-db.constants';
import { OrderCommand } from '../entities/order-command.entity';
import { ClientIdentityMapping } from 'src/integration/entities/client-identity-mapping.entity';
import { CommercialIdentityMapping } from 'src/integration/entities/commercial-identity-mapping.entity';

export interface SegmentedClient {
  idClientDb2:    number;
  contactId:      string | null;
  phoneNormalized: string | null;
  lastOrderDate:  Date | null;
  /** Pour "annulées" : motif */
  motifAnnulation?: string | null;
}

@Injectable()
export class OrderSegmentationReadService {
  private readonly logger = new Logger(OrderSegmentationReadService.name);

  constructor(
    @Inject(ORDER_DB_DATA_SOURCE)
    private readonly orderDb: DataSource | null,

    @Inject(ORDER_DB_AVAILABLE)
    private readonly dbAvailable: boolean,

    @InjectRepository(ClientIdentityMapping)
    private readonly clientMappingRepo: Repository<ClientIdentityMapping>,

    @InjectRepository(CommercialIdentityMapping)
    private readonly commercialMappingRepo: Repository<CommercialIdentityMapping>,
  ) {}

  /**
   * Clients ayant au moins une commande ANNULÉE (true_cancel=1).
   * Classés par date d'annulation décroissante.
   */
  async findCancelledOrderClients(
    idCommercial: number,
    limit = 50,
  ): Promise<SegmentedClient[]> {
    if (!this.orderDb) return [];

    const rows = await this.orderDb
      .getRepository(OrderCommand)
      .createQueryBuilder('c')
      .select('c.id_client', 'idClient')
      .addSelect('MAX(c.date_annulation)', 'lastOrderDate')
      .addSelect('MAX(c.motif_annulation)', 'motifAnnulation')
      .where('c.id_commercial = :idCommercial', { idCommercial })
      .andWhere('c.valid = 1')
      .andWhere('c.true_cancel = 1')
      .andWhere('c.id_client IS NOT NULL')
      .groupBy('c.id_client')
      .orderBy('lastOrderDate', 'DESC')
      .limit(limit)
      .getRawMany<{ idClient: number; lastOrderDate: string; motifAnnulation: string | null }>();

    return this.enrichWithMapping(rows.map((r) => ({
      idClientDb2:    r.idClient,
      lastOrderDate:  r.lastOrderDate ? new Date(r.lastOrderDate) : null,
      motifAnnulation: r.motifAnnulation,
    })));
  }

  /**
   * Clients ayant des commandes confirmées SANS livraison (commande_sans_livraison).
   */
  async findWithoutDeliveryClients(
    idCommercial: number,
    limit = 50,
  ): Promise<SegmentedClient[]> {
    if (!this.orderDb) return [];

    const rows = await this.orderDb
      .getRepository(OrderCommand)
      .createQueryBuilder('c')
      .select('c.id_client', 'idClient')
      .addSelect('MAX(c.date_enreg)', 'lastOrderDate')
      .where('c.id_commercial = :idCommercial', { idCommercial })
      .andWhere('c.valid = 1')
      .andWhere('c.true_cancel = 0')
      .andWhere('c.is_order_confirmed = 1')
      .andWhere('c.date_livree IS NULL')
      .andWhere('c.is_on_temp = 0')
      .andWhere('c.id_client IS NOT NULL')
      .groupBy('c.id_client')
      .orderBy('lastOrderDate', 'DESC')
      .limit(limit)
      .getRawMany<{ idClient: number; lastOrderDate: string }>();

    return this.enrichWithMapping(rows.map((r) => ({
      idClientDb2:   r.idClient,
      lastOrderDate: r.lastOrderDate ? new Date(r.lastOrderDate) : null,
    })));
  }

  /**
   * Clients dont la dernière commande date de plus de N jours (anciennes clientes).
   */
  async findDormantClients(
    idCommercial: number,
    days = 60,
    limit = 50,
  ): Promise<SegmentedClient[]> {
    if (!this.orderDb) return [];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const rows = await this.orderDb
      .getRepository(OrderCommand)
      .createQueryBuilder('c')
      .select('c.id_client', 'idClient')
      .addSelect('MAX(c.date_enreg)', 'lastOrderDate')
      .where('c.id_commercial = :idCommercial', { idCommercial })
      .andWhere('c.valid = 1')
      .andWhere('c.true_cancel = 0')
      .andWhere('c.id_client IS NOT NULL')
      .groupBy('c.id_client')
      .having('MAX(c.date_enreg) < :cutoff', { cutoff })
      .orderBy('lastOrderDate', 'ASC')
      .limit(limit)
      .getRawMany<{ idClient: number; lastOrderDate: string }>();

    return this.enrichWithMapping(rows.map((r) => ({
      idClientDb2:   r.idClient,
      lastOrderDate: r.lastOrderDate ? new Date(r.lastOrderDate) : null,
    })));
  }

  /** Résout les id_client DB2 en contactId + phone via client_identity_mapping (DB1). */
  private async enrichWithMapping(
    rows: Array<{ idClientDb2: number; lastOrderDate: Date | null; motifAnnulation?: string | null }>,
  ): Promise<SegmentedClient[]> {
    if (rows.length === 0) return [];

    const externalIds = rows.map((r) => r.idClientDb2);
    const mappings = await this.clientMappingRepo.find({
      where: { external_id: In(externalIds) },
      select: ['external_id', 'contact_id', 'phone_normalized'],
    });

    const byExternalId = new Map(mappings.map((m) => [m.external_id, m]));

    return rows.map((r) => {
      const m = byExternalId.get(r.idClientDb2);
      return {
        idClientDb2:     r.idClientDb2,
        contactId:       m?.contact_id ?? null,
        phoneNormalized: m?.phone_normalized ?? null,
        lastOrderDate:   r.lastOrderDate,
        motifAnnulation: r.motifAnnulation,
      };
    });
  }

  /** Résout commercial_id (UUID DB1) → id_commercial (int DB2). */
  async resolveIdCommercialDb2(commercialIdDb1: string): Promise<number | null> {
    const mapping = await this.commercialMappingRepo.findOne({
      where: { commercial_id: commercialIdDb1 },
      select: ['external_id'],
    });
    return mapping?.external_id ?? null;
  }

  /** Résout contact_id (UUID DB1) → id_client (int DB2). */
  async resolveIdClientDb2(contactIdDb1: string): Promise<number | null> {
    const mapping = await this.clientMappingRepo.findOne({
      where: { contact_id: contactIdDb1 },
      select: ['external_id'],
    });
    return mapping?.external_id ?? null;
  }
}
