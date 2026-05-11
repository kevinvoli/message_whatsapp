import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, MoreThan, Not, Repository } from 'typeorm';
import { CallLog, CallOutcome } from 'src/call-log/entities/call_log.entity';
import { CallStatus } from 'src/contact/entities/contact.entity';
import { CallEventService } from 'src/window/services/call-event.service';
import { ORDER_DB_AVAILABLE, ORDER_DB_DATA_SOURCE } from 'src/order-db/order-db.constants';
import {
  OrderCallLog,
  ORDER_CALL_MIN_DURATION_SEC,
  ORDER_CALL_TYPE_MISSED,
  ORDER_CALL_TYPE_OUTGOING,
} from 'src/order-read/entities/order-call-log.entity';
import { OrderCommand } from 'src/order-read/entities/order-command.entity';
import {
  GicopUser,
  GIOCOP_USER_TYPE_CLIENT,
  GIOCOP_USER_TYPE_COMMERCIAL,
} from 'src/order-read/entities/giocop-user.entity';
import { OrderCallSyncCursor } from './entities/order-call-sync-cursor.entity';
import { IntegrationSyncLogService } from 'src/integration-sync/integration-sync-log.service';
import { CallObligationService } from 'src/call-obligations/call-obligation.service';
import { CallTaskCategory } from 'src/call-obligations/entities/call-task.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { CommercialIdentityMapping } from 'src/integration/entities/commercial-identity-mapping.entity';
import {
  OrderCommandStatus,
  ORDER_COMMAND_STATUS_ETAT_RETOUR,
} from 'src/order-read/entities/order-command-status.entity';
import { CallDevice } from 'src/call-device/entities/call-device.entity';
import { ClientCategory, Contact } from 'src/contact/entities/contact.entity';
import { ClientIdentityMapping } from 'src/integration/entities/client-identity-mapping.entity';
import { normalizePhone } from 'src/shared/utils/normalize-phone';
import { CallEventUnresolved } from './entities/call-event-unresolved.entity';

const CURSOR_SCOPE            = 'global';
const CURSOR_LOOKBACK_MINUTES = 2;

@Injectable()
export class OrderCallSyncService {
  private readonly logger = new Logger(OrderCallSyncService.name);

  private readonly batchSize: number = parseInt(
    process.env['ORDER_CALL_SYNC_BATCH_SIZE'] ?? '200',
    10,
  );

  constructor(
    @Inject(ORDER_DB_DATA_SOURCE)
    private readonly orderDb: DataSource | null,

    @Inject(ORDER_DB_AVAILABLE)
    private readonly dbAvailable: boolean,

    @InjectRepository(OrderCallSyncCursor)
    private readonly cursorRepo: Repository<OrderCallSyncCursor>,

    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,

    @InjectRepository(CommercialIdentityMapping)
    private readonly mappingRepo: Repository<CommercialIdentityMapping>,

    @InjectRepository(CallDevice)
    private readonly callDeviceRepo: Repository<CallDevice>,

    private readonly syncLog: IntegrationSyncLogService,

    @Optional()
    private readonly obligationService: CallObligationService,

    private readonly callEventService: CallEventService,

    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,

    @InjectRepository(ClientIdentityMapping)
    private readonly clientMappingRepo: Repository<ClientIdentityMapping>,

    @InjectRepository(CallEventUnresolved)
    private readonly unresolvedRepo: Repository<CallEventUnresolved>,

    @InjectRepository(CallLog)
    private readonly callLogRepo: Repository<CallLog>,
  ) {}

