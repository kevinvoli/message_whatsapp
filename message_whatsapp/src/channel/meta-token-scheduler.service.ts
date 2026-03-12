import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MetaTokenService } from './meta-token.service';

@Injectable()
export class MetaTokenSchedulerService {
  constructor(private readonly metaTokenService: MetaTokenService) {}

  // Tous les jours à 3h00 UTC
  @Cron('0 3 * * *')
  async handleDailyTokenRefresh(): Promise<void> {
    await this.metaTokenService.refreshExpiringTokens();
  }
}
