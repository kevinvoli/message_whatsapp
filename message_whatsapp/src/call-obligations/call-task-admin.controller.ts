import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { CallTaskAdminService } from './call-task-admin.service';
import { CallTaskCategory, CallTaskStatus } from './entities/call-task.entity';

@Controller('admin/call-tasks')
@UseGuards(AdminGuard)
export class CallTaskAdminController {
  constructor(private readonly callTaskAdminService: CallTaskAdminService) {}

  /**
   * GET /admin/call-tasks/metrics?category=...
   * Métriques pour une catégorie d'appels GICOP
   */
  @Get('metrics')
  getMetrics(@Query('category') category: CallTaskCategory) {
    return this.callTaskAdminService.getMetrics(category);
  }

  /**
   * GET /admin/call-tasks?category=...
   * Liste paginée des call_task pour une catégorie
   */
  @Get()
  list(
    @Query('category') category: CallTaskCategory,
    @Query('status')   status?: CallTaskStatus,
    @Query('posteId')  posteId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo')   dateTo?: string,
    @Query('page')     page?: string,
    @Query('limit')    limit?: string,
  ) {
    return this.callTaskAdminService.list({
      category,
      status,
      posteId,
      dateFrom,
      dateTo,
      page:  page  ? parseInt(page,  10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }
}