  async syncNewCalls(): Promise<{ processed: number; obligations: number; errors: number }> {
    if (!this.dbAvailable || !this.orderDb) {
      this.logger.debug('DB2 non disponible - sync appels ignoree');
      return { processed: 0, obligations: 0, errors: 0 };
    }

    const cursor = await this.getOrCreateCursor();
    const callRepo = this.orderDb.getRepository(OrderCallLog);

    const since           = cursor.lastCallTimestamp ?? new Date(0);
    const lookbackMinutes = Math.max(
      0,
      Number(process.env['ORDER_CALL_SYNC_LOOKBACK_MINUTES'] ?? String(CURSOR_LOOKBACK_MINUTES)),
    );
    const lookbackSince = new Date(since.getTime() - lookbackMinutes * 60_000);

    const qb = callRepo
      .createQueryBuilder('c')
      .where('c.call_timestamp >= :lookbackSince', { lookbackSince })
      .orderBy('c.call_timestamp', 'ASC')
      .addOrderBy('c.id', 'ASC')
      .take(this.batchSize);

    // Backfill device_id pour les call_event historiques (avant la migration)
    await this.backfillNullDeviceIds().catch((err: Error) =>
      this.logger.warn(`backfillNullDeviceIds: ${err.message}`),
    );

    const calls = await qb.getMany();

    if (calls.length === 0) {
      this.logger.debug('Sync call_logs DB2 - aucun nouvel appel');
      await this.recalculateDeviceCounts().catch((err: Error) =>
        this.logger.warn(`recalculateDeviceCounts: ${err.message}`),
      );
      return { processed: 0, obligations: 0, errors: 0 };
    }

    let newCalls          = 0;
    let obligationsMatched = 0;
    let errors             = 0;

    // Pré-résolution 1 : local_number → commercial DB1 UUID (par téléphone)
    const allCommercialsDb1 = await this.commercialRepo.find({
      where: { deletedAt: IsNull() },
      select: ['id', 'phone'],
    });
    const commercialByPhone = new Map(
      allCommercialsDb1
        .filter((c) => c.phone)
        .map((c) => [normalizePhone(c.phone), c.id]),
    );

    // Pré-résolution 2 : device_id → commercial connecté au poste (fallback)
    const allDevices = await this.callDeviceRepo.find({
      where: { posteId: Not(IsNull()) },
      select: ['deviceId', 'posteId'],
    });
    const posteIds = [...new Set(allDevices.map((d) => d.posteId!))];
    const connectedAtPoste = posteIds.length > 0
      ? await this.commercialRepo.find({
          where: { poste: { id: In(posteIds) }, isConnected: true, deletedAt: IsNull() },
          relations: ['poste'],
          select: { id: true, poste: { id: true } },
        })
      : [];
    const commercialByPosteId = new Map(
      connectedAtPoste.filter((c) => c.poste?.id).map((c) => [c.poste!.id, c.id]),
    );
    const commercialByDevice = new Map(
      allDevices
        .filter((d) => d.posteId && commercialByPosteId.has(d.posteId))
        .map((d) => [d.deviceId, commercialByPosteId.get(d.posteId!)!]),
    );

    for (const call of calls) {
      const normalizedLocal = normalizePhone(call.localNumber);
      const commercialIdDb1 =
        (normalizedLocal ? commercialByPhone.get(normalizedLocal) : undefined)
        ?? commercialByDevice.get(call.deviceId)
        ?? null;

      const attributionSource =
        (normalizedLocal && commercialByPhone.has(normalizedLocal)) ? 'phone' :
        (call.deviceId && commercialByDevice.has(call.deviceId))    ? 'device_poste' :
        null;

      // D2 - passer deviceId dans ingestFromDb2
      await this.callEventService.ingestFromDb2({
        externalId:        String(call.id),
        commercialPhone:   call.localNumber ?? '',
        commercialId:      commercialIdDb1 ?? null,
        clientPhone:       call.remoteNumber,
        callStatus:        call.callType.toLowerCase(),
        durationSeconds:   this.normalizeDuration(call.duration),
        eventAt:           call.callTimestamp,
        deviceId:          call.deviceId ?? null,
        attributionSource,
      });

      // B — Créer un call_log automatique depuis cet appel (idempotent via callEventExternalId)
      if (commercialIdDb1 !== null) {
        try {
          const alreadyLogged = await this.callLogRepo.findOne({
            where: { callEventExternalId: String(call.id) },
            select: ['id'],
          });
          if (!alreadyLogged) {
            // Résoudre contact_id via numéro client (peut être null si pas de contact WhatsApp)
            const clientContact = call.remoteNumber
              ? await this.contactRepo.findOne({
                  where: { phone: normalizePhone(call.remoteNumber) },
                  select: ['id'],
                })
              : null;

            // Résoudre commercial_name
            const commercial = await this.commercialRepo.findOne({
              where: { id: commercialIdDb1 },
              select: ['id', 'name'],
            });

            // Mapper call_status + outcome
            const callType     = call.callType.toLowerCase();
            const durationSec  = this.normalizeDuration(call.duration);
            let mappedStatus: CallStatus;
            let mappedOutcome: CallOutcome | null = null;

            if (callType === 'answered') {
              mappedStatus  = CallStatus.Appelé;
              mappedOutcome = CallOutcome.Répondu;
            } else if (callType === 'outgoing') {
              if (durationSec > 0) {
                mappedStatus  = CallStatus.Appelé;
                mappedOutcome = CallOutcome.Répondu;
              } else {
                mappedStatus  = CallStatus.Non_Joignable;
                mappedOutcome = CallOutcome.PasDeRéponse;
              }
            } else if (callType === 'no_answer' || callType === 'missed') {
              mappedStatus  = CallStatus.Non_Joignable;
              mappedOutcome = CallOutcome.PasDeRéponse;
            } else if (callType === 'busy') {
              mappedStatus  = CallStatus.Non_Joignable;
              mappedOutcome = CallOutcome.Occupé;
            } else if (callType === 'voicemail') {
              mappedStatus  = CallStatus.Rappeler;
              mappedOutcome = CallOutcome.Messagerie;
            } else {
              // rejected, failed, ou inconnu
              mappedStatus  = CallStatus.Non_Joignable;
              mappedOutcome = CallOutcome.PasDeRéponse;
            }

            await this.callLogRepo.save(
              this.callLogRepo.create({
                contact_id:           clientContact?.id ?? null,
                client_phone:         normalizePhone(call.remoteNumber ?? ''),
                commercial_id:        commercialIdDb1,
                commercial_name:      commercial?.name ?? 'Commercial inconnu',
                called_at:            call.callTimestamp,
                call_status:          mappedStatus,
                outcome:              mappedOutcome,
                duration_sec:         durationSec,
                notes:                null,
                treated:              false,
                callEventExternalId:  String(call.id),
              }),
            );
            this.logger.debug(`call_log créé pour appel DB2 id=${call.id}`);
          }
        } catch (callLogErr) {
          this.logger.warn(
            `Impossible de créer call_log pour appel ${call.id}: ${(callLogErr as Error).message}`,
          );
        }
      }

      // D4 - Auto-decouverte device : UPSERT silencieux sur call_device
      if (call.deviceId) {
        try {
          await this.upsertCallDevice(call.deviceId, call.callTimestamp);
        } catch {
          // silencieux - ne bloque pas la sync
        }
      }

      // N5 — Appel non résolu : ni commercial trouvé par téléphone ni par device_id → file d'attente
      if (commercialIdDb1 === null) {
        try {
          await this.unresolvedRepo
            .createQueryBuilder()
            .insert()
            .into(CallEventUnresolved)
            .values({
              externalId:   String(call.id),
              localNumber:  call.localNumber ?? null,
              remoteNumber: call.remoteNumber ?? null,
              deviceId:     call.deviceId ?? null,
              callType:     call.callType ?? null,
              durationSec:  call.duration ?? null,
              eventAt:      call.callTimestamp,
              reason:       'commercial_not_found',
              resolvedAt:   null,
            })
            .orIgnore()
            .execute();
        } catch (insertErr) {
          this.logger.warn(
            `N5 insert call_event_unresolved ${call.id}: ${(insertErr as Error).message}`,
          );
        }
      }

      if (!this.isEligibleForObligation(call)) continue;

      let logId: string | null = null;
      try {
        // existsAnyForEntity couvre pending+success+failed pour éviter les doublons de log
        const alreadyProcessed = await this.syncLog.existsAnyForEntity('call_validation', call.id);
        if (alreadyProcessed) continue;

        newCalls++;
        const log = await this.processCall(call);
        logId = log.id;

        const result = await this.matchObligation(call);
        if (result?.matched) {
          obligationsMatched++;
          await this.syncLog.markSuccess(logId);
        } else if (result && !result.matched) {
          await this.syncLog.markFailed(logId, result.reason ?? 'unknown', true);
        }
      } catch (err) {
        errors++;
        this.logger.error(
          `Erreur traitement appel ${call.id}: ${(err as Error).message}`,
        );
        if (logId) await this.syncLog.markFailed(logId, (err as Error).message).catch(() => {});
      }
    }

    const last = calls[calls.length - 1];
    await Promise.all([
      this.cursorRepo.update(
        { scope: CURSOR_SCOPE },
        {
          lastCallTimestamp: last.callTimestamp,
          lastCallId:        last.id,
          processedCount:    () => `processed_count + ${newCalls}`,
        },
      ),
      this.recalculateDeviceCounts().catch((err: Error) =>
        this.logger.warn(`recalculateDeviceCounts: ${err.message}`),
      ),
    ]);

    this.logger.log(
      `Sync call_logs DB2 - ${newCalls} nouveaux / ${calls.length} lus, ${obligationsMatched} obligations, ${errors} erreurs`,
    );

    return { processed: newCalls, obligations: obligationsMatched, errors };
  }

