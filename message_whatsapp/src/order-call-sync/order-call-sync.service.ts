import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, MoreThan, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CallEventService } from 'src/window/services/call-event.service';
import { ORDER_DB_AVAILABLE, ORDER_DB_DATA_SOURCE } from 'src/order-db/order-db.constants';
import {
  OrderCallLog,
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

const CURSOR_SCOPE            = 'global';
const BATCH_SIZE              = 200;
const CURSOR_LOOKBACK_MINUTES = 10;

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
      .take(BATCH_SIZE);

    const calls = await qb.getMany();

    if (calls.length === 0) {
      this.logger.debug('Sync call_logs DB2 - aucun nouvel appel');
      return { processed: 0, obligations: 0, errors: 0 };
    }

    let obligationsMatched = 0;
    let errors = 0;

    const commercialDb2Ids = [...new Set(
      calls.map((c) => c.idCommercial).filter((id): id is number => id != null),
    )];
    const commercialMappings = commercialDb2Ids.length > 0
      ? await this.mappingRepo.findBy({ external_id: In(commercialDb2Ids) })
      : [];
    const commercialIdByDb2Id = new Map(
      commercialMappings.map((m) => [m.external_id, m.commercial_id]),
    );

    for (const call of calls) {
      const commercialIdDb1 = call.idCommercial != null
        ? (commercialIdByDb2Id.get(call.idCommercial) ?? null)
        : null;

      // D2 - passer deviceId dans ingestFromDb2
      await this.callEventService.ingestFromDb2({
        externalId:      String(call.id),
        commercialPhone: call.localNumber ?? '',
        commercialId:    commercialIdDb1 ?? null,
        clientPhone:     call.remoteNumber,
        callStatus:      call.callType,
        durationSeconds: call.duration,
        eventAt:         call.callTimestamp,
        deviceId:        call.deviceId ?? null,
      });

      // D4 - Auto-decouverte device : UPSERT silencieux sur call_device
      if (call.deviceId) {
        try {
          await this.upsertCallDevice(call.deviceId, call.callTimestamp);
        } catch {
          // silencieux - ne bloque pas la sync
        }
      }

      let logId: string | null = null;
      try {
        const alreadyDone = await this.syncLog.existsForEntity('call_validation', call.id);
        if (alreadyDone) continue;

        const log = await this.processCall(call);
        logId = log.id;

        if (this.isEligibleForObligation(call)) {
          const result = await this.matchObligation(call);
          if (result?.matched) {
            obligationsMatched++;
            await this.syncLog.markSuccess(logId);
          } else if (result && !result.matched) {
            await this.syncLog.markFailed(logId, result.reason ?? 'unknown', true);
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
      `Sync call_logs DB2 - ${calls.length} appels traites, ${obligationsMatched} obligations, ${errors} erreurs`,
    );

    return { processed: calls.length, obligations: obligationsMatched, errors };
  }

  /** D4 - Insere ou met a jour l'entree call_device pour ce device_id. */
  private async upsertCallDevice(deviceId: string, callTimestamp: Date): Promise<void> {
    const existing = await this.callDeviceRepo.findOne({ where: { deviceId } });
    if (existing) {
      existing.lastSeen  = callTimestamp > existing.lastSeen ? callTimestamp : existing.lastSeen;
      existing.callCount += 1;
      await this.callDeviceRepo.save(existing);
    } else {
      await this.callDeviceRepo.save(
        this.callDeviceRepo.create({
          id:        uuidv4(),
          deviceId,
          label:     null,
          posteId:   null,
          firstSeen: callTimestamp,
          lastSeen:  callTimestamp,
          callCount: 1,
        }),
      );
    }
  }

  private async processCall(call: OrderCallLog): Promise<{ id: string }> {
    return this.syncLog.createPending('call_validation', call.id, 'call_logs');
  }

  private isEligibleForObligation(call: OrderCallLog): boolean {
    return (
      call.callType === ORDER_CALL_TYPE_OUTGOING &&
      (call.idCommercial != null || Boolean(call.localNumber))
    );
  }

  private async matchObligation(
    call: OrderCallLog,
  ): Promise<{ matched: boolean; reason?: string } | null> {
    if (!this.obligationService) return null;

    const resolvedCategory = await this.resolveClientCategory(call.idClient, call.remoteNumber);

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
      callEventId:     call.id,
      durationSeconds: call.duration,
      resolvedCategory,
      idCommercialDb2: call.idCommercial,
      idClientDb2:     call.idClient,
      commercialPhone: call.localNumber ?? undefined,
      clientPhone:     call.remoteNumber,
      posteId:         devicePosteId,
    });
  }

  private async resolveClientCategory(
    idClient: number | null,
    remoteNumber: string,
  ): Promise<CallTaskCategory> {
    if (!this.orderDb) return CallTaskCategory.JAMAIS_COMMANDE;

    const cmdRepo  = this.orderDb.getRepository(OrderCommand);
    const userRepo = this.orderDb.getRepository(GicopUser);

    let clientIdDb2 = idClient;

    if (clientIdDb2 == null && remoteNumber) {
      const normalized = remoteNumber.replace(/D/g, '');
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
      if (u.phone) db2ByPhone.set(u.phone.replace(/D/g, ''), u.id);
    }

    const existingMappings = await this.mappingRepo.find();
    const mappingByCommercialId = new Map(existingMappings.map(m => [m.commercial_id, m]));

    let synced = 0, skipped = 0, errors = 0;

    for (const commercial of commercials) {
      try {
        if (!commercial.phone) { skipped++; continue; }

        const db2Id = db2ByPhone.get(commercial.phone.replace(/D/g, ''));
        if (db2Id == null) { skipped++; continue; }

        const existing = mappingByCommercialId.get(commercial.id);
        if (existing) {
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
