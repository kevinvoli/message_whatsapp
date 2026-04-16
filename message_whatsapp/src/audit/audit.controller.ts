import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { AuditService, AuditQueryDto } from './audit.service';
import { AuditAction } from './entities/audit-log.entity';

/**
 * P5.4 — Consultation du journal d'audit (admin uniquement, lecture seule)
 */
@Controller('admin/audit-logs')
@UseGuards(AdminGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  query(
    @Query('tenant_id')   tenantId?: string,
    @Query('actor_id')    actorId?: string,
    @Query('entity_type') entityType?: string,
    @Query('entity_id')   entityId?: string,
    @Query('action')      action?: AuditAction,
    @Query('from')        from?: string,
    @Query('to')          to?: string,
    @Query('limit')       limit?: string,
    @Query('offset')      offset?: string,
  ) {
    const params: AuditQueryDto = {
      tenant_id:   tenantId,
      actor_id:    actorId,
      entity_type: entityType,
      entity_id:   entityId,
      action,
      from,
      to,
      limit:  limit  ? parseInt(limit)  : undefined,
      offset: offset ? parseInt(offset) : undefined,
    };
    return this.audit.query(params);
  }

  @Get('entity/:type/:id')
  getHistory(
    @Param('type') type: string,
    @Param('id')   id: string,
  ) {
    return this.audit.getEntityHistory(type, id);
  }
}
