import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from 'src/auth/admin.guard';
import { BusinessMetricsService } from './business-metrics.service';

@ApiTags('Business Metrics')
@Controller('admin/business-metrics')
@UseGuards(AdminGuard)
export class BusinessMetricsController {
  constructor(private readonly service: BusinessMetricsService) {}

  @Get()
  @ApiOperation({ summary: 'Métriques flux métier critiques (24h)' })
  getMetrics() {
    return this.service.getMetrics();
  }
}
