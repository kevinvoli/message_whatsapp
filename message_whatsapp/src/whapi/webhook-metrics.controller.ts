import { Controller, Get, Header } from '@nestjs/common';
import { WebhookMetricsService } from './webhook-metrics.service';

@Controller('metrics/webhook')
export class WebhookMetricsController {
  constructor(private readonly metricsService: WebhookMetricsService) {}

  @Get()
  getSnapshot() {
    return this.metricsService.snapshot();
  }

  @Get('prometheus')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  getPrometheus() {
    return this.metricsService.renderPrometheus();
  }
}