  /** D4 — Insère ou met à jour first_seen/last_seen pour ce device_id. */
  private async upsertCallDevice(deviceId: string, callTimestamp: Date): Promise<void> {
    const existing = await this.callDeviceRepo.findOne({ where: { deviceId } });
    if (existing) {
      if (callTimestamp > existing.lastSeen) {
        existing.lastSeen = callTimestamp;
        await this.callDeviceRepo.save(existing);
      }
    } else {
      await this.callDeviceRepo.save(
        this.callDeviceRepo.create({
          deviceId,
          label:     null,
          posteId:   null,
          firstSeen: callTimestamp,
          lastSeen:  callTimestamp,
          callCount: 0,
        }),
      );
    }
  }

  /**
   * Backfill call_event.device_id pour les lignes insérées avant la migration.
   * Lit les external_id sans device_id depuis DB1, retrouve le device_id dans DB2,
   * et met à jour DB1 en batch.
   */
  private async backfillNullDeviceIds(): Promise<void> {
    if (!this.orderDb) return;

    const externalIds = await this.callEventService.getExternalIdsWithoutDeviceId(500);
    if (externalIds.length === 0) return;

    const callRepo = this.orderDb.getRepository(OrderCallLog);
    const db2Calls = await callRepo.findBy({ id: In(externalIds) });

    const updates = db2Calls
      .filter((c) => c.deviceId)
      .map((c) => ({ externalId: String(c.id), deviceId: c.deviceId }));

    if (updates.length > 0) {
      const n = await this.callEventService.applyDeviceIdBatch(updates);
      this.logger.log(`backfillNullDeviceIds — ${n} call_event mis à jour`);
    }
  }

