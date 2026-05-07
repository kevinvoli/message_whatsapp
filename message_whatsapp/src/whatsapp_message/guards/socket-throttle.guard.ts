import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.module';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface ThrottleConfig {
  maxRequests: number;
  windowMs: number;
}

@Injectable()
export class SocketThrottleGuard {
  private readonly logger = new Logger(SocketThrottleGuard.name);
  private readonly buckets = new Map<string, TokenBucket>();
  private cleanupTimer: ReturnType<typeof setInterval>;
  private readonly redisEnabled: boolean;

  private readonly limits: Record<string, ThrottleConfig> = {
    'message:send': { maxRequests: 10, windowMs: 10_000 },
    'messages:get': { maxRequests: 30, windowMs: 10_000 },
    'conversations:get': { maxRequests: 20, windowMs: 10_000 },
    'chat:event': { maxRequests: 20, windowMs: 10_000 },
    'messages:read': { maxRequests: 20, windowMs: 10_000 },
    'contacts:get': { maxRequests: 10, windowMs: 10_000 },
  };

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    private readonly config: ConfigService,
  ) {
    this.redisEnabled = config.get<string>('REDIS_SOCKET_THROTTLE_ENABLED') === 'true';
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  async allow(clientId: string, event: string): Promise<boolean> {
    const cfg = this.limits[event];
    if (!cfg) return true;

    if (this.redisEnabled && this.redis) {
      const key = `throttle:socket:${clientId}:${event}`;
      const ttlSec = Math.ceil(cfg.windowMs / 1000);

      const pipeline = this.redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, ttlSec, 'NX');
      const results = await pipeline.exec();

      const count = results?.[0]?.[1] as number | null;
      if (count !== null && count > cfg.maxRequests) {
        this.logger.warn(`RATE_LIMITED client=${clientId} event=${event}`);
        return false;
      }
      return true;
    }

    const key = `${clientId}:${event}`;
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: cfg.maxRequests, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    const elapsed = now - bucket.lastRefill;
    if (elapsed >= cfg.windowMs) {
      bucket.tokens = cfg.maxRequests;
      bucket.lastRefill = now;
    }

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return true;
    }

    this.logger.warn(`RATE_LIMITED client=${clientId} event=${event}`);
    return false;
  }

  removeClient(clientId: string): void {
    for (const key of this.buckets.keys()) {
      if (key.startsWith(`${clientId}:`)) {
        this.buckets.delete(key);
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const maxAge = 120_000;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > maxAge) {
        this.buckets.delete(key);
      }
    }
  }
}
