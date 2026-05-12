import { Controller, Get, Patch, Post, Param, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { MissedCallService } from './missed-call.service';
import { MissedCallHandlerService } from './missed-call-handler.service';
import { MissedCallEventStatus } from './entities/missed-call-event.entity';

@Controller('admin/missed-calls')
@UseGuards(AdminGuard)
export class MissedCallController {
  constructor(
    private readonly missedCallService: MissedCallService,
    private readonly missedCallHandlerService: MissedCallHandlerService,
  ) {}

  /**
   * GET /admin/missed-calls/metrics
   * Métriques globales : taux SLA, délai moyen, top postes en retard
   */
  @Get('metrics')
  async getMetrics() {
    return this.missedCallService.getMetrics();
  }

  /**
   * GET /admin/missed-calls
   * Liste paginée avec filtres optionnels
   */
  @Get()
  async list(
    @Query('status') status?: MissedCallEventStatus,
    @Query('posteId') posteId?: string,
    @Query('commercialId') commercialId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.missedCallService.list({
      status,
      posteId,
      commercialId,
      dateFrom,
      dateTo,
      page:  page  ? parseInt(page,  10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  /**
   * PATCH /admin/missed-calls/:id/close
   * Fermeture manuelle d'un appel en absence
   */
  @Patch(':id/close')
  async closeManually(@Param('id') id: string) {
    await this.missedCallService.closeManually(id);
    return { ok: true };
  }

  /**
   * POST /admin/missed-calls/backfill
   * Importe les call_event historiques (call_status='no_answer') vers missed_call_event
   */
  @Post('backfill')
  async backfill() {
    return this.missedCallHandlerService.backfillFromCallEvents();
  }
}
