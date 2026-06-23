import Redis from 'ioredis';

/** TTL utilisé pour les misses (valeur null) — évite de figer une absence trop longtemps. */
const NULL_TTL = 15;

/**
 * Helper read-through cache générique.
 *
 * Usage :
 *   return cachedGet(this.redis, `ranking:${period}`, 30, () => this.computeRanking(period));
 *   return cachedGet(this.redis, `sla:rules:${tenantId}`, 300, () => this.loadSlaRules(tenantId));
 *
 * RC3 — quand loader() retourne null, le TTL effectif est réduit à NULL_TTL (15s)
 * pour éviter de figer une absence trop longtemps.
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

  if (redis && value !== undefined) {
    const effectiveTtl = value === null ? NULL_TTL : ttlSeconds;
    try {
      await redis.setex(key, effectiveTtl, JSON.stringify(value));
    } catch { /* non bloquant */ }
  }

  return value;
}

/**
 * Variante anti-stampede de cachedGet (stale-while-revalidate).
 *
 * Quand plusieurs requêtes concurrentes arrivent sur une clé expirée,
 * un verrou distribué (lock:revalidate:<key>, TTL 5s) garantit qu'un seul
 * process recharge la DB. Les autres attendent 60ms puis relisent le cache.
 *
 * RC2 — à utiliser pour les clés à fort contention (ex. ranking, SLA rules).
 * Les appelants existants de cachedGet ne sont pas impactés.
 */
export async function cachedGetSafe<T>(
  redis: Redis | null,
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  // 1. Lecture cache
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch { /* Redis indisponible → fallback DB */ }
  }

  // 2. Anti-stampede : seul le premier process recharge
  const lockKey = `lock:revalidate:${key}`;
  const gotLock = redis
    ? await redis.set(lockKey, '1', 'EX', 5, 'NX').catch(() => null)
    : null;

  if (!gotLock && redis) {
    // Attendre 60ms et retenter le cache (le winner aura écrit)
    await new Promise<void>((r) => setTimeout(r, 60));
    try {
      const retry = await redis.get(key);
      if (retry !== null) return JSON.parse(retry) as T;
    } catch { /* Redis indisponible → fallback DB */ }
  }

  // 3. Charger depuis la DB
  const value = await loader();

  // 4. Mettre en cache (TTL court pour null)
  if (redis) {
    const effectiveTtl = value === null ? NULL_TTL : ttlSeconds;
    try {
      await redis.setex(key, effectiveTtl, JSON.stringify(value));
    } catch { /* non bloquant */ }
    if (gotLock) await redis.del(lockKey).catch(() => null);
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
