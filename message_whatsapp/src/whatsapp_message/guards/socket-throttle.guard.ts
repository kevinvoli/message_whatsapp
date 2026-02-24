import { Injectable, Logger } from '@nestjs/common';

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

  private readonly limits: Record<string, ThrottleConfig> = {
    'message:send': { maxRequests: 10, windowMs: 10_000 },
    'messages:get': { maxRequests: 30, windowMs: 10_000 },
    'conversations:get': { maxRequests: 10, windowMs: 10_000 },
    'chat:event': { maxRequests: 20, windowMs: 10_000 },
    'messages:read': { maxRequests: 20, windowMs: 10_000 },
    'contacts:get': { maxRequests: 10, windowMs: 10_000 },
  };

  constructor() {
    // Cleanup stale buckets every 60s
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  /**
   * Returns true if the request is allowed, false if throttled.
   */
  allow(clientId: string, event: string): boolean {
    const config = this.limits[event];
    if (!config) return true; // No limit configured for this event

    const key = `${clientId}:${event}`;
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: config.maxRequests, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= config.windowMs) {
      bucket.tokens = config.maxRequests;
      bucket.lastRefill = now;
    }

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return true;
    }

    this.logger.warn(`RATE_LIMITED client=${clientId} event=${event}`);
    return false;
  }

  /**
   * Remove a client's buckets (on disconnect).
   */
  removeClient(clientId: string): void {
    for (const key of this.buckets.keys()) {
      if (key.startsWith(`${clientId}:`)) {
        this.buckets.delete(key);
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const maxAge = 120_000; // 2 minutes
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > maxAge) {
        this.buckets.delete(key);
      }
    }
  }
}