  /**
   * Recalcule call_device.call_count depuis DB2 (source de vérité).
   * Utilise une requête SQL brute sur DB2 pour éviter tout problème de résolution
   * de noms de colonnes TypeORM. Crée les entrées call_device manquantes (UPSERT).
   */
  private async recalculateDeviceCounts(): Promise<void> {
    if (!this.orderDb) return;

    const rows = await this.orderDb
      .getRepository(OrderCallLog)
      .createQueryBuilder('c')
      .select('c.deviceId', 'deviceId')
      .addSelect('COUNT(*)', 'cnt')
      .where('c.deviceId IS NOT NULL')
      .andWhere("c.deviceId != ''")
      .groupBy('c.deviceId')
      .getRawMany<{ deviceId: string; cnt: string }>();

    this.logger.log(`recalculateDeviceCounts: ${rows.length} device(s) trouvé(s) dans DB2 call_logs`);

    for (const { deviceId, cnt } of rows) {
      const callCount = Number(cnt);
      const result = await this.callDeviceRepo.update({ deviceId }, { callCount });
      if ((result.affected ?? 0) === 0) {
        const now = new Date();
        await this.callDeviceRepo.save(
          this.callDeviceRepo.create({
            deviceId,
            label:     null,
            posteId:   null,
            firstSeen: now,
            lastSeen:  now,
            callCount,
          }),
        );
        this.logger.log(`recalculateDeviceCounts: call_device créé automatiquement — ${deviceId} (${callCount} appels)`);
      } else {
        this.logger.debug(`recalculateDeviceCounts: ${deviceId} → ${callCount} appels`);
      }
    }
  }

  private async processCall(call: OrderCallLog): Promise<{ id: string }> {
    return this.syncLog.createPending('call_validation', call.id, 'call_logs');
  }

  /**
   * Normalise la durée DB2 en secondes.
   * DB2 peut stocker en millisecondes (valeurs > 86 400 000 = plus de 24h en ms).
   * Seuil : si duration > 86400 on considère que c'est des ms → diviser par 1000.
   */
  private normalizeDuration(raw: number): number {
    if (!raw) return 0;
    return raw > 86_400 ? Math.round(raw / 1000) : raw;
  }

  private isEligibleForObligation(call: OrderCallLog): boolean {
    return (
      call.callType.toLowerCase() === ORDER_CALL_TYPE_OUTGOING &&
      (Boolean(call.localNumber) || Boolean(call.deviceId))
    );
  }

  private async matchObligation(
    call: OrderCallLog,
  ): Promise<{ matched: boolean; reason?: string } | null> {
    if (!this.obligationService) return null;

    const resolvedCategory = await this.resolveClientCategory(call.remoteNumber);

    // D7 - Fallback device->poste : si device_id connu et associe a un poste dans call_device
    let devicePosteId: string | null = null;
    if (call.deviceId) {
      try {
        const device = await this.callDeviceRepo.findOne({ where: { deviceId: call.deviceId } });
        devicePosteId = device?.posteId ?? null;
      } catch {
        // silencieux
      }
    }

    return this.obligationService.tryMatchCallToTask({
      callEventId:      call.id,
      durationSeconds:  this.normalizeDuration(call.duration),
      resolvedCategory,
      commercialPhone:  call.localNumber ?? undefined,
      clientPhone:      call.remoteNumber,
      posteId:          devicePosteId,
      skipDurationCheck: true,
    });
  }

