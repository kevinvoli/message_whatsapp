import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TargetsService } from './targets.service';

@Injectable()
export class TargetsCacheInvalidatorListener {
  constructor(private readonly targets: TargetsService) {}

  @OnEvent('message.saved')
  async onMessageSaved(payload: { commercialId?: string }) {
    if (payload.commercialId) await this.targets.invalidateProgressCache(payload.commercialId);
    await this.targets.invalidateRankingCache();
    await this.targets.invalidateProgressAllCache();
  }

  @OnEvent('call_log.created')
  async onCallCreated(payload: { commercial_id?: string }) {
    if (payload.commercial_id) await this.targets.invalidateProgressCache(payload.commercial_id);
    await this.targets.invalidateRankingCache();
    await this.targets.invalidateProgressAllCache();
  }

  @OnEvent('follow_up.completed')
  async onFollowUpCompleted(payload: { commercial_id?: string }) {
    if (payload.commercial_id) await this.targets.invalidateProgressCache(payload.commercial_id);
    await this.targets.invalidateRankingCache();
    await this.targets.invalidateProgressAllCache();
  }
}
