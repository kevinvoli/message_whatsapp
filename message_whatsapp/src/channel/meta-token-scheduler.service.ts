import { Injectable, OnModuleInit } from '@nestjs/common';
import { CronConfigService } from 'src/jorbs/cron-config.service';
import { MetaTokenService } from './meta-token.service';

@Injectable()
export class MetaTokenSchedulerService implements OnModuleInit {
  constructor(
    private readonly metaTokenService: MetaTokenService,
    private readonly cronConfigService: CronConfigService,
  ) {}

  onModuleInit(): void {
    this.cronConfigService.registerHandler('meta-token-refresh', async () => {
      const config = await this.cronConfigService.findByKey('meta-token-refresh');
      const thresholdDays = config.ttlDays && config.ttlDays > 0 ? config.ttlDays : 7;
      await this.metaTokenService.refreshExpiringTokens(thresholdDays);
    });
    this.cronConfigService.registerPreviewHandler('meta-token-refresh', async () => {
      const config = await this.cronConfigService.findByKey('meta-token-refresh');
      const thresholdDays = config.ttlDays && config.ttlDays > 0 ? config.ttlDays : 7;
      return this.metaTokenService.getExpiringChannels(thresholdDays);
    });
  }
}
