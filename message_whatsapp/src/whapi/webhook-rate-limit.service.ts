import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type RateBucket = {
  tokens: number;
  lastRefillMs: number;
};

@Injectable()
export class WebhookRateLimitService {
  private readonly globalLimit = this.getLimit('WEBHOOK_GLOBAL_RPS', 300);
  private readonly providerLimit = this.getLimit('WEBHOOK_PROVIDER_RPS', 150);
  private readonly ipLimit = this.getLimit('WEBHOOK_IP_RPS', 60);
  private readonly tenantLimit = this.getLimit('WEBHOOK_TENANT_RPM', 1200);

  constructor(private readonly configService: ConfigService) {}

  private readonly globalBucket = this.createBucket(this.globalLimit);
  private readonly providerBuckets = new Map<string, RateBucket>();
  private readonly ipBuckets = new Map<string, RateBucket>();
  private readonly tenantBuckets = new Map<string, RateBucket>();

  assertRateLimits(
    provider: string,
    ip: string | null,
    tenantId?: string | null,
  ): void {
    if (!this.consume(this.globalBucket, this.globalLimit)) {
      throw new HttpException(
        'Global rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const providerBucket = this.getBucket(
      this.providerBuckets,
      provider,
      this.providerLimit,
    );
    if (!this.consume(providerBucket, this.providerLimit)) {
      throw new HttpException(
        `Provider rate limit exceeded (${provider})`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (ip) {
      const ipBucket = this.getBucket(this.ipBuckets, ip, this.ipLimit);
      if (!this.consume(ipBucket, this.ipLimit)) {
        throw new HttpException(
          'IP rate limit exceeded',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    if (tenantId) {
      const tenantBucket = this.getBucket(
        this.tenantBuckets,
        tenantId,
        this.tenantLimit,
      );
      if (!this.consume(tenantBucket, this.tenantLimit, 60 * 1000)) {
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

  private getLimit(envKey: string, fallback: number): number {
    const raw = this.configService.get<string>(envKey);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return fallback;
  }
}
