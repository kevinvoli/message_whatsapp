import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { ORDER_DB_AVAILABLE, ORDER_DB_DATA_SOURCE } from 'src/order-db/order-db.constants';
import {
  OrderCallLog,
  ORDER_CALL_MIN_DURATION_SEC,
  ORDER_CALL_TYPE_MISSED,
  ORDER_CALL_TYPE_OUTGOING,
} from 'src/order-read/entities/order-call-log.entity';
import { OrderCommand } from 'src/order-read/entities/order-command.entity';
import { GicopUser, GIOCOP_USER_TYPE_CLIENT } from 'src/order-read/entities/giocop-user.entity';
import { OrderCallSyncCursor } from './entities/order-call-sync-cursor.entity';
import { IntegrationSyncLogService } from 'src/integration-sync/integration-sync-log.service';
import { CallObligationService } from 'src/call-obligations/call-obligation.service';
import { CallTaskCategory } from 'src/call-obligations/entities/call-task.entity';

const CURSOR_SCOPE = 'global';
const BATCH_SIZE   = 200;

@Injectable()
export class OrderCallSyncService {
  private readonly logger = new Logger(OrderCallSyncService.name);

  constructor(
    @Inject(ORDER_DB_DATA_SOURCE)
    private readonly orderDb: DataSource | null,

    @Inject(ORDER_DB_AVAILABLE)
    private readonly dbAvailable: boolean,

    @InjectRepository(OrderCallSyncCursor)
    private readonly cursorRepo: Repository<OrderCallSyncCursor>,

    private readonly syncLog: IntegrationSyncLogService,

    @Optional()
    private readonly obligationService: CallObligationService,
  ) {}

  /**
   * Lit les nouveaux appels depuis DB2 (depuis le curseur) et les traite.
   * Idempotent : les appels déjà traités sont ignorés via le curseur.
   */
  async syncNewCalls(): Promise<{ processed: number; obligations: number; errors: number }> {
    if (!this.dbAvailable || !this.orderDb) {
      this.logger.debug('DB2 non disponible — sync appels ignorée');
      return { processed: 0, obligations: 0, errors: 0 };
    }

    const cursor = await this.getOrCreateCursor();
    const callRepo = this.orderDb.getRepository(OrderCallLog);

    // OBL-009 — Lecture incrémentale avec tie-breaker sur id pour éviter les pertes
    // quand plusieurs appels ont le même timestamp.
    const since    = cursor.lastCallTimestamp ?? new Date(0);
    const lastId   = cursor.lastCallId ?? '';
    const qb = callRepo
      .createQueryBuilder('c')
      .where(
        '(c.call_timestamp > :since OR (c.call_timestamp = :since AND c.id > :lastId))',
        { since, lastId },
      )
      .orderBy('c.call_timestamp', 'ASC')
      .addOrderBy('c.id', 'ASC')
      .take(BATCH_SIZE);

    const calls = await qb.getMany();

    if (calls.length === 0) {
      this.logger.debug('Sync call_logs DB2 — aucun nouvel appel');
      return { processed: 0, obligations: 0, errors: 0 };
    }

    let obligationsMatched = 0;
    let errors = 0;

    for (const call of calls) {
      let logId: string | null = null;
      try {
        const log = await this.processCall(call);
        logId = log.id;

        if (this.isEligibleForObligation(call)) {
          const result = await this.matchObligation(call);
          if (result?.matched) {
            obligationsMatched++;
            await this.syncLog.markSuccess(logId);
          } else if (result && !result.matched) {
            // OBL-018 — Tracer les rejets pour diagnostic admin
            await this.syncLog.markFailed(logId, result.reason ?? 'unknown');
          }
        }
      } catch (err) {
        errors++;
        this.logger.error(
          `Erreur traitement appel ${call.id}: ${(err as Error).message}`,
        );
        if (logId) await this.syncLog.markFailed(logId, (err as Error).message).catch(() => {});
      }
    }

    // Avancer le curseur
    const last = calls[calls.length - 1];
    await this.cursorRepo.update(
      { scope: CURSOR_SCOPE },
      {
        lastCallTimestamp: last.callTimestamp,
        lastCallId:        last.id,
        processedCount:    () => `processed_count + ${calls.length}`,
      },
    );

    this.logger.log(
      `Sync call_logs DB2 — ${calls.length} appels traités, ${obligationsMatched} obligations, ${errors} erreurs`,
    );

    return { processed: calls.length, obligations: obligationsMatched, errors };
  }

  /** Traite un appel : crée un log de sync local. Retourne le log créé pour suivi statut. */
  private async processCall(call: OrderCallLog): Promise<{ id: string }> {
    return this.syncLog.createPending('call_validation', call.id, 'call_logs');
  }

  /**
   * Éligible obligation : sortant ('outgoing') + durée >= 90s.
   * Un appel manqué ('missed') ne compte jamais dans les obligations.
   * id_commercial est préféré mais on accepte aussi le fallback par localNumber.
   */
  private isEligibleForObligation(call: OrderCallLog): boolean {
    return (
      call.callType === ORDER_CALL_TYPE_OUTGOING &&
      call.duration >= ORDER_CALL_MIN_DURATION_SEC &&
      (call.idCommercial != null || Boolean(call.localNumber))
    );
  }

