import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContextBinding } from '../entities/context-binding.entity';
import { Context } from '../entities/context.entity';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import type Redis from 'ioredis';

/**
 * CTX-B1 / CTX-F1 — ContextResolverService
 *
 * Résout le Context approprié pour un message entrant donné.
 *
 * Ordre de priorité (du plus spécifique au plus générique) :
 *   1. CHANNEL  — binding exact sur channel_id
 *   2. POSTE    — binding exact sur poste_id
 *   3. PROVIDER — binding exact sur provider
 *   4. POOL     — fallback global (refValue = 'global')
 *
 * Cache à deux niveaux (CTX-F1) :
 *   - Redis (si REDIS_HOST configuré) : clé "ctx:channel:{channelId}", TTL 60 s
 *   - In-process Map (fallback si Redis absent ou en erreur), même TTL
 */
@Injectable()
export class ContextResolverService {
  private readonly logger = new Logger(ContextResolverService.name);

  /** Cache in-process (fallback Redis) — stocke l'objet Context complet pour éviter un aller-retour DB */
  private readonly cache = new Map<string, { context: Context; expiresAt: number }>();
  private static readonly TTL_MS = 60_000;
  private static readonly REDIS_TTL_S = 60;

  constructor(
    @InjectRepository(ContextBinding)
    private readonly bindingRepo: Repository<ContextBinding>,
    @InjectRepository(Context)
    private readonly contextRepo: Repository<Context>,
    @Optional() @Inject(REDIS_CLIENT)
    private readonly redis: Redis | null,
  ) {}

  /**
   * Résout le contexte pour un canal entrant.
   * @param channelId  channel_id du canal WHAPI/Meta
   * @param posteId    poste_id affecté à la conversation (peut être null)
   * @param provider   nom du fournisseur (ex: "whapi", "meta")
   */
  async resolveForChannel(
    channelId: string,
    posteId: string | null | undefined,
    provider: string | null | undefined,
  ): Promise<Context | null> {
    const cacheKey = `ctx:channel:${channelId}`;

    // 1. Lecture Redis
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const ctx = await this.contextRepo.findOne({ where: { id: cached } });
          if (ctx?.isActive) return ctx;
        }
      } catch (err) {
        this.logger.warn(`Redis GET échoué: ${(err as Error).message}`);
      }
    }

    // 2. Lecture cache in-process (stocke l'objet complet — pas d'aller-retour DB)
    const inProcess = this.cache.get(cacheKey);
    if (inProcess && inProcess.expiresAt > Date.now()) {
      if (inProcess.context.isActive) return inProcess.context;
      // Contexte devenu inactif entre-temps : invalider et re-résoudre
      this.cache.delete(cacheKey);
    }

    // 3. Résolution depuis la BDD
    const context = await this.resolveWithPriority(channelId, posteId, provider);

    if (context) {
      // Écriture Redis (ID seulement — sérialisable cross-process)
      if (this.redis) {
        try {
          await this.redis.set(cacheKey, context.id, 'EX', ContextResolverService.REDIS_TTL_S);
        } catch (err) {
          this.logger.warn(`Redis SET échoué: ${(err as Error).message}`);
        }
      }
      // Écriture in-process (objet complet pour éviter contextRepo.findOne au prochain hit)
      this.cache.set(cacheKey, {
        context,
        expiresAt: Date.now() + ContextResolverService.TTL_MS,
      });
    }

    return context;
  }

  /**
   * Invalide le cache pour un canal (appelé lors des modifications de binding).
   * Invalide Redis ET le cache in-process.
   */
  invalidate(channelId: string): void {
    const cacheKey = `ctx:channel:${channelId}`;
    this.cache.delete(cacheKey);
    if (this.redis) {
      this.redis.del(cacheKey).catch((err: Error) =>
        this.logger.warn(`Redis DEL échoué pour ${cacheKey}: ${err.message}`),
      );
    }
  }

  // ─── Résolution par priorité ──────────────────────────────────────────────

  private async resolveWithPriority(
    channelId: string,
    posteId: string | null | undefined,
    provider: string | null | undefined,
  ): Promise<Context | null> {
    // 1. CHANNEL
    if (channelId) {
      const ctx = await this.findByBinding('CHANNEL', channelId);
      if (ctx) return ctx;
    }

    // 2. POSTE
    if (posteId) {
      const ctx = await this.findByBinding('POSTE', posteId);
      if (ctx) return ctx;
    }

    // 3. PROVIDER
    if (provider) {
      const ctx = await this.findByBinding('PROVIDER', provider);
      if (ctx) return ctx;
    }

    // 4. POOL (fallback global)
    const ctx = await this.findByBinding('POOL', 'global');
    if (ctx) return ctx;

    this.logger.warn(
      `Aucun contexte trouvé pour channel=${channelId}, poste=${posteId}, provider=${provider}`,
    );
    return null;
  }

  private async findByBinding(
    bindingType: ContextBinding['bindingType'],
    refValue: string,
  ): Promise<Context | null> {
    const binding = await this.bindingRepo.findOne({
      where: { bindingType, refValue },
      relations: ['context'],
    });
    if (!binding?.context?.isActive) return null;
    return binding.context;
  }
}
