import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import Redlock, { Lock } from 'redlock';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.module';

/**
 * P2.2 — DistributedLockService
 *
 * Abstraction autour de Redlock pour le distributed locking cross-instance.
 * Si Redis est absent, fallback sur un Set in-process (mono-instance uniquement).
 *
 * Usage :
 *   const lock = await this.lockService.acquire('chat:tenantId:chatId', 30_000);
 *   try { ... } finally { await lock.release(); }
 *
 * Ou via le helper withLock() :
 *   await this.lockService.withLock('queue:tenantId', 10_000, async () => { ... });
 */
@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);
  private readonly redlock: Redlock | null;

  /** Fallback in-process pour les environnements sans Redis */
  private readonly inProcessLocks = new Set<string>();

  constructor(
    @Optional() @Inject(REDIS_CLIENT)
    private readonly redis: Redis | null,
  ) {
    if (this.redis) {
      this.redlock = new Redlock([this.redis as any], {
        driftFactor: 0.01,
        retryCount: 3,
        retryDelay: 200,   // ms entre les tentatives
        retryJitter: 100,  // jitter pour éviter les thundering herds
        automaticExtensionThreshold: 500,
      });

      this.redlock.on('error', (err: Error) => {
        // Redlock émet des erreurs normales en cas de contention — ne pas alerter
        if (!err.message.includes('The operation was unable to achieve a quorum')) {
          this.logger.warn(`Redlock error: ${err.message}`);
        }
      });
    } else {
      this.redlock = null;
      this.logger.warn('Redis absent — distributed locking désactivé (fallback in-process)');
    }
  }

  /**
   * Acquiert un lock distribué.
   * @param resource  Clé unique du lock (ex: "chat:tenant1:chatId")
   * @param ttl       Durée max du lock en ms (TTL automatique)
   * @returns         Un objet Lock avec une méthode release()
   */
  async acquire(resource: string, ttl: number): Promise<{ release: () => Promise<void> }> {
    if (this.redlock) {
      try {
        const lock: Lock = await this.redlock.acquire([`lock:${resource}`], ttl);
        return {
          release: async () => {
            try {
              await lock.release();
            } catch (err) {
              // Le lock peut déjà être expiré — pas critique
              this.logger.debug(`Lock release ignoré (expiré?) : ${(err as Error).message}`);
            }
          },
        };
      } catch (err) {
        this.logger.warn(`Redlock acquire échoué pour "${resource}" : ${(err as Error).message}`);
        // Fallback in-process si Redlock échoue
      }
    }

    // Fallback in-process
    return this.acquireInProcess(resource, ttl);
  }

  /**
   * Exécute une fonction sous lock distribué.
   * Le lock est libéré automatiquement (success ou exception).
   */
  async withLock<T>(
    resource: string,
    ttl: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const lock = await this.acquire(resource, ttl);
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }

  /**
   * Tente d'exécuter fn sous lock — fail fast si déjà tenu.
   * Ne retente PAS (retryCount=0). Retourne { acquired: false } si lock pris.
   * Pas de fallback bloquant en in-process : si déjà tenu, on skip.
   * Logs : LOCK_ACQUIRED / LOCK_SKIPPED / LOCK_RELEASED.
   */
  async tryWithLock<T>(
    resource: string,
    ttl: number,
    fn: () => Promise<T>,
  ): Promise<{ acquired: boolean; result?: T }> {
    if (this.redlock) {
      let lock: import('redlock').Lock;
      try {
        lock = await this.redlock.acquire([`lock:${resource}`], ttl, {
          retryCount: 0,
        } as any);
      } catch {
        return { acquired: false };
      }
      try {
        const result = await fn();
        return { acquired: true, result };
      } finally {
        try { await lock.release(); } catch { /* expiré */ }
      }
    }

    // Fallback in-process : fail fast si déjà tenu (pas d'attente)
    if (this.inProcessLocks.has(resource)) {
      return { acquired: false };
    }
    this.inProcessLocks.add(resource);
    const timer = setTimeout(() => this.inProcessLocks.delete(resource), ttl);
    try {
      const result = await fn();
      return { acquired: true, result };
    } finally {
      clearTimeout(timer);
      this.inProcessLocks.delete(resource);
    }
  }

  // ─── Fallback in-process (mono-instance) ────────────────────────────────────

  private async acquireInProcess(
    resource: string,
    ttl: number,
  ): Promise<{ release: () => Promise<void> }> {
    const deadline = Date.now() + Math.min(ttl, 30_000);
    // Attente active (poll 50ms) — acceptable en mono-instance
    while (this.inProcessLocks.has(resource)) {
      if (Date.now() > deadline) {
        this.logger.warn(`In-process lock timeout pour "${resource}" — forcé`);
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    this.inProcessLocks.add(resource);

    // Auto-release après TTL
    const timer = setTimeout(() => this.inProcessLocks.delete(resource), ttl);

    return {
      release: async () => {
        clearTimeout(timer);
        this.inProcessLocks.delete(resource);
      },
    };
  }
}
