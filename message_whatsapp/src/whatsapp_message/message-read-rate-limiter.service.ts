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
    return this.consumeUpTo(commercialId, requested, maxPerMinute) === requested;
  }

  /** Consomme jusqu'à `requested` slots et retourne le nombre réellement consommé. */
  consumeUpTo(commercialId: string, requested: number, maxPerMinute: number): number {
    const now = Date.now();
    const entry = this.windows.get(commercialId);

    if (!entry || now - entry.windowStart >= this.windowMs) {
      const granted = Math.min(requested, maxPerMinute);
      this.windows.set(commercialId, { count: granted, windowStart: now });
      return granted;
    }

    const available = Math.max(0, maxPerMinute - entry.count);
    const granted = Math.min(requested, available);
    entry.count += granted;
    return granted;
  }
}
