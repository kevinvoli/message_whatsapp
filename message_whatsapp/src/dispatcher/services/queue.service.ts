import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import { QueuePosition } from '../entities/queue-position.entity';
import { Mutex } from 'async-mutex';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { SystemConfigService } from 'src/system-config/system-config.service';
import { DistributedLockService } from 'src/redis/distributed-lock.service';
import { SocketListCacheService } from 'src/realtime/socket-list-cache.service';
import { DispatchSettingsService } from './dispatch-settings.service';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.module';

const DEFAULT_QUOTA_ACTIVE = 10;
const DEDICATED_POSTE_IDS_CACHE_KEY = 'queue:dedicated_poste_ids';
const DEDICATED_POSTE_IDS_TTL = 60; // secondes

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);

  private readonly queueLock: Mutex = new Mutex();
  constructor(
    @InjectRepository(QueuePosition)
    private readonly queueRepository: Repository<QueuePosition>,

    @InjectRepository(WhatsappPoste)
    private readonly posteRepository: Repository<WhatsappPoste>,

    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,

    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,

    @InjectRepository(WhapiChannel)
    private readonly channelRepository: Repository<WhapiChannel>,

    private readonly dataSource: DataSource,

    @Optional()
    private readonly systemConfig: SystemConfigService,

    @Optional()
    private readonly lockService: DistributedLockService,

    @Optional()
    private readonly socketListCacheService: SocketListCacheService,

    @Optional()
    private readonly dispatchSettingsService: DispatchSettingsService,

    @Optional() @Inject(REDIS_CLIENT)
    private readonly redis: Redis | null,
  ) {}

  // ─── Cache Redis : IDs de postes avec canal dédié ───────────────────────────

  /**
   * Retourne l'ensemble des poste_id ayant au moins un canal dédié.
   * Résultat mis en cache Redis TTL 60s pour éviter la requête répétée
   * dans getNextInQueue / fillQueueWithAllPostes / syncQueueWithActivePostes.
   */
  private async getDedicatedPosteIds(): Promise<Set<string>> {
    if (this.redis) {
      const cached = await this.redis.get(DEDICATED_POSTE_IDS_CACHE_KEY);
      if (cached) return new Set(JSON.parse(cached) as string[]);
    }

    const rows = await this.channelRepository
      .createQueryBuilder('c')
      .select('DISTINCT c.poste_id', 'posteId')
      .where('c.poste_id IS NOT NULL')
      .getRawMany<{ posteId: string }>();
    const ids = new Set(rows.map((r) => r.posteId));

    if (this.redis) {
      await this.redis.set(
        DEDICATED_POSTE_IDS_CACHE_KEY,
        JSON.stringify([...ids]),
        'EX',
        DEDICATED_POSTE_IDS_TTL,
      );
    }

    return ids;
  }

  /**
   * Invalide le cache Redis des postes dédiés.
   * À appeler lors de la création ou suppression d'un canal dédié (poste_id non null).
   */
  async invalidateDedicatedPosteIdsCache(): Promise<void> {
    if (this.redis) {
      await this.redis.del(DEDICATED_POSTE_IDS_CACHE_KEY);
    }
  }

  // ─── Batch suppression de postes de la queue ────────────────────────────────

  /**
   * Supprime plusieurs postes de la queue en une seule requête DELETE,
   * puis recompacte les positions en ordre croissant sans trou.
   * Utilisé par purgeOfflinePostes() et syncQueueWithActivePostes().
   */
  private async batchRemoveFromQueue(posteIds: string[]): Promise<void> {
    if (posteIds.length === 0) return;

    await this.queueRepository
      .createQueryBuilder()
      .delete()
      .where('poste_id IN (:...posteIds)', { posteIds })
      .execute();

    // Recompactage : renuméroter les positions restantes de 1 à N sans trou.
    // Deux appels séparés car mysql2 n'accepte pas les multi-statements par défaut.
    await this.dataSource.query('SET @pos := 0');
    await this.dataSource.query(
      'UPDATE queue_positions SET position = (@pos := @pos + 1) ORDER BY position ASC',
    );

    await this.socketListCacheService?.invalidateQueuePositions();
    this.logQueueEvent('batch_remove', { removed_ids: posteIds });
  }

  // ─── Helpers internes ────────────────────────────────────────────────────────

  private async withDistributedLock<T>(resource: string, ttl: number, fn: () => Promise<T>): Promise<T> {
    if (!this.lockService) return fn();
    const t0 = Date.now();
    return this.lockService.withLock(resource, ttl, async () => {
      const dt = Date.now() - t0;
      if (dt > 100) this.logger.warn(`LOCK_SLOW ${resource}: ${dt}ms`);
      return fn();
    });
  }

  async onModuleInit(): Promise<void> {
    await this.resetQueueState();
    await this.fillQueueWithAllPostes();
  }

  private logQueueEvent(
    action: string,
    payload: Record<string, unknown>,
  ): void {
    this.logger.log(
      `QUEUE_EVENT ${JSON.stringify({
        action,
        at: new Date().toISOString(),
        ...payload,
      })}`,
    );
  }

  private async addPosteToQueueInternal(
    posteId: string,
  ): Promise<QueuePosition | null> {
    const poste = await this.posteRepository.findOne({
      where: { id: posteId },
    });

    if (!poste) {
      throw new NotFoundException('Poste introuvable');
    }

    if (!poste.is_queue_enabled) {
      this.logQueueEvent('skip_add_blocked', {
        poste_id: posteId,
      });
      return null;
    }

    // Un poste avec au moins un canal dédié ne doit jamais entrer dans la queue pool.
    // Cette vérification est volontairement au niveau le plus bas pour couvrir
    // tous les chemins d'appel (connexion agent, fillQueue, syncQueue, unblock…).
    const dedicatedChannel = await this.channelRepository.findOne({
      where: { poste_id: posteId },
      select: ['channel_id'],
    });
    if (dedicatedChannel) {
      this.logQueueEvent('skip_add_dedicated', { poste_id: posteId });
      return null;
    }

    const existing = await this.queueRepository.findOne({
      where: { poste_id: posteId },
    });

    if (existing) return existing;

    const maxPositionResult = await this.queueRepository
      .createQueryBuilder('qp')
      .select('MAX(qp.position)', 'max_position')
      .getRawOne<{ max_position: number | null }>();

    const position = (maxPositionResult?.max_position ?? 0) + 1;

    const qp = this.queueRepository.create({
      poste_id: posteId,
      poste,
      position,
    });

    const saved = await this.queueRepository.save(qp);
    this.logQueueEvent('add', {
      poste_id: posteId,
      position: saved.position,
    });
    await this.socketListCacheService?.invalidateQueuePositions();
    return saved;
  }

  /**
   * Adds a commercial to the end of the queue.
   * If the user is already in the queue, they are not added again.
   */
  async addPosteToQueue(posteId: string): Promise<QueuePosition | null> {
    return this.withDistributedLock('dispatcher:queue', 10_000, () =>
      this.queueLock.runExclusive(() => this.addPosteToQueueInternal(posteId)),
    );
  }

  /**
   * Removes a commercial from the queue and updates the positions of subsequent users.
   */
  private async removeFromQueueInternal(posteId: string): Promise<void> {
    this.logger.debug(`waiting lock ${posteId}`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const positionToRemove = await queryRunner.manager.findOne(
        QueuePosition,
        { where: { poste_id: posteId } },
      );

      if (!positionToRemove) {
        await queryRunner.commitTransaction();
        return;
      }

      const removedPosition = positionToRemove.position;
      await queryRunner.manager.remove(positionToRemove);

      await queryRunner.manager
        .createQueryBuilder()
        .update(QueuePosition)
        .set({ position: () => 'position - 1' })
        .where('position > :removedPosition', { removedPosition })
        .execute();

      await queryRunner.commitTransaction();
      this.logQueueEvent('remove', {
        poste_id: posteId,
        removed_position: removedPosition,
      });
      await this.socketListCacheService?.invalidateQueuePositions();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async removeFromQueue(posteId: string): Promise<void> {
    return this.withDistributedLock('dispatcher:queue', 10_000, () =>
      this.queueLock.runExclusive(() => this.removeFromQueueInternal(posteId)),
    );
  }

  /**
   * Gets the next commercial in the queue using least-loaded strategy.
   * Among all postes in queue, picks the one with the fewest active chats.
   * Falls back to first in queue (round-robin) if chat counts are equal.
   */
  async getNextInQueue(): Promise<WhatsappPoste | null> {
    return this.withDistributedLock('dispatcher:queue', 10_000, () =>
      this.queueLock.runExclusive(async () => {
      const allPositions = await this.queueRepository.find({
        order: { position: 'ASC' },
        relations: ['poste'],
      });

      // Exclure les postes qui ont au moins un canal dédié (mode exclusif)
      const dedicatedSet = await this.getDedicatedPosteIds();

      const candidates = allPositions.filter((qp) => qp.poste && !dedicatedSet.has(qp.poste_id));

      // ─── Lire le mode de dispatch configuré ──────────────────────────────────
      const dispatchSettings = await this.dispatchSettingsService?.getSettings();
      const dispatchMode = dispatchSettings?.dispatch_mode ?? 'LEAST_LOADED';

      // ─── ÉTAPE 1 : stratégie via queue_positions ──────────────────────────────
      if (candidates.length > 0) {

        // ── 1a : ROUND_ROBIN — rotation stricte, sans comptage de charge ─────────
        if (dispatchMode === 'ROUND_ROBIN') {
          const candidate = candidates[0];
          this.logger.debug(
            `ROUND_ROBIN → poste ${candidate.poste.name} (${candidate.poste_id})`,
          );
          await this.moveToEndInternal(candidate.poste_id);
          return candidate.poste;
        }

        // ── 1b : LEAST_LOADED — poste avec le moins de conversations actives ─────
        const quotaRaw = this.systemConfig
          ? await this.systemConfig.get('CAPACITY_QUOTA_ACTIVE')
          : null;
        const quotaActive = quotaRaw ? parseInt(quotaRaw, 10) : DEFAULT_QUOTA_ACTIVE;

        const posteIds = candidates.map((qp) => qp.poste_id);
        const chatCounts = await this.chatRepository
          .createQueryBuilder('chat')
          .select('chat.poste_id', 'poste_id')
          .addSelect('COUNT(*)', 'count')
          .where('chat.poste_id IN (:...posteIds)', { posteIds })
          .andWhere('chat.status IN (:...statuses)', {
            statuses: [WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE],
          })
          .groupBy('chat.poste_id')
          .getRawMany<{ poste_id: string; count: string }>();

        const countMap = new Map<string, number>();
        for (const row of chatCounts) {
          countMap.set(row.poste_id, parseInt(row.count, 10));
        }

        // S2-002 — exclure les postes ayant atteint ou dépassé le quota actif
        const belowQuota = candidates.filter(
          (qp) => (countMap.get(qp.poste_id) ?? 0) < quotaActive,
        );

        if (belowQuota.length === 0) {
          this.logger.warn(
            `CAPACITY_ALL_FULL quota=${quotaActive} — tous les postes ont atteint leur quota, conversation en attente`,
          );
          return null;
        }

        let best = belowQuota[0];
        let bestCount = countMap.get(best.poste_id) ?? 0;

        for (let i = 1; i < belowQuota.length; i++) {
          const count = countMap.get(belowQuota[i].poste_id) ?? 0;
          if (count < bestCount) {
            best = belowQuota[i];
            bestCount = count;
          }
        }

        this.logger.debug(
          `LEAST_LOADED → poste ${best.poste.name} (${best.poste.id}) avec ${bestCount} chats actifs (quota=${quotaActive})`,
        );
        await this.moveToEndInternal(best.poste_id);
        return best.poste;
      }

      // ─── ÉTAPE 2 : fallback BDD (queue vide ou tous exclus par canaux dédiés) ─
      // On exclut toujours les postes dédiés : un poste avec canal dédié ne doit
      // jamais recevoir de conversations provenant d'autres canaux (pool).
      this.logger.warn(
        `Queue vide ou tous exclus — fallback BDD vers le poste le moins chargé`,
      );

      const dedicatedSetFallback = await this.getDedicatedPosteIds();
      const allPostes = await this.posteRepository
        .createQueryBuilder('p')
        .innerJoin('p.commercial', 'c')
        .where('p.is_queue_enabled = :enabled', { enabled: true })
        .getMany();

      const filteredPostes = allPostes.filter((p) => !dedicatedSetFallback.has(p.id));

      if (filteredPostes.length === 0) {
        this.logger.warn(
          `Aucun poste configuré avec commercial — message mis en attente`,
        );
        return null;
      }

      const fallbackIds = filteredPostes.map((p) => p.id);
      const fallbackCounts = await this.chatRepository
        .createQueryBuilder('chat')
        .select('chat.poste_id', 'poste_id')
        .addSelect('COUNT(*)', 'count')
        .where('chat.poste_id IN (:...fallbackIds)', { fallbackIds })
        .andWhere('chat.status IN (:...statuses)', {
          statuses: [WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE],
        })
        .groupBy('chat.poste_id')
        .getRawMany<{ poste_id: string; count: string }>();

      const fallbackCountMap = new Map<string, number>();
      for (const row of fallbackCounts) {
        fallbackCountMap.set(row.poste_id, parseInt(row.count, 10));
      }

      if (dispatchMode === 'ROUND_ROBIN') {
        this.logger.warn(
          `Fallback BDD ROUND_ROBIN → poste ${filteredPostes[0].name} (${filteredPostes[0].id})`,
        );
        return filteredPostes[0];
      }

      let bestFallback = filteredPostes[0];
      let bestFallbackCount = fallbackCountMap.get(bestFallback.id) ?? 0;

      for (let i = 1; i < filteredPostes.length; i++) {
        const count = fallbackCountMap.get(filteredPostes[i].id) ?? 0;
        if (count < bestFallbackCount) {
          bestFallback = filteredPostes[i];
          bestFallbackCount = count;
        }
      }

      this.logger.warn(
        `Fallback BDD LEAST_LOADED → poste ${bestFallback.name} (${bestFallback.id}) avec ${bestFallbackCount} chats actifs`,
      );
      return bestFallback;
      }),
    );
  }

  async getQueuePositions(): Promise<QueuePosition[]> {
    if (this.socketListCacheService) {
      return this.socketListCacheService.getQueuePositions(() =>
        this.queueRepository.find({ order: { position: 'ASC' }, relations: ['poste'] }),
      );
    }
    return this.queueRepository.find({ order: { position: 'ASC' }, relations: ['poste'] });
  }

  private async moveToEndInternal(poste_id: string): Promise<void> {
    const current = await this.queueRepository.findOne({
      where: { poste_id },
    });
    if (!current) return;

    const removedPosition = current.position;

    // Compacter les positions des postes qui étaient après celui-ci
    await this.queueRepository
      .createQueryBuilder()
      .update(QueuePosition)
      .set({ position: () => 'position - 1' })
      .where('position > :removedPosition', { removedPosition })
      .andWhere('poste_id != :poste_id', { poste_id })
      .execute();

    // Calculer la nouvelle position de fin (après compactage)
    const maxResult = await this.queueRepository
      .createQueryBuilder('qp')
      .select('MAX(qp.position)', 'max')
      .where('qp.poste_id != :poste_id', { poste_id })
      .getRawOne<{ max: number | null }>();

    const newPosition = (maxResult?.max ?? 0) + 1;

    // UPDATE au lieu de DELETE+INSERT → pas de risque de perte du poste
    await this.queueRepository.update({ poste_id }, { position: newPosition });

    this.logQueueEvent('move_to_end', {
      poste_id,
      new_position: newPosition,
    });
    await this.socketListCacheService?.invalidateQueuePositions();
  }

  async moveToEnd(poste_id: string): Promise<void> {
    return this.withDistributedLock('dispatcher:queue', 10_000, () =>
      this.queueLock.runExclusive(() => this.moveToEndInternal(poste_id)),
    );
  }

  /**
   * Quand plus aucun agent n'est actif, remet dans la queue tous les postes
   * non-bloques ET ayant au moins un commercial, pour continuer a dispatcher
   * en mode OFFLINE. Un poste sans commercial n'a personne pour repondre :
   * l'ajouter serait inutile et tromperait le dispatcher.
   */
  async fillQueueWithAllPostes(): Promise<void> {
    return this.withDistributedLock('dispatcher:queue', 10_000, () =>
      this.queueLock.runExclusive(async () => {
      const dedicatedSet = await this.getDedicatedPosteIds();

      const postes = await this.posteRepository.find({
        where: { is_queue_enabled: true },
        relations: ['commercial'],
      });

      // Exclure les postes dédiés : ils ne doivent jamais recevoir de conversations pool
      const postesWithCommercial = postes.filter(
        (p) => (p.commercial?.length ?? 0) > 0 && !dedicatedSet.has(p.id),
      );

      for (const poste of postesWithCommercial) {
        await this.addPosteToQueueInternal(poste.id);
      }

      this.logQueueEvent('fill_all_postes', {
        count: postesWithCommercial.length,
        reason: 'no_active_agents',
      });
      }),
    );
  }

  /**
   * Quand un agent se connecte, retire de la queue tous les postes
   * qui ne sont pas actuellement connectes (sauf lui-meme).
   * Utilise un batch DELETE pour éviter N transactions individuelles.
   */
  async purgeOfflinePostes(excludePosteId: string): Promise<void> {
    await this.queueLock.runExclusive(async () => {
      const queue = await this.queueRepository.find();
      const offlinePostes = await this.posteRepository.find({
        where: { is_active: false, is_queue_enabled: true },
      });
      const offlineIds = new Set(offlinePostes.map((p) => p.id));

      const toRemove = queue
        .filter((qp) => qp.poste_id !== excludePosteId && offlineIds.has(qp.poste_id))
        .map((qp) => qp.poste_id);

      await this.batchRemoveFromQueue(toRemove);

      this.logQueueEvent('purge_offline', {
        excluded: excludePosteId,
        removed: toRemove.length,
      });
    });
  }

  /**
   * Vérifie s'il reste au moins un poste pool actif (hors postes dédiés).
   * Un poste dédié ne doit pas faire croire que la queue pool est alimentée.
   */
  async hasActivePostes(): Promise<boolean> {
    const dedicatedSet = await this.getDedicatedPosteIds();

    const allActive = await this.posteRepository
      .createQueryBuilder('p')
      .where('p.is_active = :active', { active: true })
      .getMany();

    return allActive.some((p) => !dedicatedSet.has(p.id));
  }

  async syncQueueWithActivePostes(): Promise<void> {
    return this.withDistributedLock('dispatcher:queue', 10_000, () =>
      this.queueLock.runExclusive(async () => {
      const dedicatedSet = await this.getDedicatedPosteIds();

      const activePostes = await this.posteRepository.find({
        where: { is_active: true, is_queue_enabled: true },
      });

      // Ne garder que les postes non dédiés dans la queue pool
      const activeIds = activePostes
        .filter((p) => !dedicatedSet.has(p.id))
        .map((p) => p.id);
      const queue = await this.queueRepository.find();

      // Batch DELETE des postes qui ne sont plus actifs ou sont devenus dédiés
      const toRemove = queue
        .filter((qp) => !activeIds.includes(qp.poste_id))
        .map((qp) => qp.poste_id);

      await this.batchRemoveFromQueue(toRemove);

      for (const poste of activePostes) {
        if (dedicatedSet.has(poste.id)) continue; // jamais dans la queue pool
        const exists = queue.some((q) => q.poste_id === poste.id);
        if (!exists) {
          await this.addPosteToQueueInternal(poste.id);
        }
      }

      this.logQueueEvent('sync', {
        active_count: activePostes.length,
        queue_count: queue.length,
      });
      }),
    );
  }

  /**
   * Retourne le nombre de postes dans la queue différents du poste exclu.
   * Utilisé pour savoir s'il existe une alternative avant de redispatcher.
   */
  async countQueuedPostesExcluding(excludePosteId: string): Promise<number> {
    return this.queueRepository.count({
      where: { poste_id: Not(excludePosteId) },
    });
  }

  /**
   * S2-004/S2-005 — Vérifie qu'un poste précis est éligible pour recevoir une conversation.
   * Conditions : poste présent dans la queue (online) ET sous quota actif.
   * Utilisé par le sticky assignment lors des réinjections SLA et offline.
   */
  async canAssignToPoste(posteId: string): Promise<boolean> {
    const inQueue = await this.queueRepository.findOne({ where: { poste_id: posteId } });
    if (!inQueue) return false;

    const quotaRaw = this.systemConfig
      ? await this.systemConfig.get('CAPACITY_QUOTA_ACTIVE')
      : null;
    const quotaActive = quotaRaw ? parseInt(quotaRaw, 10) : DEFAULT_QUOTA_ACTIVE;

    const count = await this.chatRepository.count({
      where: {
        poste_id: posteId,
        status: In([WhatsappChatStatus.ACTIF, WhatsappChatStatus.EN_ATTENTE]),
      },
    });
    return count < quotaActive;
  }

  async blockPoste(posteId: string): Promise<void> {
    return this.withDistributedLock(`dispatcher:poste:${posteId}`, 10_000, () =>
      this.queueLock.runExclusive(async () => {
        await this.posteRepository.update(posteId, { is_queue_enabled: false });
        await this.removeFromQueueInternal(posteId);
        this.logQueueEvent('block', { poste_id: posteId });
      }),
    );
  }

  async unblockPoste(posteId: string): Promise<void> {
    return this.withDistributedLock(`dispatcher:poste:${posteId}`, 10_000, () =>
      this.queueLock.runExclusive(async () => {
        await this.posteRepository.update(posteId, { is_queue_enabled: true });
        const poste = await this.posteRepository.findOne({
          where: { id: posteId },
        });
        if (poste?.is_active) {
          await this.addPosteToQueueInternal(posteId);
        }
        this.logQueueEvent('unblock', { poste_id: posteId });
      }),
    );
  }

  async resetQueueState(): Promise<void> {
    return this.withDistributedLock('dispatcher:queue', 10_000, () =>
      this.queueLock.runExclusive(async () => {
        await this.queueRepository.clear();
        await this.posteRepository
          .createQueryBuilder()
          .update(WhatsappPoste)
          .set({ is_active: false })
          .execute();
        await this.commercialRepository
          .createQueryBuilder()
          .update(WhatsappCommercial)
          .set({ isConnected: false })
          .execute();

        this.logger.warn('QUEUE_BOOTSTRAP reset completed');
      }),
    );
  }
}
