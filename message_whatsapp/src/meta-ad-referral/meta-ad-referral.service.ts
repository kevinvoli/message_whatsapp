import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetaAdReferral } from './entities/meta-ad-referral.entity';
import { UnifiedReferral } from 'src/webhooks/normalization/unified-message';

@Injectable()
export class MetaAdReferralService {
  constructor(
    @InjectRepository(MetaAdReferral)
    private readonly referralRepo: Repository<MetaAdReferral>,
  ) {}

  async createIfAbsent(chatId: string, referral: UnifiedReferral): Promise<void> {
    try {
      await this.referralRepo.insert({
        id:         randomUUID(),
        chatId,
        sourceUrl:  referral.sourceUrl  ?? null,
        sourceType: referral.sourceType ?? 'unknown',
        sourceId:   referral.sourceId   ?? 'unknown',
        headline:   referral.headline   ?? null,
        body:       referral.body       ?? null,
        mediaType:  referral.mediaType  ?? null,
        imageUrl:   referral.imageUrl   ?? null,
        ctwaClid:   referral.ctwaClid   ?? null,
      });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException & { code?: string })?.code !== 'ER_DUP_ENTRY') throw err;
    }
  }
}
