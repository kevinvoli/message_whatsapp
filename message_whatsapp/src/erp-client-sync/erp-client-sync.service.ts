import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { ORDER_DB_DATA_SOURCE } from 'src/order-db/order-db.constants';
import {
  GicopUser,
  GIOCOP_USER_TYPE_CLIENT,
} from 'src/order-read/entities/giocop-user.entity';
import { Contact, ContactSource, ClientCategory, CallStatus } from 'src/contact/entities/contact.entity';
import { OrderCallSyncService } from 'src/order-call-sync/order-call-sync.service';
import { CallTaskCategory } from 'src/call-obligations/entities/call-task.entity';
import { normalizePhone } from 'src/shared/utils/normalize-phone';

const CHUNK_SIZE = 100;

@Injectable()
export class ErpClientSyncService {
  private readonly logger = new Logger(ErpClientSyncService.name);

  constructor(
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,

    @Optional()
    @Inject(ORDER_DB_DATA_SOURCE)
    private readonly orderDb: DataSource | null,

    private readonly orderCallSyncService: OrderCallSyncService,
  ) {}

  /**
   * Job nocturne — synchronise tous les clients ERP (DB2) vers Contact (DB1).
   * Tourne chaque nuit à 2h du matin.
   * Ne crée jamais de Conversation ni de WhatsappChat.
   * N'écrit jamais dans les tables natives DB2.
   */
  @Cron('0 2 * * *')
  async syncErpClients(): Promise<{ created: number; updated: number; errors: number }> {
    if (!this.orderDb) {
      this.logger.warn('syncErpClients: DB2 non disponible, sync ignorée');
      return { created: 0, updated: 0, errors: 0 };
    }

    this.logger.log('syncErpClients: démarrage sync nocturne clients ERP → Contact');

    const userRepo = this.orderDb.getRepository(GicopUser);

    // Récupère tous les clients DB2 valides ayant au moins une commande valide
    const db2Clients = await userRepo
      .createQueryBuilder('u')
      .innerJoin(
        'commandes',
        'c',
        'c.id_client = u.id AND c.valid = 1',
      )
      .where('u.type = :type', { type: GIOCOP_USER_TYPE_CLIENT })
      .andWhere('u.valid = 1')
      .andWhere('(u.phone IS NOT NULL OR u.phone2 IS NOT NULL)')
      .select(['u.id', 'u.nom', 'u.prenoms', 'u.phone', 'u.phone2'])
      .distinct(true)
      .getMany();

    this.logger.log(`syncErpClients: ${db2Clients.length} clients DB2 à traiter`);

    let created = 0;
    let updated = 0;
    let errors  = 0;

    // Traitement en chunks pour éviter l'overflow mémoire
    for (let i = 0; i < db2Clients.length; i += CHUNK_SIZE) {
      const chunk = db2Clients.slice(i, i + CHUNK_SIZE);

      for (const client of chunk) {
        // Utiliser phone principal, sinon phone2
        const rawPhone = client.phone ?? client.phone2;
        if (!rawPhone) continue;

        const normalized = normalizePhone(rawPhone);
        if (!normalized) continue;

        try {
          // Résoudre la catégorie via la méthode extraite de OrderCallSyncService
          const resolvedCategory: CallTaskCategory =
            await this.orderCallSyncService.resolveCategoryByClientId(client.id, this.orderDb!);

          const clientCategory = resolvedCategory as unknown as ClientCategory;

          // Construire le nom complet depuis nom + prenoms DB2
          const fullName = [client.prenoms, client.nom]
            .filter(Boolean)
            .join(' ')
            .trim() || normalized;

          // Upsert contact DB1
          const existing = await this.contactRepo.findOne({
            where:  { phone: normalized },
            select: ['id', 'contactSource'],
          });

          if (existing) {
            // Mise à jour catégorie et order_client_id — ne pas écraser contactSource
            await this.contactRepo.update(existing.id, {
              client_category: clientCategory,
              order_client_id: client.id,
            });
            updated++;
          } else {
            // Création contact ERP-only (pas de chat_id, pas de conversation)
            await this.contactRepo.save(
              this.contactRepo.create({
                phone:              normalized,
                name:               fullName,
                contactSource:      ContactSource.ErpImport,
                order_client_id:    client.id,
                client_category:    clientCategory,
                call_status:        CallStatus.À_APPeler,
                conversion_status:  'client', // déjà client ERP — pas un "nouveau" contact
              }),
            );
            created++;
          }
        } catch (err) {
          errors++;
          this.logger.warn(
            `syncErpClients erreur client DB2 id=${client.id}: ${(err as Error).message}`,
          );
        }
      }
    }

    // Second pass (OE-5.2) : contacts DB1 avec order_client_id mais absents du batch DB2 courant.
    // Ces contacts ont changé de situation (ex : commandes supprimées/invalidées) → recalculer
    // leur catégorie pour éviter des données obsolètes en DB1.
    const refreshed = await this.refreshStaleCategories(
      new Set(db2Clients.map((c) => c.id)),
    );

    this.logger.log(
      `syncErpClients terminé — ${created} créés, ${updated} mis à jour, ${refreshed} recatégorisés, ${errors} erreurs`,
    );
    return { created, updated, errors };
  }

  /**
   * Recatégorise les contacts DB1 dont le order_client_id ne figure plus dans le
   * batch DB2 courant (client sans commande valide désormais).
   */
  private async refreshStaleCategories(processedIds: Set<number>): Promise<number> {
    let refreshed = 0;
    try {
      // Charge tous les contacts DB1 ayant un order_client_id
      const linkedContacts = await this.contactRepo.find({
        where:  { order_client_id: Not(IsNull()) },
        select: ['id', 'order_client_id', 'client_category'],
      });

      // Ne retenir que ceux absents du batch courant (situation changée)
      const stale = linkedContacts.filter(
        (c) => c.order_client_id != null && !processedIds.has(c.order_client_id),
      );

      if (stale.length === 0) return 0;

      this.logger.log(`syncErpClients: ${stale.length} contacts à recatégoriser (absents du batch DB2)`);

      for (const contact of stale) {
        try {
          const fresh = await this.orderCallSyncService.resolveCategoryByClientId(
            contact.order_client_id!,
            this.orderDb!,
          );
          const freshCategory = fresh as unknown as ClientCategory;
          if (freshCategory !== contact.client_category) {
            await this.contactRepo.update(contact.id, { client_category: freshCategory });
            refreshed++;
          }
        } catch { /* non bloquant */ }
      }
    } catch (err) {
      this.logger.warn(`refreshStaleCategories erreur: ${(err as Error).message}`);
    }
    return refreshed;
  }
}
