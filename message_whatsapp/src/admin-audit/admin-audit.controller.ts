import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAuditService } from './admin-audit.service';
import { QueryAdminAuditDto } from './dto/query-admin-audit.dto';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { AdminGuard } from '../auth/admin.guard';

@Controller('admin-audit')
@UseGuards(AdminGuard)
export class AdminAuditController {
  constructor(private readonly adminAuditService: AdminAuditService) {}

  @Get()
  findAll(
    @Query() query: QueryAdminAuditDto,
  ): Promise<{ data: AdminAuditLog[]; total: number }> {
    return this.adminAuditService.findAll(query);
  }
}
