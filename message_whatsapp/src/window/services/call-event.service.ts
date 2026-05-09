import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
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

  /**
   * Retourne les call_events éligibles pour un retry de matching d'obligation :
   * - type d'appel et durée minimale respectés
   * - au moins un identifiant d'attribution (commercial_id ou device_id)
   * - aucune entrée 'success' dans integration_sync_log pour cet external_id
   */
  async findEligibleForRetry(opts: {
    callStatus: string;
    minDurationSeconds: number;
    limit?: number;
  }): Promise<CallEvent[]> {
    return this.callEventRepo
      .createQueryBuilder('e')
      .where('e.call_status = :status', { status: opts.callStatus })
      .andWhere('e.duration_seconds >= :minDuration', { minDuration: opts.minDurationSeconds })
      .andWhere('(e.commercial_id IS NOT NULL OR e.device_id IS NOT NULL)')
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM integration_sync_log l
          WHERE l.entity_type = 'call_validation'
            AND l.entity_id = e.external_id
            AND l.status = 'success'
        )`,
      )
      .orderBy('e.event_at', 'DESC')
      .take(opts.limit ?? 100)
      .getMany();
  }

  /** Retourne les external_id dont duration_seconds = 0 (pour backfill depuis DB2). */
  async getExternalIdsWithZeroDuration(limit = 500): Promise<string[]> {
    const rows = await this.callEventRepo
      .createQueryBuilder('e')
      .select('e.external_id')
      .where('e.duration_seconds = 0')
      .take(limit)
      .getMany();
    return rows.map((r) => r.external_id);
  }

  /** Met à jour duration_seconds pour un external_id donné. */
  async updateDuration(externalId: string, durationSeconds: number): Promise<void> {
    await this.callEventRepo.update({ external_id: externalId }, { duration_seconds: durationSeconds });
  }

  /** Normalise call_status en minuscules. Retourne le nombre de lignes modifiées. */
  async normalizeCallStatusToLower(): Promise<number> {
    const result = await this.callEventRepo
      .createQueryBuilder()
      .update(CallEvent)
      .set({ call_status: () => 'LOWER(call_status)' })
      .where('call_status != LOWER(call_status)')
      .execute();
    return result.affected ?? 0;
  }

  /** Stats sur la présence du device_id dans call_event (diagnostic). */
  async getDeviceStats(): Promise<{ withDeviceId: number; withoutDeviceId: number; withPoste: number }> {
    const [withDeviceId, withoutDeviceId, withPoste] = await Promise.all([
      this.callEventRepo.count({ where: { device_id: Not(IsNull()) } }),
      this.callEventRepo.count({ where: { device_id: IsNull() } }),
      // appels dont le device est associé à un poste dans call_device
      this.callEventRepo
        .createQueryBuilder('e')
        .innerJoin('call_device', 'cd', 'CONVERT(cd.device_id USING utf8mb4) COLLATE utf8mb4_unicode_ci = e.device_id AND cd.poste_id IS NOT NULL')
        .getCount(),
    ]);
    return { withDeviceId, withoutDeviceId, withPoste };
  }

  /** Breakdown step-by-step de pourquoi findEligibleForRetry retourne 0. */
  async countEligibleForRetrySteps(callStatus: string, minDuration: number): Promise<{
    total: number;
    withStatus: number;
    withDuration: number;
    withAttribution: number;
    withoutSuccess: number;
  }> {
    const [total, withStatus, withDuration, withAttribution, withoutSuccess] = await Promise.all([
      this.callEventRepo.count(),
      this.callEventRepo.count({ where: { call_status: callStatus } }),
      this.callEventRepo
        .createQueryBuilder('e')
        .where('e.call_status = :status', { status: callStatus })
        .andWhere('e.duration_seconds >= :minDuration', { minDuration })
        .getCount(),
      this.callEventRepo
        .createQueryBuilder('e')
        .where('e.call_status = :status', { status: callStatus })
        .andWhere('e.duration_seconds >= :minDuration', { minDuration })
        .andWhere('(e.commercial_id IS NOT NULL OR e.device_id IS NOT NULL)')
        .getCount(),
      this.callEventRepo
        .createQueryBuilder('e')
        .where('e.call_status = :status', { status: callStatus })
        .andWhere('e.duration_seconds >= :minDuration', { minDuration })
        .andWhere('(e.commercial_id IS NOT NULL OR e.device_id IS NOT NULL)')
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM integration_sync_log l
            WHERE l.entity_type = 'call_validation'
              AND l.entity_id = e.external_id
              AND l.status = 'success'
          )`,
        )
        .getCount(),
    ]);
    return { total, withStatus, withDuration, withAttribution, withoutSuccess };
  }

  /** Nombre d'appels éligibles au retry (call_status + durée + attribution). */
  async countEligibleForRetry(callStatus: string, minDuration: number): Promise<number> {
    return this.countEligibleForRetrySteps(callStatus, minDuration).then(r => r.withoutSuccess);
  }

  /** Distribution des valeurs de call_status (diagnostic admin). */
  async getStatusDistribution(): Promise<Array<{ status: string; count: number }>> {
    const rows = await this.callEventRepo
      .createQueryBuilder('e')
      .select('e.call_status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('e.call_status')
      .getRawMany<{ status: string; count: string }>();
    return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
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
    externalId:        string;
    commercialPhone:   string;
    commercialId:      string | null;
    clientPhone:       string;
    callStatus:        string;
    durationSeconds:   number;
    eventAt:           Date;
    deviceId?:         string | null;
    attributionSource?: string | null;
  }): Promise<void> {
    await this.callEventRepo
      .createQueryBuilder()
      .insert()
      .into(CallEvent)
      .values({
        external_id:        params.externalId,
        commercial_phone:   params.commercialPhone,
        commercial_id:      params.commercialId,
        attribution_source: params.attributionSource ?? null,
        client_phone:       params.clientPhone,
        call_status:        params.callStatus,
        duration_seconds:   params.durationSeconds,
        event_at:           params.eventAt,
        device_id:          params.deviceId ?? null,
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
