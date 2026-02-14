import { Controller, Get } from '@nestjs/common';
import { WebhookMetricsService } from './webhook-metrics.service';

@Controller('metrics/webhook')
export class WebhookMetricsController {
  constructor(private readonly metricsService: WebhookMetricsService) {}

  @Get()
  getSnapshot() {
    return this.metricsService.snapshot();
  }
}
