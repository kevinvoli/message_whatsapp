import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
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
  ) {}

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
    return saved;
  }

  /**
   * Adds a commercial to the end of the queue.
   * If the user is already in the queue, they are not added again.
   */
  async addPosteToQueue(posteId: string): Promise<QueuePosition | null> {
    return this.queueLock.runExclusive(async () =>
      this.addPosteToQueueInternal(posteId),
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
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async removeFromQueue(posteId: string): Promise<void> {
    return this.queueLock.runExclusive(async () =>
      this.removeFromQueueInternal(posteId),
    );
  }

  /**
   * Gets the next commercial in the queue using least-loaded strategy.
   * Among all postes in queue, picks the one with the fewest active chats.
   * Falls back to first in queue (round-robin) if chat counts are equal.
   */
  async getNextInQueue(): Promise<WhatsappPoste | null> {
    return await this.queueLock.runExclusive(async () => {
      const allPositions = await this.queueRepository.find({
        order: { position: 'ASC' },
        relations: ['poste'],
      });

      // Exclure les postes qui ont au moins un canal dédié (mode exclusif)
      const dedicatedRows = await this.channelRepository
        .createQueryBuilder('c')
        .select('DISTINCT c.poste_id', 'poste_id')
        .where('c.poste_id IS NOT NULL')
        .getRawMany<{ poste_id: string }>();
      const dedicatedSet = new Set(dedicatedRows.map((r) => r.poste_id));

      const candidates = allPositions.filter((qp) => qp.poste && !dedicatedSet.has(qp.poste_id));

      // ─── ÉTAPE 1 : stratégie normale via queue_positions ─────────────────────
      if (candidates.length > 0) {
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

        let best = candidates[0];
        let bestCount = countMap.get(best.poste_id) ?? 0;

        for (let i = 1; i < candidates.length; i++) {
          const count = countMap.get(candidates[i].poste_id) ?? 0;
          if (count < bestCount) {
            best = candidates[i];
            bestCount = count;
          }
        }

        this.logger.debug(
          `Poste selectionne: ${best.poste.name} (${best.poste.id}) avec ${bestCount} chats actifs`,
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

      const allPostes = await this.posteRepository
        .createQueryBuilder('p')
        .innerJoin('p.commercial', 'c')
        .where('p.is_queue_enabled = :enabled', { enabled: true })
        .andWhere(
          `p.id NOT IN (SELECT DISTINCT poste_id FROM whapi_channels WHERE poste_id IS NOT NULL)`,
        )
        .getMany();

      if (allPostes.length === 0) {
        this.logger.warn(
          `Aucun poste configuré avec commercial — message mis en attente`,
        );
        return null;
      }

      const fallbackIds = allPostes.map((p) => p.id);
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

      let bestFallback = allPostes[0];
      let bestFallbackCount = fallbackCountMap.get(bestFallback.id) ?? 0;

      for (let i = 1; i < allPostes.length; i++) {
        const count = fallbackCountMap.get(allPostes[i].id) ?? 0;
        if (count < bestFallbackCount) {
          bestFallback = allPostes[i];
          bestFallbackCount = count;
        }
      }

      this.logger.warn(
        `Fallback BDD → poste ${bestFallback.name} (${bestFallback.id}) avec ${bestFallbackCount} chats actifs`,
      );
      return bestFallback;
    });
  }

  async getQueuePositions(): Promise<QueuePosition[]> {
    return await this.queueRepository.find({
      order: { position: 'ASC' },
      relations: ['poste'],
    });
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
  }

  async moveToEnd(poste_id: string): Promise<void> {
    await this.queueLock.runExclusive(async () => {
      await this.moveToEndInternal(poste_id);
    });
  }

  /**
   * Quand plus aucun agent n'est actif, remet dans la queue tous les postes
   * non-bloques ET ayant au moins un commercial, pour continuer a dispatcher
   * en mode OFFLINE. Un poste sans commercial n'a personne pour repondre :
   * l'ajouter serait inutile et tromperait le dispatcher.
   */
  async fillQueueWithAllPostes(): Promise<void> {
    await this.queueLock.runExclusive(async () => {
      // Récupérer les IDs de postes dédiés (canaux exclusifs) à exclure de la queue pool
      const dedicatedRows = await this.channelRepository
        .createQueryBuilder('c')
        .select('DISTINCT c.poste_id', 'poste_id')
        .where('c.poste_id IS NOT NULL')
        .getRawMany<{ poste_id: string }>();
      const dedicatedSet = new Set(dedicatedRows.map((r) => r.poste_id));

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
    });
  }

  /**
   * Quand un agent se connecte, retire de la queue tous les postes
   * qui ne sont pas actuellement connectes (sauf lui-meme).
   */
  async purgeOfflinePostes(excludePosteId: string): Promise<void> {
    await this.queueLock.runExclusive(async () => {
      const queue = await this.queueRepository.find();
      const offlinePostes = await this.posteRepository.find({
        where: { is_active: false, is_queue_enabled: true },
      });
      const offlineIds = new Set(offlinePostes.map((p) => p.id));

      for (const qp of queue) {
        if (qp.poste_id !== excludePosteId && offlineIds.has(qp.poste_id)) {
          await this.removeFromQueueInternal(qp.poste_id);
        }
      }

      this.logQueueEvent('purge_offline', {
        excluded: excludePosteId,
        removed: offlinePostes.filter((p) => p.id !== excludePosteId).length,
      });
    });
  }

  /**
   * Vérifie s'il reste au moins un poste pool actif (hors postes dédiés).
   * Un poste dédié ne doit pas faire croire que la queue pool est alimentée.
   */
  async hasActivePostes(): Promise<boolean> {
    const count = await this.posteRepository
      .createQueryBuilder('p')
      .where('p.is_active = :active', { active: true })
      .andWhere(
        `p.id NOT IN (SELECT DISTINCT poste_id FROM whapi_channels WHERE poste_id IS NOT NULL)`,
      )
      .getCount();
    return count > 0;
  }

  async syncQueueWithActivePostes(): Promise<void> {
    await this.queueLock.runExclusive(async () => {
      // Exclure les postes dédiés de la queue pool
      const dedicatedRows = await this.channelRepository
        .createQueryBuilder('c')
        .select('DISTINCT c.poste_id', 'poste_id')
        .where('c.poste_id IS NOT NULL')
        .getRawMany<{ poste_id: string }>();
      const dedicatedSet = new Set(dedicatedRows.map((r) => r.poste_id));

      const activePostes = await this.posteRepository.find({
        where: { is_active: true, is_queue_enabled: true },
      });

      // Ne garder que les postes non dédiés dans la queue pool
      const activeIds = activePostes
        .filter((p) => !dedicatedSet.has(p.id))
        .map((p) => p.id);
      const queue = await this.queueRepository.find();

      for (const qp of queue) {
        if (!activeIds.includes(qp.poste_id)) {
          await this.removeFromQueueInternal(qp.poste_id);
        }
      }

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
    });
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

  async blockPoste(posteId: string): Promise<void> {
    await this.queueLock.runExclusive(async () => {
      await this.posteRepository.update(posteId, { is_queue_enabled: false });
      await this.removeFromQueueInternal(posteId);
      this.logQueueEvent('block', { poste_id: posteId });
    });
  }

  async unblockPoste(posteId: string): Promise<void> {
    await this.queueLock.runExclusive(async () => {
      await this.posteRepository.update(posteId, { is_queue_enabled: true });
      const poste = await this.posteRepository.findOne({
        where: { id: posteId },
      });
      if (poste?.is_active) {
        await this.addPosteToQueueInternal(posteId);
      }
      this.logQueueEvent('unblock', { poste_id: posteId });
    });
  }

  async resetQueueState(): Promise<void> {
    await this.queueLock.runExclusive(async () => {
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
    });
  }
}