  private async resolveClientCategory(remoteNumber: string): Promise<CallTaskCategory> {
    if (!this.orderDb) return CallTaskCategory.JAMAIS_COMMANDE;

    const cmdRepo  = this.orderDb.getRepository(OrderCommand);
    const userRepo = this.orderDb.getRepository(GicopUser);

    let clientIdDb2: number | null = null;

    if (remoteNumber) {
      const normalized = normalizePhone(remoteNumber);
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

    const statusRepo = this.orderDb.getRepository(OrderCommandStatus);
    const latestStatus = await statusRepo
      .createQueryBuilder('s')
      .where('s.idCommande = :orderId', { orderId: order.id })
      .andWhere('s.valid = 1')
      .orderBy('s.dateEnreg', 'DESC')
      .limit(1)
      .select(['s.etat'])
      .getOne();

    if (latestStatus && ORDER_COMMAND_STATUS_ETAT_RETOUR.includes(latestStatus.etat)) {
      return CallTaskCategory.COMMANDE_ANNULEE;
    }

    if (order.dateLivree != null) return CallTaskCategory.COMMANDE_AVEC_LIVRAISON;

    return CallTaskCategory.JAMAIS_COMMANDE;
  }

  /**
   * Scanne call_event (DB1) pour les appels outgoing ≥ 90s non encore validés,
   * résout le poste via commercial_id ou device_id→call_device, et retente le
   * matching d'obligation. Ne dépend pas du curseur DB2 — couvre les appels historiques.
   */
  async retryUnmatchedObligations(): Promise<{ retried: number; matched: number }> {
    if (!this.obligationService) return { retried: 0, matched: 0 };
    if (!await this.obligationService.isEnabled()) return { retried: 0, matched: 0 };

    const candidates = await this.callEventService.findEligibleForRetry({
      callStatus:         ORDER_CALL_TYPE_OUTGOING,
      minDurationSeconds: 0,
      limit:              100,
    });

    if (candidates.length === 0) return { retried: 0, matched: 0 };
    this.logger.log(`retryUnmatchedObligations: ${candidates.length} appel(s) candidat(s)`);

    let retried = 0;
    let matched = 0;

    for (const event of candidates) {
      let posteId: string | null = null;

      // Résolution 1 : commercial_id → WhatsappCommercial → poste
      if (event.commercial_id) {
        const commercial = await this.commercialRepo.findOne({
          where:     { id: event.commercial_id },
          relations: { poste: true },
        });
        posteId = commercial?.poste?.id ?? null;
      }

      // Résolution 2 (fallback) : device_id → call_device → poste associé
      if (!posteId && event.device_id) {
        const device = await this.callDeviceRepo.findOne({ where: { deviceId: event.device_id } });
        posteId = device?.posteId ?? null;
      }

      if (!posteId) continue; // Attribution impossible — sera retenté au prochain cycle

      // Résolution catégorie depuis DB2 (même logique que le flux temps réel)
      const resolvedCategory = event.client_phone
        ? await this.resolveClientCategory(event.client_phone).catch(() => null)
        : null;

      retried++;
      const log = await this.syncLog.createPending('call_validation', event.external_id, 'call_event');

      try {
        const result = await this.obligationService.tryMatchCallToTask({
          callEventId:      event.external_id,
          durationSeconds:  event.duration_seconds,
          clientPhone:      event.client_phone,
          commercialPhone:  event.commercial_phone,
          posteId,
          resolvedCategory,
          skipDurationCheck: true,
        });

        if (result.matched) {
          matched++;
          await this.syncLog.markSuccess(log.id);
        } else {
          await this.syncLog.markFailed(log.id, result.reason ?? 'unknown', true);
        }
      } catch (err) {
        await this.syncLog.markFailed(log.id, (err as Error).message);
        this.logger.error(
          `retryUnmatchedObligations erreur ${event.external_id}: ${(err as Error).message}`,
        );
      }
    }

    if (retried > 0) {
      this.logger.log(
        `retryUnmatchedObligations: ${retried} retentative(s), ${matched} obligation(s) validée(s)`,
      );
    }
    return { retried, matched };
  }

  async getMissedCallsSince(localNumber: string, since: Date): Promise<OrderCallLog[]> {
    if (!this.orderDb) return [];

    const callRepo = this.orderDb.getRepository(OrderCallLog);
    return callRepo.find({
      where: {
        localNumber,
        callType:      ORDER_CALL_TYPE_MISSED,
        callTimestamp: MoreThan(since),
      },
      order: { callTimestamp: 'DESC' },
      take:  50,
    });
  }

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

  async syncCommercialMapping(): Promise<{ synced: number; skipped: number; errors: number }> {
    if (!this.dbAvailable || !this.orderDb) {
      return { synced: 0, skipped: 0, errors: 0 };
    }

    const commercials = await this.commercialRepo.find({
      where: { deletedAt: IsNull() },
      select: ['id', 'name', 'phone'],
    });

    const userRepo = this.orderDb.getRepository(GicopUser);
    const db2Users = await userRepo
      .createQueryBuilder('u')
      .where('u.type = :type', { type: GIOCOP_USER_TYPE_COMMERCIAL })
      .andWhere('u.idPoste IS NOT NULL')
      .andWhere('u.valid = 1')
      .select(['u.id', 'u.phone'])
      .getMany();

    const db2ByPhone = new Map<string, number>();
    for (const u of db2Users) {
      if (u.phone) db2ByPhone.set(normalizePhone(u.phone), u.id);
    }

    const existingMappings = await this.mappingRepo.find();
    const mappingByCommercialId = new Map(existingMappings.map(m => [m.commercial_id, m]));

    let synced = 0, skipped = 0, errors = 0;

    for (const commercial of commercials) {
      try {
        if (!commercial.phone) { skipped++; continue; }

        const db2Id = db2ByPhone.get(normalizePhone(commercial.phone));
        if (db2Id == null) { skipped++; continue; }

        const existing = mappingByCommercialId.get(commercial.id);
        if (existing) {
          if (existing.external_id !== db2Id) {
            // N11 — Changement d'external_id : warn car peut indiquer un problème de données
            this.logger.warn(
              `[CommercialMapping] Changement external_id détecté commercial=${commercial.id} ${existing.external_id}→${db2Id}`,
            );
          }
          if (existing.external_id !== db2Id || existing.commercial_name !== commercial.name) {
            existing.external_id = db2Id;
            existing.commercial_name = commercial.name;
            await this.mappingRepo.save(existing);
            synced++;
          } else {
            skipped++;
          }
        } else {
          await this.mappingRepo.save(
            this.mappingRepo.create({
              commercial_id:   commercial.id,
              external_id:     db2Id,
              commercial_name: commercial.name,
            }),
          );
          synced++;
        }
      } catch (err) {
        errors++;
        this.logger.error(`Erreur mapping commercial ${commercial.id}: ${(err as Error).message}`);
      }
    }

    this.logger.log(
      `Sync commercial_identity_mapping - ${synced} sync, ${skipped} ignores, ${errors} erreurs`,
    );
    return { synced, skipped, errors };
  }

  /**
   * Synchronise client_identity_mapping : mappe chaque Contact DB1 (via téléphone)
   * vers son id entier dans GicopUser DB2.
   * Pont de résolution : Contact.phone ↔ GicopUser.phone (ou phone2).
   */
  async syncClientMapping(): Promise<{ synced: number; skipped: number; errors: number }> {
    if (!this.dbAvailable || !this.orderDb) {
      return { synced: 0, skipped: 0, errors: 0 };
    }

    // Contacts DB1 avec téléphone (non supprimés)
    const contactsDb1 = await this.contactRepo.find({
      where:  { deletedAt: IsNull() },
      select: ['id', 'phone'],
    });

    const contactByPhone = new Map<string, string>();
    for (const c of contactsDb1) {
      if (c.phone) contactByPhone.set(normalizePhone(c.phone), c.id);
    }

    if (contactByPhone.size === 0) {
      return { synced: 0, skipped: 0, errors: 0 };
    }

    // Clients DB2 avec téléphone
    const userRepo = this.orderDb.getRepository(GicopUser);
    const db2Clients = await userRepo
      .createQueryBuilder('u')
      .where('u.type = :type', { type: GIOCOP_USER_TYPE_CLIENT })
      .andWhere('u.valid = 1')
      .andWhere('(u.phone IS NOT NULL OR u.phone2 IS NOT NULL)')
      .select(['u.id', 'u.phone', 'u.phone2'])
      .getMany();

    const existingMappings = await this.clientMappingRepo.find({
      select: ['contact_id', 'external_id', 'phone_normalized'],
    });
    const mappingByContactId = new Map(existingMappings.map((m) => [m.contact_id, m]));

    let synced = 0, skipped = 0, errors = 0;

    for (const client of db2Clients) {
      try {
        const phones = [client.phone, client.phone2].filter(Boolean) as string[];
        let contactId: string | undefined;
        let matchedPhone: string | undefined;

        for (const p of phones) {
          const normalized = normalizePhone(p);
          const cId = contactByPhone.get(normalized);
          if (cId) { contactId = cId; matchedPhone = normalized; break; }
        }

        if (!contactId || !matchedPhone) { skipped++; continue; }

        const existing = mappingByContactId.get(contactId);
        if (existing) {
          if (existing.external_id !== client.id || existing.phone_normalized !== matchedPhone) {
            existing.external_id     = client.id;
            existing.phone_normalized = matchedPhone;
            await this.clientMappingRepo.save(existing);
            synced++;
          } else {
            skipped++;
          }
        } else {
          const created = await this.clientMappingRepo.save(
            this.clientMappingRepo.create({
              contact_id:       contactId,
              external_id:      client.id,
              phone_normalized: matchedPhone,
            }),
          );
          mappingByContactId.set(contactId, created);
          synced++;
        }
      } catch (err) {
        errors++;
        this.logger.error(`Erreur mapping client DB2 id=${client.id}: ${(err as Error).message}`);
      }
    }

    this.logger.log(
      `Sync client_identity_mapping — ${synced} sync, ${skipped} ignorés, ${errors} erreurs`,
    );
    return { synced, skipped, errors };
  }

  /**
   * N6 — Supprime les mappings orphelins (contact/commercial supprimés de DB1).
   */
  async cleanOrphanMappings(): Promise<{ clients: number; commercials: number }> {
    const clients = await this.clientMappingRepo
      .createQueryBuilder()
      .delete()
      .where('contact_id NOT IN (SELECT id FROM contact)')
      .execute();

    const commercials = await this.mappingRepo
      .createQueryBuilder()
      .delete()
      .where('commercial_id NOT IN (SELECT id FROM whatsapp_commercial)')
      .execute();

    const result = { clients: clients.affected ?? 0, commercials: commercials.affected ?? 0 };
    this.logger.log(`cleanOrphanMappings: ${result.clients} clients, ${result.commercials} commerciaux supprimés`);
    return result;
  }

  /**
   * N4 — Synchronise Contact.client_category depuis DB2 (source de vérité).
   * Parcourt toutes les lignes de client_identity_mapping, résout la catégorie
   * via resolveClientCategory() et met à jour le Contact DB1 si nécessaire.
   */
  async syncClientCategories(): Promise<{ updated: number; skipped: number; errors: number }> {
    if (!this.dbAvailable || !this.orderDb) {
      return { updated: 0, skipped: 0, errors: 0 };
    }

    // Itère TOUS les contacts DB1 non supprimés qui ont un numéro de téléphone.
    // Ne dépend pas de client_identity_mapping pour ne rater aucun contact.
    const contacts = await this.contactRepo.find({
      where:  { deletedAt: IsNull() },
      select: ['id', 'phone', 'client_category'],
    });

    let updated = 0;
    let skipped = 0;
    let errors  = 0;

    for (const contact of contacts) {
      try {
        const phone = normalizePhone(contact.phone);
        if (!phone) {
          skipped++;
          continue;
        }

        // Résolution catégorie depuis DB2 via téléphone
        const callCategory = await this.resolveClientCategory(phone);

        // CallTaskCategory et ClientCategory ont les mêmes valeurs string
        const newCategory = callCategory as unknown as ClientCategory;

        if (contact.client_category === newCategory) {
          skipped++;
          continue;
        }

        await this.contactRepo.update(
          { id: contact.id },
          { client_category: newCategory },
        );
        updated++;
      } catch (err) {
        errors++;
        this.logger.error(
          `syncClientCategories contact_id=${contact.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `[SyncCategories] ${updated} mis à jour, ${skipped} skippés, ${errors} erreurs`,
    );
    return { updated, skipped, errors };
  }

  /**
   * N5 — Retourne les appels non résolus (commercial introuvable), non encore retentés.
   */
  async getUnresolved(limit = 50): Promise<CallEventUnresolved[]> {
    return this.unresolvedRepo.find({
      where:  { resolvedAt: IsNull() },
      order:  { eventAt: 'DESC' },
      take:   limit,
    });
  }

  /**
   * N5 — Marque un appel non résolu comme retryé (resolved_at = now).
   * Retourne l'entité mise à jour ou null si introuvable.
   */
  async markUnresolvedRetried(id: string): Promise<CallEventUnresolved | null> {
    const item = await this.unresolvedRepo.findOne({ where: { id } });
    if (!item) return null;
    item.resolvedAt = new Date();
    return this.unresolvedRepo.save(item);
  }

  /**
   * Backfill des durées dans call_event depuis DB2.
   * Corrige les lignes dont duration_seconds = 0 mais pour lesquelles DB2 a une durée > 0.
   * Applique aussi la normalisation ms→s si nécessaire.
   */
  async backfillDurations(): Promise<{ updated: number; checked: number }> {
    if (!this.dbAvailable || !this.orderDb) return { updated: 0, checked: 0 };

    const zeroDurationIds = await this.callEventService.getExternalIdsWithZeroDuration(500);
    if (zeroDurationIds.length === 0) return { updated: 0, checked: 0 };

    const callRepo = this.orderDb.getRepository(OrderCallLog);
    const db2Calls = await callRepo.findBy({ id: In(zeroDurationIds) });

    let updated = 0;
    for (const c of db2Calls) {
      const normalized = this.normalizeDuration(c.duration);
      if (normalized > 0) {
        await this.callEventService.updateDuration(String(c.id), normalized);
        updated++;
      }
    }

    this.logger.log(`backfillDurations: ${updated}/${db2Calls.length} lignes corrigées`);
    return { updated, checked: zeroDurationIds.length };
  }

  /**
   * Backfille device_id pour les lignes call_event sans attribution (ingérées avant la migration).
   * Lit DB2, résout device_id via OrderCallLog.deviceId, et met à jour call_event.
   */
  async backfillDeviceIds(): Promise<{ updated: number; checked: number }> {
    if (!this.dbAvailable || !this.orderDb) return { updated: 0, checked: 0 };

    const noDeviceIds = await this.callEventService.getExternalIdsWithoutDeviceId(500);
    if (noDeviceIds.length === 0) return { updated: 0, checked: 0 };

    const callRepo = this.orderDb.getRepository(OrderCallLog);
    const db2Calls = await callRepo.findBy({ id: In(noDeviceIds) });

    const updates = db2Calls
      .filter((c) => c.deviceId && c.deviceId.trim() !== '')
      .map((c) => ({ externalId: String(c.id), deviceId: c.deviceId }));

    const updated = await this.callEventService.applyDeviceIdBatch(updates);
    this.logger.log(`backfillDeviceIds: ${updated}/${noDeviceIds.length} lignes mises à jour`);
    return { updated, checked: noDeviceIds.length };
  }

  /**
   * Normalise call_event.call_status en minuscules (corrige les valeurs 'OUTGOING' → 'outgoing').
   * À appeler une fois si la migration automatique n'a pas tourné.
   */
  async normalizeCallStatus(): Promise<{ updated: number }> {
    const result = await this.callEventService.normalizeCallStatusToLower();
    this.logger.log(`normalizeCallStatus: ${result} lignes mises à jour`);
    return { updated: result };
  }

  /**
   * Supprime les entrées pending en doublon dans integration_sync_log pour call_validation.
   * À appeler une fois après déploiement pour nettoyer les ~13 000 doublons accumulés.
   */
  async purgeStuckPending(): Promise<{ deleted: number }> {
    const deleted = await this.syncLog.purgeStuckPending('call_validation');
    return { deleted };
  }

  /** Initialise les batches manquants pour tous les postes (idempotent). */
  async initAllBatches(): Promise<{ created: number; alreadyActive: number } | null> {
    if (!this.obligationService) return null;
    return this.obligationService.initAllBatches();
  }

  /**
   * Diagnostic : retourne la distribution des call_status dans call_event,
   * les postes avec/sans batch actif, le feature flag, et les stats device_id.
   */
  /** Stats sur les appels sortants dans DB2 (pour diagnostic admin). */
  private async getDb2Stats(): Promise<{
    outgoingTotal: number;
    withoutLocalNumber: number;
    withDeviceId: number;
  } | null> {
    if (!this.dbAvailable || !this.orderDb) return null;

    try {
      const callRepo = this.orderDb.getRepository(OrderCallLog);
      const [outgoingTotal, withoutLocalNumber, withDeviceId] = await Promise.all([
        callRepo
          .createQueryBuilder('c')
          .where("UPPER(c.callType) = 'OUTGOING'")
          .getCount(),
        callRepo
          .createQueryBuilder('c')
          .where("UPPER(c.callType) = 'OUTGOING'")
          .andWhere('(c.localNumber IS NULL OR c.localNumber = :empty)', { empty: '' })
          .getCount(),
        callRepo
          .createQueryBuilder('c')
          .where("UPPER(c.callType) = 'OUTGOING'")
          .andWhere('c.deviceId IS NOT NULL')
          .andWhere("c.deviceId != ''")
          .getCount(),
      ]);
      return { outgoingTotal, withoutLocalNumber, withDeviceId };
    } catch {
      return null;
    }
  }

  async getDiagnostics(): Promise<{
    callStatusDistribution: Array<{ status: string; count: number }>;
    deviceStats: { withDeviceId: number; withoutDeviceId: number; withPoste: number } | null;
    retrySteps: { total: number; withStatus: number; withDuration: number; withAttribution: number; withoutSuccess: number } | null;
    activeBatchPosteIds: string[];
    obligationServiceWired: boolean;
    featureFlagEnabled: boolean;
    dbAvailable: boolean;
    eligibleForRetry: number;
    db2Stats: { outgoingTotal: number; withoutLocalNumber: number; withDeviceId: number } | null;
    errors: Record<string, string>;
  }> {
    const errors: Record<string, string> = {};

    const safe = async <T>(key: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await fn(); }
      catch (err) {
        errors[key] = (err as Error).message;
        this.logger.error(`getDiagnostics[${key}]: ${(err as Error).message}`);
        return fallback;
      }
    };

    const [callStatusDistribution, deviceStats, activeBatchPosteIds, ffEnabled, retrySteps, db2Stats] =
      await Promise.all([
        safe('callStatusDistribution', () => this.callEventService.getStatusDistribution(), []),
        safe('deviceStats',            () => this.callEventService.getDeviceStats(),         null),
        safe('activeBatchPosteIds',    () => this.obligationService ? this.obligationService.getActivePosteIds() : Promise.resolve([]), []),
        safe('featureFlagEnabled',     () => this.obligationService ? this.obligationService.isEnabled()         : Promise.resolve(false), false),
        safe('retrySteps',             () => this.callEventService.countEligibleForRetrySteps(ORDER_CALL_TYPE_OUTGOING, 0), null),
        safe('db2Stats',               () => this.getDb2Stats(), null),
      ]);

    return {
      callStatusDistribution,
      deviceStats,
      retrySteps,
      activeBatchPosteIds,
      obligationServiceWired: this.obligationService !== null && this.obligationService !== undefined,
      featureFlagEnabled: ffEnabled,
      dbAvailable: this.dbAvailable,
      eligibleForRetry: retrySteps?.withoutSuccess ?? 0,
      db2Stats,
      errors,
    };
  }

  async getStatus(): Promise<{
    dbAvailable: boolean;
    lastSyncAt: Date | null;
    processedCount: number;
  }> {
    const [cursor, callEventCount] = await Promise.all([
      this.cursorRepo.findOne({ where: { scope: CURSOR_SCOPE } }),
      this.callEventService.count(),
    ]);
    return {
      dbAvailable:    this.dbAvailable,
      lastSyncAt:     cursor?.updatedAt ?? null,
      processedCount: callEventCount,
    };
  }
}
