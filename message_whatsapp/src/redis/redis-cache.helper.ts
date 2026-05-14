import Redis from 'ioredis';

/**
 * Helper read-through cache générique.
 *
 * Usage :
 *   return cachedGet(this.redis, `ranking:${period}`, 30, () => this.computeRanking(period));
 *   return cachedGet(this.redis, `sla:rules:${tenantId}`, 300, () => this.loadSlaRules(tenantId));
 */
export async function cachedGet<T>(
  redis: Redis | null,
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached !== null) return JSON.parse(cached) as T;
    } catch { /* Redis indisponible → fallback DB */ }
  }

  const value = await loader();

  if (redis && value !== null && value !== undefined) {
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch { /* non bloquant */ }
  }

  return value;
}

/**
 * Supprime une ou plusieurs clés de cache sans lever d'erreur si Redis est absent.
 */
export async function cacheInvalidate(redis: Redis | null, ...keys: string[]): Promise<void> {
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch { /* non critique */ }
}
