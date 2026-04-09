import { Controller, Get, Header } from '@nestjs/common';
import { WebhookMetricsService } from './webhook-metrics.service';
import { ChannelService } from 'src/channel/channel.service';

@Controller('metrics/webhook')
export class WebhookMetricsController {
  constructor(
    private readonly metricsService: WebhookMetricsService,
    private readonly channelService: ChannelService,
  ) {}

  @Get()
  async getSnapshot() {
    const snapshot = this.metricsService.snapshot();

    // Résolution serveur : associer chaque tenant_id à son label
    const channels = await this.channelService.findAll();
    const channelLabels: Record<string, string> = {};
    for (const ch of channels) {
      if (ch.tenant_id) {
        channelLabels[ch.tenant_id] = ch.label ?? ch.channel_id;
      }
    }

    return { ...snapshot, channel_labels: channelLabels };
  }

  @Get('prometheus')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  getPrometheus() {
    return this.metricsService.renderPrometheus();
  }
}
