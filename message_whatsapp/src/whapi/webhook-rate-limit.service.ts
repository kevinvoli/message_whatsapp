import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type RateBucket = {
  tokens: number;
  lastRefillMs: number;
};

@Injectable()
export class WebhookRateLimitService {
  private readonly globalBucket = this.createBucket(300);
  private readonly providerBuckets = new Map<string, RateBucket>();
  private readonly ipBuckets = new Map<string, RateBucket>();
  private readonly tenantBuckets = new Map<string, RateBucket>();

  assertRateLimits(
    provider: string,
    ip: string | null,
    tenantId?: string | null,
  ): void {
    if (!this.consume(this.globalBucket, 300)) {
      throw new HttpException('Global rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    const providerBucket = this.getBucket(this.providerBuckets, provider, 150);
    if (!this.consume(providerBucket, 150)) {
      throw new HttpException(
        `Provider rate limit exceeded (${provider})`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (ip) {
      const ipBucket = this.getBucket(this.ipBuckets, ip, 60);
      if (!this.consume(ipBucket, 60)) {
        throw new HttpException(
          'IP rate limit exceeded',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    if (tenantId) {
      const tenantBucket = this.getBucket(this.tenantBuckets, tenantId, 1200);
      if (!this.consume(tenantBucket, 1200, 60 * 1000)) {
        throw new HttpException(
          'Tenant quota exceeded',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  private createBucket(capacityPerSecond: number): RateBucket {
    return { tokens: capacityPerSecond, lastRefillMs: Date.now() };
  }

  private getBucket(
    map: Map<string, RateBucket>,
    key: string,
    capacityPerSecond: number,
  ): RateBucket {
    const existing = map.get(key);
    if (existing) {
      return existing;
    }
    const bucket = this.createBucket(capacityPerSecond);
    map.set(key, bucket);
    return bucket;
  }

  private consume(
    bucket: RateBucket,
    capacityPerUnit: number,
    refillIntervalMs = 1000,
  ): boolean {
    const now = Date.now();
    const elapsedMs = Math.max(0, now - bucket.lastRefillMs);
    const refill = (elapsedMs / refillIntervalMs) * capacityPerUnit;
    bucket.tokens = Math.min(capacityPerUnit, bucket.tokens + refill);
    bucket.lastRefillMs = now;

    if (bucket.tokens < 1) {
      return false;
    }

    bucket.tokens -= 1;
    return true;
  }
}
