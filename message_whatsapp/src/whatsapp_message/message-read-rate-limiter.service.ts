import { Injectable } from '@nestjs/common';

interface WindowEntry {
  count: number;
  windowStart: number;
}

@Injectable()
export class MessageReadRateLimiterService {
  private readonly windows = new Map<string, WindowEntry>();
  private readonly windowMs = 60_000;

  checkAndConsume(commercialId: string, requested: number, maxPerMinute: number): boolean {
    const now = Date.now();
    const entry = this.windows.get(commercialId);

    if (!entry || now - entry.windowStart >= this.windowMs) {
      if (requested > maxPerMinute) {
        return false;
      }
      this.windows.set(commercialId, { count: requested, windowStart: now });
      return true;
    }

    if (entry.count + requested > maxPerMinute) {
      return false;
    }

    entry.count += requested;
    return true;
  }
}
