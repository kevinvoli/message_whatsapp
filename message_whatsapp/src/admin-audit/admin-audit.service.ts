import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { QueryAdminAuditDto } from './dto/query-admin-audit.dto';

const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'token',
  'webhook_secret',
  'meta_app_secret',
  'system_token',
  'verify_token',
  'password',
]);

@Injectable()
export class AdminAuditService {
  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly repo: Repository<AdminAuditLog>,
  ) {}

  async log(
    adminId: string,
    action: string,
    targetEntity: string,
    targetId: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const sanitized = this.sanitizePayload(payload);
    await this.repo.save(
      this.repo.create({ adminId, action, targetEntity, targetId, payload: sanitized }),
    );
  }

  async findAll(query: QueryAdminAuditDto): Promise<{ data: AdminAuditLog[]; total: number }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 100);

    const qb = this.repo.createQueryBuilder('log');

    if (query.adminId) {
      qb.andWhere('log.adminId = :adminId', { adminId: query.adminId });
    }
    if (query.action) {
      qb.andWhere('log.action = :action', { action: query.action });
    }
    if (query.targetEntity) {
      qb.andWhere('log.targetEntity = :targetEntity', { targetEntity: query.targetEntity });
    }

    qb.orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  private sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (!SENSITIVE_KEYS.has(key)) {
        result[key] = value;
      }
    }
    return result;
  }
}
