import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, MoreThan, Not, Repository } from 'typeorm';
import { CommercialPlanning } from 'src/commercial-group/entities/commercial-planning.entity';
import { CallLog, CallOutcome } from 'src/call-log/entities/call_log.entity';
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
import { CallStatus, ClientCategory, Contact, ContactSource } from 'src/contact/entities/contact.entity';
import { ClientIdentityMapping } from 'src/integration/entities/client-identity-mapping.entity';
import { normalizePhone } from 'src/shared/utils/normalize-phone';
import { CallEventUnresolved } from './entities/call-event-unresolved.entity';
import { WorkScheduleService } from 'src/work-schedule/work-schedule.service';
import { MissedCallHandlerService } from 'src/missed-calls/missed-call-handler.service';
import { SystemConfigService } from 'src/system-config/system-config.service';

const CURSOR_SCOPE = 'global';

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

    @InjectRepository(CommercialPlanning)
    private readonly planningRepo: Repository<CommercialPlanning>,

    private readonly workScheduleService: WorkScheduleService,

    private readonly systemConfigService: SystemConfigService,

    @Optional()
    private readonly missedCallHandlerService: MissedCallHandlerService | null = null,
  ) {}

  async syncNewCalls(): Promise<{ processed: number; obligations: number; errors: number }> {
    if (!this.dbAvailable || !this.orderDb) {
      this.logger.debug('DB2 non disponible - sync appels ignoree');
      return { processed: 0, obligations: 0, errors: 0 };
    }

    const [batchSize, lookbackMinutesRaw, durationThreshold] = await Promise.all([
      this.systemConfigService.getNumber('ORDER_CALL_SYNC_BATCH_SIZE', 100),
      this.systemConfigService.getNumber('ORDER_CALL_SYNC_LOOKBACK_MINUTES', 10),
      this.systemConfigService.getNumber('ORDER_CALL_DURATION_MS_THRESHOLD_SEC', 7200),
    ]);
    const lookbackMinutes = Math.max(0, lookbackMinutesRaw);

    const cursor = await this.getOrCreateCursor();
    const callRepo = this.orderDb.getRepository(OrderCallLog);

    const since         = cursor.lastCallTimestamp ?? new Date(0);
    const lookbackSince = new Date(since.getTime() - lookbackMinutes * 60_000);

    const qb = callRepo
      .createQueryBuilder('c')
      .where('c.call_timestamp >= :lookbackSince', { lookbackSince })
      .orderBy('c.call_timestamp', 'ASC')
      .addOrderBy('c.id', 'ASC')
      .take(batchSize);

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

    // Pré-résolution 2 : device_id → commercial assigné au poste (priorité haute)
    // On ne filtre PAS sur isConnected — un commercial peut avoir passé l'appel sans être
    // actuellement connecté à la messagerie. Ce qui compte c'est l'assignation poste↔device.
    const allDevices = await this.callDeviceRepo.find({
      where: { posteId: Not(IsNull()) },
      select: ['deviceId', 'posteId'],
    });
    const posteIds = [...new Set(allDevices.map((d) => d.posteId!))];
    const commercialsAtPoste = posteIds.length > 0
      ? await this.commercialRepo.find({
          where: { poste: { id: In(posteIds) }, deletedAt: IsNull() },
          relations: ['poste'],
          select: { id: true, phone: true, lastConnectionAt: true, isWorkingToday: true, groupId: true, poste: { id: true } },
        })
      : [];

    // Phase 1 : Map<posteId, WhatsappCommercial[]> — supporte plusieurs commerciaux par poste
    const poolByPosteId = new Map<string, WhatsappCommercial[]>();
    for (const c of commercialsAtPoste.filter((c) => c.poste?.id)) {
      const list = poolByPosteId.get(c.poste!.id) ?? [];
      list.push(c);
      poolByPosteId.set(c.poste!.id, list);
    }

    // Enrichissement pool — remplaçants du jour (commercial_planning)
    const todayStr = new Intl.DateTimeFormat('fr-CA', {
      timeZone: process.env['TZ'] ?? 'Africa/Abidjan',
    }).format(new Date());
    const todayReplacements = await this.planningRepo.find({
      where: { type: 'exceptional', date: todayStr },
    });
    for (const r of todayReplacements) {
      if (!r.overridePosteId) continue;
      const replacer = commercialsAtPoste.find((c) => c.id === r.commercialId)
        ?? await this.commercialRepo.findOne({
          where: { id: r.commercialId, deletedAt: IsNull() },
          relations: ['poste'],
          select: { id: true, phone: true, lastConnectionAt: true, isWorkingToday: true, groupId: true, poste: { id: true } },
        });
      if (!replacer) continue;
      const pool = poolByPosteId.get(r.overridePosteId) ?? [];
      if (!pool.find((c) => c.id === replacer.id)) {
        pool.push(replacer);
        poolByPosteId.set(r.overridePosteId, pool);
      }
    }

    // ── Pré-chargements bulk pour éliminer les N+1 dans la boucle ────────────

    // Bulk 1 : call_log déjà créés pour les external_ids du batch (1 requête vs N)
    const batchExternalIds = calls.map((c) => String(c.id));
    const existingCallLogs = await this.callLogRepo.find({
      where: { callEventExternalId: In(batchExternalIds) },
      select: ['callEventExternalId'],
    });
    const callLogExistsSet = new Set(existingCallLogs.map((l) => l.callEventExternalId));

    // Bulk 2 : contacts par remoteNumber (1 requête vs N)
    const remotePhones = [
      ...new Set(
        calls
          .filter((c) => c.remoteNumber)
          .map((c) => normalizePhone(c.remoteNumber)),
      ),
    ].filter((p): p is string => Boolean(p));
    const remoteContacts = remotePhones.length > 0
      ? await this.contactRepo.find({
          where: { phone: In(remotePhones) },
          select: ['id', 'phone'],
        })
      : [];
    const contactByRemotePhone = new Map(remoteContacts.map((c) => [c.phone, c]));

    // Bulk 3 : syncLog existants pour les appels éligibles (1 requête vs N)
    const eligibleExternalIds = calls
      .filter((c) => this.isEligibleForObligation(c))
      .map((c) => String(c.id));
    const alreadyProcessedSet = await this.syncLog.existsAnyInBatch(
      'call_validation',
      eligibleExternalIds,
    );

    // ── Passe de résolution commerciaux (async, avec scheduleCache) ──────────
    // On résout TOUS les commerciaux en premier pour constituer la liste des IDs
    // nécessaires, puis on bulk-charge les postes en une seule requête.
    const scheduleCache          = new Map<string, string[]>();
    const workingTodayIds        = new Set<string>();
    const resolvedCommercialsMap = new Map<string, { id: string | null; source: string | null }>();

    for (const call of calls) {
      const normalizedLocal = normalizePhone(call.localNumber);
      let commercialIdDb1: string | null = null;
      let attributionSource: string | null = null;

      if (call.deviceId) {
        const device = allDevices.find((d) => d.deviceId === call.deviceId);
        if (device?.posteId) {
          const pool = poolByPosteId.get(device.posteId) ?? [];
          if (pool.length > 0) {
            commercialIdDb1 = await this.resolveCommercialForDevice(
              pool, call.localNumber, call.callTimestamp, scheduleCache,
            );
            if (commercialIdDb1) attributionSource = 'device_poste';
          }
        }
      }
      if (!commercialIdDb1 && normalizedLocal) {
        commercialIdDb1 = commercialByPhone.get(normalizedLocal) ?? null;
        if (commercialIdDb1) attributionSource = 'phone';
      }
      resolvedCommercialsMap.set(String(call.id), { id: commercialIdDb1, source: attributionSource });
      if (commercialIdDb1) workingTodayIds.add(commercialIdDb1);
    }

    // Bulk 4 : commerciaux avec poste (FIX-H5) — 1 requête pour tout le batch
    const commercialIdsNeeded = [...new Set(
      [...resolvedCommercialsMap.values()]
        .map((v) => v.id)
        .filter((id): id is string => id !== null),
    )];
    const commercialsWithPoste = commercialIdsNeeded.length > 0
      ? await this.commercialRepo.find({
          where: { id: In(commercialIdsNeeded) },
          relations: ['poste'],
          select: { id: true, name: true, poste: { id: true } },
        })
      : [];
    const commercialWithPosteMap = new Map(commercialsWithPoste.map((c) => [c.id, c]));

    // Bulk 5 : is_working_today — 1 UPDATE pour tout le batch (remplace N updates individuels)
    if (workingTodayIds.size > 0) {
      await this.commercialRepo
        .createQueryBuilder()
        .update()
        .set({ isWorkingToday: true, workingTodaySince: new Date() })
        .where('id IN (:...ids)', { ids: [...workingTodayIds] })
        .andWhere('isWorkingToday = :val', { val: false })
        .execute();
    }

    // ── Boucle principale — requêtes SQL minimisées par itération ────────────
    for (const call of calls) {
      const externalId        = String(call.id);
      const resolved          = resolvedCommercialsMap.get(externalId)!;
      const commercialIdDb1   = resolved.id;
      const attributionSource = resolved.source;
      const durationSec       = this.normalizeDurationSync(call.duration, durationThreshold);

      // D2 - passer deviceId dans ingestFromDb2
      await this.callEventService.ingestFromDb2({
        externalId,
        commercialPhone:   call.localNumber ?? '',
        commercialId:      commercialIdDb1 ?? null,
        clientPhone:       call.remoteNumber,
        callStatus:        call.callType.toLowerCase(),
        durationSeconds:   durationSec,
        eventAt:           call.callTimestamp,
        deviceId:          call.deviceId ?? null,
        attributionSource,
      });

      // B — Créer un call_log automatique depuis cet appel (idempotent via callEventExternalId)
      if (commercialIdDb1 !== null) {
        try {
          if (!callLogExistsSet.has(externalId)) {
            const clientContact = contactByRemotePhone.get(
              normalizePhone(call.remoteNumber ?? ''),
            ) ?? null;

            const commercial      = commercialWithPosteMap.get(commercialIdDb1) ?? null;
            const resolvedPosteId: string | null = commercial?.poste?.id ?? null;
            const callType        = call.callType.toLowerCase();
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
                client_phone:         normalizePhone(call.remoteNumber ?? '') || null,
                commercial_id:        commercialIdDb1,
                commercial_name:      commercial?.name ?? 'Commercial inconnu',
                called_at:            call.callTimestamp,
                call_status:          mappedStatus,
                outcome:              mappedOutcome,
                duration_sec:         durationSec,
                notes:                null,
                treated:              false,
                poste_id:             resolvedPosteId,
                callEventExternalId:  externalId,
              }),
            );

            if (clientContact) {
              await this.contactRepo.update(clientContact.id, { call_status: mappedStatus });
            }

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
              externalId,
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

      // Appel en absence (missed) : créer tâche de rappel via MissedCallHandlerService
      if (call.callType.toLowerCase() === ORDER_CALL_TYPE_MISSED && this.missedCallHandlerService) {
        const resolvedPosteId = call.deviceId
          ? (allDevices.find((d) => d.deviceId === call.deviceId)?.posteId ?? null)
          : null;
        this.missedCallHandlerService.handle({
          source:       'db2',
          externalId,
          clientPhone:  call.remoteNumber ?? '',
          posteId:      resolvedPosteId,
          commercialId: commercialIdDb1,
          deviceId:     call.deviceId ?? null,
          occurredAt:   call.callTimestamp,
        }).catch((err: Error) =>
          this.logger.warn(`missedCallHandler.handle failed for call ${call.id}: ${err.message}`),
        );
      }

      if (!this.isEligibleForObligation(call)) continue;

      let logId: string | null = null;
      try {
        // alreadyProcessedSet chargé en bulk avant la boucle
        if (alreadyProcessedSet.has(externalId)) continue;

        newCalls++;
        const log = await this.processCall(call);
        logId = log.id;

        // Vérifier si cet appel sortant est un rappel d'appel en absence
        // Si oui, skip le matching GICOP (règle métier : rappel != obligation GICOP)
        let isMissedCallCallback = false;
        if (this.missedCallHandlerService) {
          try {
            const resolvedPosteId = call.deviceId
              ? (allDevices.find((d) => d.deviceId === call.deviceId)?.posteId ?? null)
              : null;
            if (resolvedPosteId) {
              isMissedCallCallback = await this.missedCallHandlerService.onOutgoingCallDetected({
                callEventExternalId: externalId,
                posteId:             resolvedPosteId,
                commercialId:        commercialIdDb1 ?? '',
                clientPhone:         normalizePhone(call.remoteNumber ?? ''),
                occurredAt:          call.callTimestamp,
                durationSeconds:     durationSec,
              });
            }
          } catch (err) {
            this.logger.warn(`onOutgoingCallDetected failed for call ${call.id}: ${(err as Error).message}`);
          }
        }

        if (isMissedCallCallback) {
          this.logger.log(`MISSED_CALL_CALLBACK call.id=${call.id} — skip matching obligation GICOP`);
          await this.syncLog.markSuccess(logId!);
          continue;
        }

        const result = await this.matchObligation(call, durationThreshold);
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

    // FIX-C1: Si batch plein => possible troncature, ne pas avancer le curseur
    if (calls.length >= batchSize) {
      this.logger.warn(
        'Sync DB2 : batch plein (' + batchSize + ' appels) — possible troncature. Curseur NON avance, prochain cycle relira depuis le meme point.',
      );
      await this.recalculateDeviceCounts().catch((err: Error) =>
        this.logger.warn('recalculateDeviceCounts: ' + err.message),
      );
      return { processed: newCalls, obligations: obligationsMatched, errors };
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

  /**
   * Phase 4 — Cascade de sélection dans un pool de commerciaux pour un device donné.
   * Étape 1 : is_working_today ; Étape 2 : planning de groupe ; Étape 3 : tiebreaker local_number ; Étape 4 : dernier connecté.
   */
  private async resolveCommercialForDevice(
    pool: WhatsappCommercial[],
    localNumber: string | null,
    callTimestamp: Date,
    scheduleCache: Map<string, string[]>,
  ): Promise<string | null> {
    // Étape 1 : groupe planifié à l'heure de l'appel (priorité principale)
    // Un commercial dont le groupe a un planning actif à ce moment est le destinataire naturel.
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayOfWeek = days[callTimestamp.getDay()];
    const hh = String(callTimestamp.getHours()).padStart(2, '0');
    const mm = String(callTimestamp.getMinutes()).padStart(2, '0');
    const cacheKey = `${dayOfWeek}|${hh}:${mm}`;

    if (!scheduleCache.has(cacheKey)) {
      scheduleCache.set(cacheKey, await this.workScheduleService.getActiveGroupIds(callTimestamp));
    }
    const activeGroupIds = scheduleCache.get(cacheKey)!;

    const bySchedule = pool.filter((c) => c.groupId && activeGroupIds.includes(c.groupId));
    const step1 = bySchedule.length > 0 ? bySchedule : pool;
    if (step1.length === 1) return step1[0].id;

    // Étape 2 : is_working_today (parmi les commerciaux du groupe planifié)
    const working = step1.filter((c) => c.isWorkingToday);
    const step2 = working.length > 0 ? working : step1;
    if (step2.length === 1) return step2[0].id;

    // Étape 3 : tiebreaker local_number → commercial.phone
    if (localNumber) {
      const norm = normalizePhone(localNumber);
      const byPhone = step2.find((c) => c.phone && normalizePhone(c.phone) === norm);
      if (byPhone) return byPhone.id;
    }

    // FIX-H1: Tiebreaker déterministe — tri alphabétique sur UUID si lastConnectionAt identique
    const sorted = [...step2].sort((a, b) => {
      const diff =
        (b.lastConnectionAt?.getTime() ?? 0) - (a.lastConnectionAt?.getTime() ?? 0);
      if (diff !== 0) return diff;
      // Tiebreaker deterministe : tri alphabetique sur l'UUID
      return a.id.localeCompare(b.id);
    });
    if (sorted.length > 1) {
      this.logger.debug(
        'FIX-H1 tiebreaker: ' + sorted.length + ' candidats pour device, resolu: ' + sorted[0].id,
      );
    }
    return sorted[0]?.id ?? null;
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
   * FIX-C5: Normalise la duree DB2 en secondes avec seuil robuste.
   * Si raw > ORDER_CALL_DURATION_MS_THRESHOLD_SEC (defaut 7200), interprete comme ms.
   * Couvre: appels <= 2h stockes en s, et toutes durees en ms <= 2h*1000.
   * Version async — charge le threshold depuis la config (usage isolé hors boucle).
   */
  private async normalizeDuration(raw: number): Promise<number> {
    if (!raw) return 0;
    if (raw < 0) return 0;
    const threshold = await this.systemConfigService.getNumber('ORDER_CALL_DURATION_MS_THRESHOLD_SEC', 7200);
    return this.normalizeDurationSync(raw, threshold);
  }

  /**
   * Version synchrone de normalizeDuration avec threshold pré-chargé.
   * À utiliser dans les boucles pour éviter un appel config par itération.
   */
  private normalizeDurationSync(raw: number, threshold: number): number {
    if (!raw || raw < 0) return 0;
    if (raw > threshold) {
      const asSec = Math.round(raw / 1000);
      this.logger.debug('normalizeDuration: ' + raw + ' -> ms -> ' + asSec + 's');
      return asSec;
    }
    return raw;
  }

  /** Log CALL_MATCHED_ERP_ONLY quand le client validant l'obligation n'a pas de compte WhatsApp. */
  private async logIfErpOnly(phone: string, callEventId: string | number): Promise<void> {
    try {
      const normalized = normalizePhone(phone);
      if (!normalized) return;
      const contact = await this.contactRepo.findOne({
        where:  { phone: normalized },
        select: ['id', 'contactSource'],
      });
      if (!contact || contact.contactSource === ContactSource.ErpImport) {
        this.logger.log(
          `CALL_MATCHED_ERP_ONLY callEventId=${callEventId} phone=${normalized}`,
        );
      }
    } catch { /* non bloquant */ }
  }

  private isEligibleForObligation(call: OrderCallLog): boolean {
    return (
      call.callType.toLowerCase() === ORDER_CALL_TYPE_OUTGOING &&
      (Boolean(call.localNumber) || Boolean(call.deviceId))
    );
  }

  private async matchObligation(
    call: OrderCallLog,
    durationThreshold?: number,
  ): Promise<{ matched: boolean; reason?: string } | null> {
    if (!this.obligationService) return null;

    // Circuit breaker : si DB2 indisponible, ne pas matcher avec une catégorie incorrecte.
    // L'appel est déjà dans call_event (DB1) — retryUnmatchedObligations() le reprendra
    // automatiquement toutes les 5 min quand DB2 reviendra.
    if (!this.orderDb) {
      try {
        const durationSec = durationThreshold !== undefined
          ? this.normalizeDurationSync(call.duration, durationThreshold)
          : await this.normalizeDuration(call.duration);
        await this.unresolvedRepo.upsert(
          {
            externalId:  String(call.id),
            localNumber: call.localNumber ?? null,
            remoteNumber: call.remoteNumber ?? null,
            deviceId:    call.deviceId ?? null,
            callType:    call.callType ?? null,
            durationSec,
            eventAt:     call.callTimestamp,
            reason:      'db2_unavailable',
            resolvedAt:  null,
          },
          { conflictPaths: ['externalId'], skipUpdateIfNoValuesChanged: true },
        );
      } catch { /* non bloquant */ }
      return { matched: false, reason: 'db2_unavailable' };
    }

    const durationSec = durationThreshold !== undefined
      ? this.normalizeDurationSync(call.duration, durationThreshold)
      : await this.normalizeDuration(call.duration);

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

    const result = await this.obligationService.tryMatchCallToTask({
      callEventId:       call.id,
      durationSeconds:   durationSec,
      resolvedCategory,
      commercialPhone:   call.localNumber ?? undefined,
      clientPhone:       call.remoteNumber,
      posteId:           devicePosteId,
      skipDurationCheck: true,
    });

    if (result.matched && call.remoteNumber) {
      await this.logIfErpOnly(call.remoteNumber, call.id);
    }

    return result;
  }

  /**
   * Résout la catégorie client à partir de son ID DB2.
   * Méthode publique pour pouvoir être appelée depuis ErpClientSyncService.
   *
   * Règles métier (validées 2026-05-11) :
   * 1. LIVRÉ    = au moins UNE livraison historique (dateLivree non nulle et non annulée)
   * 2. ANNULÉ   = aucune livraison ET dernière commande annulée (trueCancel ou statut retour)
   * 3. SANS CMD = jamais commandé OU commande en cours non encore livrée
   */
  async resolveCategoryByClientId(
    clientIdDb2: number,
    orderDb: DataSource,
  ): Promise<CallTaskCategory> {
    const cmdRepo = orderDb.getRepository(OrderCommand);

    const orders = await cmdRepo
      .createQueryBuilder('c')
      .where('c.idClient = :clientIdDb2', { clientIdDb2 })
      .andWhere('c.valid = 1')
      .select(['c.id', 'c.trueCancel', 'c.dateLivree', 'c.dateEnreg'])
      .getMany();

    if (orders.length === 0) return CallTaskCategory.JAMAIS_COMMANDE;

    // Priorité absolue : au moins une livraison réelle (non annulée)
    const hasAnyDelivery = orders.some(o => o.dateLivree != null && o.trueCancel !== 1);
    if (hasAnyDelivery) return CallTaskCategory.COMMANDE_AVEC_LIVRAISON;

    // Pas de livraison — regarder uniquement la dernière commande pour l'annulation
    const lastOrder = [...orders].sort(
      (a, b) => (b.dateEnreg ? new Date(b.dateEnreg).getTime() : 0)
              - (a.dateEnreg ? new Date(a.dateEnreg).getTime() : 0),
    )[0];

    if (lastOrder.trueCancel === 1) return CallTaskCategory.COMMANDE_ANNULEE;

    const statusRepo = orderDb.getRepository(OrderCommandStatus);
    const lastStatus = await statusRepo
      .createQueryBuilder('s')
      .where('s.idCommande = :orderId', { orderId: lastOrder.id })
      .andWhere('s.valid = 1')
      .orderBy('s.dateEnreg', 'DESC')
      .limit(1)
      .select(['s.etat'])
      .getOne();

    if (lastStatus && ORDER_COMMAND_STATUS_ETAT_RETOUR.includes(lastStatus.etat)) {
      return CallTaskCategory.COMMANDE_ANNULEE;
    }

    // Commande en cours (non livrée, non annulée) = sans commande (règle métier)
    return CallTaskCategory.JAMAIS_COMMANDE;
  }

  private async resolveClientCategory(remoteNumber: string): Promise<CallTaskCategory> {
    if (!this.orderDb) return CallTaskCategory.JAMAIS_COMMANDE;

    const userRepo = this.orderDb.getRepository(GicopUser);

    let clientIdDb2: number | null = null;

    if (remoteNumber) {
      const normalized = normalizePhone(remoteNumber);
      const raw = remoteNumber; // FIX-M3: chercher aussi avec le numero brut non normalise
      const user = await userRepo
        .createQueryBuilder('u')
        .where('u.type = :type', { type: GIOCOP_USER_TYPE_CLIENT })
        .andWhere(
          // Recherche sur numero normalise ET numero brut (DB2 peut avoir formats differents)
          '(u.phone = :norm OR u.phone2 = :norm OR u.phone = :raw OR u.phone2 = :raw)',
          { norm: normalized, raw },
        )
        .andWhere('u.valid = 1')
        .select(['u.id'])
        .getOne();

      clientIdDb2 = user?.id ?? null;
    }

    if (clientIdDb2 == null) return CallTaskCategory.JAMAIS_COMMANDE;

    const resolvedCategory = await this.resolveCategoryByClientId(clientIdDb2, this.orderDb);

    // FIX-M1: Upsert contact DB1 cohérent — chercher sur phone ET phone2 du client DB2
    try {
      const normalized = normalizePhone(remoteNumber);
      // Récupérer phone2 du client DB2 pour éviter un contact en double
      let phone2Normalized: string | null = null;
      if (clientIdDb2) {
        const gicopUser = await userRepo.findOne({ where: { id: clientIdDb2 }, select: ['phone2'] });
        phone2Normalized = gicopUser?.phone2 ? normalizePhone(gicopUser.phone2) : null;
      }

      // Chercher un contact existant sur phone principal ET phone alternatif
      const whereConditions: any[] = [{ phone: normalized }];
      if (phone2Normalized && phone2Normalized !== normalized) {
        whereConditions.push({ phone: phone2Normalized });
      }
      const existing = await this.contactRepo.findOne({
        where: whereConditions,
        select: ['id', 'phone', 'contactSource'],
      });

      // Utiliser le numéro canonique (toujours phone principal DB2, pas phone2)
      const contactPhone = existing?.phone ?? normalized;

      if (existing) {
        // Met à jour catégorie et order_client_id, préserve contactSource existant
        await this.contactRepo.update(existing.id, {
          client_category: resolvedCategory as unknown as ClientCategory,
          order_client_id: clientIdDb2,
        });
      } else {
        // Crée un nouveau contact ERP-only avec le numéro principal (pas phone2)
        await this.contactRepo.save(
          this.contactRepo.create({
            phone:              contactPhone,
            name:               contactPhone,
            contactSource:      ContactSource.ErpImport,
            order_client_id:    clientIdDb2,
            client_category:    resolvedCategory as unknown as ClientCategory,
            call_status:        CallStatus.À_APPeler,
            conversion_status:  'client',
          }),
        );
      }
    } catch (err) {
      this.logger.warn(
        'Upsert contact ERP échoué pour ' + remoteNumber + ': ' + (err as Error).message,
      );
    }

    return resolvedCategory;
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
          if (event.client_phone) {
            await this.logIfErpOnly(event.client_phone, event.external_id);
          }
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
      select: ['id', 'contact_id', 'external_id', 'phone_normalized'],
    });
    const mappingByContactId  = new Map(existingMappings.map((m) => [m.contact_id,  m]));
    const mappingByExternalId = new Map(existingMappings.map((m) => [m.external_id, m]));

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

        const byContact  = mappingByContactId.get(contactId);
        const byExternal = mappingByExternalId.get(client.id);

        if (byContact) {
          // Le contact est déjà mappé — mise à jour si external_id ou téléphone a changé
          if (byContact.external_id !== client.id || byContact.phone_normalized !== matchedPhone) {
            // Libérer l'ancien external_id des deux maps avant de modifier
            mappingByExternalId.delete(byContact.external_id);
            byContact.external_id      = client.id;
            byContact.phone_normalized = matchedPhone;
            await this.clientMappingRepo.save(byContact);
            mappingByExternalId.set(client.id, byContact);
            synced++;
          } else {
            skipped++;
          }
        } else if (byExternal) {
          // external_id déjà en base pour un autre contact — réassigner
          mappingByContactId.delete(byExternal.contact_id);
          byExternal.contact_id      = contactId;
          byExternal.phone_normalized = matchedPhone;
          await this.clientMappingRepo.save(byExternal);
          mappingByContactId.set(contactId, byExternal);
          synced++;
        } else {
          // Nouveau mapping
          const created = await this.clientMappingRepo.save(
            this.clientMappingRepo.create({
              contact_id:       contactId,
              external_id:      client.id,
              phone_normalized: matchedPhone,
            }),
          );
          mappingByContactId.set(contactId, created);
          mappingByExternalId.set(client.id, created);
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

    // Résolution DB2 par contact (inévitable — requête par numéro de téléphone)
    // Collecte d'abord tous les changements nécessaires, puis batch UPDATE par catégorie
    const pendingUpdates: Array<{ id: string; category: ClientCategory }> = [];

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

        pendingUpdates.push({ id: contact.id, category: newCategory });
      } catch (err) {
        errors++;
        this.logger.error(
          `syncClientCategories contact_id=${contact.id}: ${(err as Error).message}`,
        );
      }
    }

    // Batch UPDATE : 1 requête par catégorie distincte au lieu de 1 UPDATE par contact
    if (pendingUpdates.length > 0) {
      const byCategory = new Map<ClientCategory, string[]>();
      for (const { id, category } of pendingUpdates) {
        const ids = byCategory.get(category) ?? [];
        ids.push(id);
        byCategory.set(category, ids);
      }

      for (const [category, ids] of byCategory) {
        await this.contactRepo
          .createQueryBuilder()
          .update()
          .set({ client_category: category })
          .where('id IN (:...ids)', { ids })
          .execute();
      }

      updated = pendingUpdates.length;
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
   * FIX-C4: Retry automatique des appels non resolus (commercial_not_found).
   * Retraite les entrees de call_event_unresolved dont resolved_at IS NULL.
   * Appele par un cron toutes les 15 minutes dans OrderCallSyncJob.
   */
  async retryUnresolvedCalls(limit = 50): Promise<{ retried: number; resolved: number }> {
    const unresolved = await this.unresolvedRepo.find({
      where: { resolvedAt: IsNull() },
      order: { createdAt: 'ASC' },
      take: limit,
    });

    if (!unresolved.length) return { retried: 0, resolved: 0 };

    this.logger.log('retryUnresolvedCalls: ' + unresolved.length + ' appels a retenter');

    // Recalculer les maps de resolution
    const allCommercialsDb1 = await this.commercialRepo.find({
      where: { deletedAt: IsNull() },
      select: ['id', 'phone'],
    });
    const commercialByPhone = new Map(
      allCommercialsDb1
        .filter((c) => c.phone)
        .map((c) => [normalizePhone(c.phone), c.id]),
    );

    const allDevices = await this.callDeviceRepo.find({
      where: { posteId: Not(IsNull()) },
      select: ['deviceId', 'posteId'],
    });
    const posteIds = [...new Set(allDevices.map((d) => d.posteId!))];
    const commercialsAtPoste = posteIds.length > 0
      ? await this.commercialRepo.find({
          where: { poste: { id: In(posteIds) }, deletedAt: IsNull() },
          relations: ['poste'],
          select: { id: true, phone: true, lastConnectionAt: true, isWorkingToday: true, groupId: true, poste: { id: true } },
        })
      : [];
    const poolByPosteId = new Map<string, WhatsappCommercial[]>();
    for (const c of commercialsAtPoste.filter((c) => c.poste?.id)) {
      const list = poolByPosteId.get(c.poste!.id) ?? [];
      list.push(c);
      poolByPosteId.set(c.poste!.id, list);
    }
    const scheduleCache = new Map<string, string[]>();

    let retried = 0;
    let resolved = 0;

    for (const entry of unresolved) {
      retried++;
      let commercialId: string | null = null;

      // Resolution par device_id -> poste -> commercial
      if (entry.deviceId) {
        const device = allDevices.find((d) => d.deviceId === entry.deviceId);
        if (device?.posteId) {
          const pool = poolByPosteId.get(device.posteId) ?? [];
          if (pool.length > 0) {
            commercialId = await this.resolveCommercialForDevice(
              pool, entry.localNumber, new Date(), scheduleCache,
            );
          }
        }
      }

      // Fallback: local_number -> commercial.phone
      if (!commercialId && entry.localNumber) {
        const norm = normalizePhone(entry.localNumber);
        commercialId = commercialByPhone.get(norm) ?? null;
      }

      if (!commercialId) continue; // toujours non resolu

      // Marquer comme resolu
      await this.unresolvedRepo.update(entry.id, { resolvedAt: new Date() });

      // Backfill commercial_id dans call_event
      await this.callEventService.backfillCommercialId(entry.externalId, commercialId);

      this.logger.log('retryUnresolvedCalls: resolu externalId=' + entry.externalId + ' commercial=' + commercialId);
      resolved++;
    }

    this.logger.log('retryUnresolvedCalls: ' + retried + ' tentes, ' + resolved + ' resolus');
    return { retried, resolved };
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
      const normalized = await this.normalizeDuration(c.duration);
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

  /**
   * FIX-H2: Supprime les entrées call_event_unresolved non-outgoing non resolues.
   * Seuls les appels outgoing peuvent valider une obligation GICOP.
   * Appelée par un cron hebdomadaire (dimanche 5h).
   */
  async purgeNonOutgoingUnresolved(): Promise<{ deleted: number }> {
    const result = await this.unresolvedRepo.delete({
      callType: Not('outgoing'),
      resolvedAt: IsNull(),
    });
    const deleted = result.affected ?? 0;
    if (deleted > 0) {
      this.logger.log('FIX-H2 Purge call_event_unresolved non-outgoing : ' + deleted + ' lignes supprimees');
    }
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

  /**
   * FIX-H4: Remet isWorkingToday a false pour tous les commerciaux.
   * Appele par un cron quotidien a minuit dans OrderCallSyncJob.
   */
  async resetAllWorkingToday(): Promise<{ affected: number }> {
    const result = await this.commercialRepo.update(
      { isWorkingToday: true },
      { isWorkingToday: false },
    );
    return { affected: result.affected ?? 0 };
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
