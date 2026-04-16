import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, LessThan, MoreThanOrEqual } from 'typeorm';
import { AuditLog, AuditAction } from './entities/audit-log.entity';

export interface LogAuditDto {
  tenant_id?: string;
  actor_id?: string;
  actor_name?: string;
  actor_type?: 'admin' | 'commercial' | 'system';
  action: AuditAction;
  entity_type?: string;
  entity_id?: string;
  diff?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface AuditQueryDto {
  tenant_id?: string;
  actor_id?: string;
  entity_type?: string;
  entity_id?: string;
  action?: AuditAction;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  /**
   * Enregistre une entrée d'audit immuable.
   * Ne lève jamais d'exception : l'échec de l'audit ne doit pas bloquer l'action métier.
   */
  async log(dto: LogAuditDto): Promise<void> {
    try {
      const entry = this.auditRepo.create({
        tenant_id:   dto.tenant_id  ?? null,
        actor_id:    dto.actor_id   ?? null,
        actor_name:  dto.actor_name ?? null,
        actor_type:  dto.actor_type ?? null,
        action:      dto.action,
        entity_type: dto.entity_type ?? null,
        entity_id:   dto.entity_id   ?? null,
        diff:        dto.diff ?? null,
        meta:        dto.meta ?? null,
      });
      await this.auditRepo.save(entry);
    } catch {
      // Silencieux — l'audit ne doit jamais bloquer l'action principale
    }
  }

  /**
   * Recherche dans le journal d'audit avec filtres et pagination.
   */
  async query(params: AuditQueryDto): Promise<{ items: AuditLog[]; total: number }> {
    const qb = this.auditRepo.createQueryBuilder('a').orderBy('a.createdAt', 'DESC');

    if (params.tenant_id)  qb.andWhere('a.tenant_id = :tid',    { tid: params.tenant_id });
    if (params.actor_id)   qb.andWhere('a.actor_id = :aid',     { aid: params.actor_id });
    if (params.entity_type) qb.andWhere('a.entity_type = :et',  { et: params.entity_type });
    if (params.entity_id)  qb.andWhere('a.entity_id = :eid',    { eid: params.entity_id });
    if (params.action)     qb.andWhere('a.action = :action',    { action: params.action });
    if (params.from)       qb.andWhere('a.createdAt >= :from',  { from: new Date(params.from) });
    if (params.to)         qb.andWhere('a.createdAt <= :to',    { to: new Date(params.to) });

    const limit  = Math.min(params.limit  ?? 50, 500);
    const offset = params.offset ?? 0;

    const [items, total] = await qb.skip(offset).take(limit).getManyAndCount();
    return { items, total };
  }

  /**
   * Retourne l'historique complet d'une entité.
   */
  async getEntityHistory(entityType: string, entityId: string): Promise<AuditLog[]> {
    return this.auditRepo.find({
      where: { entity_type: entityType, entity_id: entityId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  /**
   * Purge les entrées plus anciennes que `olderThanDays` jours.
   * Appelé par un cron de rétention.
   */
  async purgeOlderThan(olderThanDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 3600 * 1000);
    const result = await this.auditRepo.delete({ createdAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }
}
