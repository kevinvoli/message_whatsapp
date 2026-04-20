import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { AnalyticsService } from './analytics.service';

/**
 * P5.2 — Analytics & Reporting
 * Toutes les routes sont protégées AdminGuard.
 * tenant_id obligatoire en query param.
 */
@Controller('admin/analytics')
@UseGuards(AdminGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** KPIs résumé pour une période */
  @Get('summary')
  getSummary(
    @Query('tenant_id') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.getSummary(tenantId, from, to);
  }

  /** Volume de conversations par jour */
  @Get('conversations')
  getConversationVolume(
    @Query('tenant_id') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.getConversationVolume(tenantId, from, to);
  }

  /** Performance par agent */
  @Get('agents')
  getAgentPerformance(
    @Query('tenant_id') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.getAgentPerformance(tenantId, from, to);
  }

  /** Répartition par canal */
  @Get('channels')
  getChannelBreakdown(
    @Query('tenant_id') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.getChannelBreakdown(tenantId, from, to);
  }

  /** Classement des commerciaux (4.7) */
  @Get('ranking')
  getCommercialRanking(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.getCommercialRanking(from, to);
  }
}
