import { HttpException, HttpStatus, Injectable, Optional, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.module';

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

  private readonly globalBucket = this.createBucket(this.globalLimit);
  private readonly providerBuckets = new Map<string, RateBucket>();
  private readonly ipBuckets = new Map<string, RateBucket>();
  private readonly tenantBuckets = new Map<string, RateBucket>();

  private readonly redisEnabled: boolean =
    process.env['REDIS_WEBHOOK_RATE_LIMIT_ENABLED'] === 'true';

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  async assertRateLimits(
    provider: string,
    ip: string | null,
    tenantId?: string | null,
  ): Promise<void> {
    if (this.redisEnabled && this.redis) {
      const pipeline = this.redis.pipeline();
      pipeline.incr('rate:webhook:global');
      pipeline.expire('rate:webhook:global', 1, 'NX');
      pipeline.incr(`rate:webhook:provider:${provider}`);
      pipeline.expire(`rate:webhook:provider:${provider}`, 1, 'NX');
      if (ip) {
        pipeline.incr(`rate:webhook:ip:${ip}`);
        pipeline.expire(`rate:webhook:ip:${ip}`, 1, 'NX');
      }
      if (tenantId) {
        pipeline.incr(`rate:webhook:tenant:${tenantId}`);
        pipeline.expire(`rate:webhook:tenant:${tenantId}`, 60, 'NX');
      }
      const results = await pipeline.exec();

      let idx = 0;
      const globalCount = results?.[idx]?.[1] as number | null;
      idx += 2;
      if (globalCount !== null && globalCount > this.globalLimit) {
        throw new HttpException('Global rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
      }

      const providerCount = results?.[idx]?.[1] as number | null;
      idx += 2;
      if (providerCount !== null && providerCount > this.providerLimit) {
        throw new HttpException(
          `Provider rate limit exceeded (${provider})`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      if (ip) {
        const ipCount = results?.[idx]?.[1] as number | null;
        idx += 2;
        if (ipCount !== null && ipCount > this.ipLimit) {
          throw new HttpException('IP rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
        }
      }

      if (tenantId) {
        const tenantCount = results?.[idx]?.[1] as number | null;
        if (tenantCount !== null && tenantCount > this.tenantLimit) {
          throw new HttpException('Tenant quota exceeded', HttpStatus.TOO_MANY_REQUESTS);
        }
      }

      return;
    }

    if (!this.consume(this.globalBucket, this.globalLimit)) {
      throw new HttpException('Global rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    const providerBucket = this.getBucket(this.providerBuckets, provider, this.providerLimit);
    if (!this.consume(providerBucket, this.providerLimit)) {
      throw new HttpException(
        `Provider rate limit exceeded (${provider})`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (ip) {
      const ipBucket = this.getBucket(this.ipBuckets, ip, this.ipLimit);
      if (!this.consume(ipBucket, this.ipLimit)) {
        throw new HttpException('IP rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    if (tenantId) {
      const tenantBucket = this.getBucket(this.tenantBuckets, tenantId, this.tenantLimit);
      if (!this.consume(tenantBucket, this.tenantLimit, 60 * 1000)) {
        throw new HttpException('Tenant quota exceeded', HttpStatus.TOO_MANY_REQUESTS);
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
    const raw = process.env[envKey];
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return fallback;
  }
}