  /** Envoie l'appel au moteur d'obligations GICOP. */
  private async matchObligation(
    call: OrderCallLog,
  ): Promise<{ matched: boolean; reason?: string } | null> {
    if (!this.obligationService) return null;

    const resolvedCategory = await this.resolveClientCategory(call.idClient, call.remoteNumber);

    return this.obligationService.tryMatchCallToTask({
      callEventId:       call.id,
      durationSeconds:   call.duration,
      resolvedCategory,
      idCommercialDb2:   call.idCommercial,
      idClientDb2:       call.idClient,
      commercialPhone:   call.localNumber ?? undefined,
      clientPhone:       call.remoteNumber,
      posteId:           null,
    });
  }

  /**
   * Détermine la catégorie d'un client depuis DB2.
   *
   * Flux :
   *   1. id_client présent  → cherche directement dans commandes (même ID DB2)
   *   2. id_client absent   → cherche le client par numéro de téléphone dans users DB2
   *                           → récupère son id DB2 → cherche dans commandes
   *
   *   Aucune commande trouvée            → JAMAIS_COMMANDE
   *   trueCancel = 1                     → COMMANDE_ANNULEE
   *   dateLivree IS NOT NULL             → COMMANDE_AVEC_LIVRAISON
   *   commande existante non finalisée   → JAMAIS_COMMANDE (défaut)
   */
  private async resolveClientCategory(
    idClient: number | null,
    remoteNumber: string,
  ): Promise<CallTaskCategory> {
    if (!this.orderDb) return CallTaskCategory.JAMAIS_COMMANDE;

    const cmdRepo  = this.orderDb.getRepository(OrderCommand);
    const userRepo = this.orderDb.getRepository(GicopUser);

    let clientIdDb2 = idClient;

    // Fallback : résolution par téléphone si id_client absent
    if (clientIdDb2 == null && remoteNumber) {
      const normalized = remoteNumber.replace(/\D/g, '');
      const user = await userRepo
        .createQueryBuilder('u')
        .where('u.type = :type', { type: GIOCOP_USER_TYPE_CLIENT })
        .andWhere('(u.phone = :phone OR u.phone2 = :phone)', { phone: normalized })
        .andWhere('u.valid = 1')
        .select(['u.id'])
        .getOne();

      clientIdDb2 = user?.id ?? null;
    }

    if (clientIdDb2 == null) return CallTaskCategory.JAMAIS_COMMANDE;

    const order = await cmdRepo
      .createQueryBuilder('c')
      .where('c.idClient = :clientIdDb2', { clientIdDb2 })
      .andWhere('c.valid = 1')
      .orderBy('c.dateEnreg', 'DESC')
      .limit(1)
      .getOne();

    if (!order) return CallTaskCategory.JAMAIS_COMMANDE;
    if (order.trueCancel === 1) return CallTaskCategory.COMMANDE_ANNULEE;
    if (order.dateLivree != null) return CallTaskCategory.COMMANDE_AVEC_LIVRAISON;

    return CallTaskCategory.JAMAIS_COMMANDE;
  }

  /** Retourne les appels manqués récents (non encore traités) pour un numéro local. */
  async getMissedCallsSince(localNumber: string, since: Date): Promise<OrderCallLog[]> {
    if (!this.orderDb) return [];

    const callRepo = this.orderDb.getRepository(OrderCallLog);
    return callRepo.find({
      where: {
        localNumber,
        callType:      ORDER_CALL_TYPE_MISSED,   // 'missed'
        callTimestamp: MoreThan(since),
      },
      order: { callTimestamp: 'DESC' },
      take:  50,
    });
  }

  /** Compte les appels manqués depuis N heures pour un numéro local. */
  async countMissedCallsSince(localNumber: string, hours = 24): Promise<number> {
    if (!this.orderDb) return 0;

    const since = new Date();
    since.setHours(since.getHours() - hours);

    const callRepo = this.orderDb.getRepository(OrderCallLog);
    return callRepo.count({
      where: {
        localNumber,
        callType:      ORDER_CALL_TYPE_MISSED,
        callTimestamp: MoreThan(since),
      },
    });
  }

  private async getOrCreateCursor(): Promise<OrderCallSyncCursor> {
    let cursor = await this.cursorRepo.findOne({ where: { scope: CURSOR_SCOPE } });
    if (!cursor) {
      cursor = await this.cursorRepo.save(
        this.cursorRepo.create({
          scope:             CURSOR_SCOPE,
          lastCallTimestamp: null,
          lastCallId:        null,
          processedCount:    0,
        }),
      );
    }
    return cursor;
  }

  /** Statut courant pour le panneau admin. */
  async getStatus(): Promise<{
    dbAvailable: boolean;
    lastSyncAt: Date | null;
    processedCount: number;
  }> {
    const cursor = await this.cursorRepo.findOne({ where: { scope: CURSOR_SCOPE } });
    return {
      dbAvailable:    this.dbAvailable,
      lastSyncAt:     cursor?.updatedAt ?? null,
      processedCount: cursor?.processedCount ?? 0,
    };
  }
}
