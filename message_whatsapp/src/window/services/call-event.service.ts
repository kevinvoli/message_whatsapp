import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallEvent } from '../entities/call-event.entity';

@Injectable()
export class CallEventService {
  private readonly logger = new Logger(CallEventService.name);

  constructor(
    @InjectRepository(CallEvent)
    private readonly callEventRepo: Repository<CallEvent>,
  ) {}

  /** Nombre total d'appels ingérés depuis DB2. */
  async count(): Promise<number> {
    return this.callEventRepo.count();
  }

  /** Retourne les external_id des call_event sans device_id (pour backfill). */
  async getExternalIdsWithoutDeviceId(limit = 500): Promise<string[]> {
    const rows = await this.callEventRepo
      .createQueryBuilder('e')
      .select('e.external_id')
      .where('e.device_id IS NULL')
      .take(limit)
      .getMany();
    return rows.map((r) => r.external_id);
  }

  /** Met à jour device_id pour une liste de lignes (backfill historique). */
  async applyDeviceIdBatch(updates: Array<{ externalId: string; deviceId: string }>): Promise<number> {
    if (updates.length === 0) return 0;
    let updated = 0;
    for (const { externalId, deviceId } of updates) {
      const res = await this.callEventRepo.update({ external_id: externalId }, { device_id: deviceId });
      updated += res.affected ?? 0;
    }
    return updated;
  }

  /** Historique des appels (admin). */
  async findAll(limit = 50, offset = 0): Promise<[CallEvent[], number]> {
    return this.callEventRepo.findAndCount({
      order: { created_at: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Insère un appel provenant de DB2 dans la table call_event (DB1).
   * INSERT IGNORE via orIgnore() — idempotent sur l'index UNIQUE external_id.
   */
  async ingestFromDb2(params: {
    externalId:      string;
    commercialPhone: string;
    commercialId:    string | null;
    clientPhone:     string;
    callStatus:      string;
    durationSeconds: number;
    eventAt:         Date;
    deviceId?:       string | null;
  }): Promise<void> {
    await this.callEventRepo
      .createQueryBuilder()
      .insert()
      .into(CallEvent)
      .values({
        external_id:      params.externalId,
        commercial_phone: params.commercialPhone,
        commercial_id:    params.commercialId,
        client_phone:     params.clientPhone,
        call_status:      params.callStatus,
        duration_seconds: params.durationSeconds,
        event_at:         params.eventAt,
        device_id:        params.deviceId ?? null,
      })
      .orIgnore()
      .execute();

    // Backfill commercial_id sur les lignes déjà présentes mais sans attribution
    if (params.commercialId) {
      await this.callEventRepo
        .createQueryBuilder()
        .update(CallEvent)
        .set({ commercial_id: params.commercialId })
        .where('external_id = :eid AND commercial_id IS NULL', { eid: params.externalId })
        .execute();
    }

    // Backfill device_id sur les lignes insérées avant la migration (device_id = NULL)
    if (params.deviceId) {
      await this.callEventRepo
        .createQueryBuilder()
        .update(CallEvent)
        .set({ device_id: params.deviceId })
        .where('external_id = :eid AND device_id IS NULL', { eid: params.externalId })
        .execute();
    }
  }
}
