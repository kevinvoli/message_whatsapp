import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { QueuePosition } from '../entities/queue-position.entity';
import { Mutex } from 'async-mutex';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
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

    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.resetQueueState();
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

      const candidates = allPositions.filter((qp) => qp.poste);
      if (candidates.length === 0) {
        this.logger.warn(
          `Aucun poste disponible, message mis en attente (queue vide)`,
        );
        return null;
      }

      // Compter les chats actifs par poste
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

      // Choisir le poste avec le moins de chats (en respectant l'ordre de queue en cas d'egalite)
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
      const postes = await this.posteRepository.find({
        where: { is_queue_enabled: true },
        relations: ['commercial'],
      });

      const postesWithCommercial = postes.filter(
        (p) => (p.commercial?.length ?? 0) > 0,
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
   * Verifie s'il reste au moins un agent actif.
   */
  async hasActivePostes(): Promise<boolean> {
    const count = await this.posteRepository.count({
      where: { is_active: true },
    });
    return count > 0;
  }

  async syncQueueWithActivePostes(): Promise<void> {
    await this.queueLock.runExclusive(async () => {
      const activePostes = await this.posteRepository.find({
        where: { is_active: true, is_queue_enabled: true },
      });

      const activeIds = activePostes.map((p) => p.id);
      const queue = await this.queueRepository.find();

      for (const qp of queue) {
        if (!activeIds.includes(qp.poste_id)) {
          await this.removeFromQueueInternal(qp.poste_id);
        }
      }

      for (const poste of activePostes) {
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
