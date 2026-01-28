import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { QueuePosition } from '../entities/queue-position.entity';
import { Mutex } from 'async-mutex';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  private readonly queueLock: Mutex = new Mutex();
  constructor(
    @InjectRepository(QueuePosition)
    private readonly queueRepository: Repository<QueuePosition>,

    @InjectRepository(WhatsappPoste)
    private readonly posteRepository: Repository<WhatsappPoste>,

    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,

    private readonly dataSource: DataSource,
    
  ) {}

  /**
   * Adds a commercial to the end of the queue.
   * If the user is already in the queue, they are not added again.
   */
  async addPosteToQueue(posteId: string): Promise<QueuePosition | null> {
    const poste = await this.posteRepository.findOne({
      where: { id: posteId },
    });

    if (!poste) {
      throw new NotFoundException('Poste introuvable');
    }

    // 2️⃣ Vérifier que le poste existe vraiment en DB
 const existing = await this.queueRepository.findOne({
    where: { poste_id: posteId },
  });

  if (existing) return existing;

    // 4️⃣ Calculer la prochaine position (globale)

    const maxPositionResult = await this.queueRepository
      .createQueryBuilder('qp')
      .select('MAX(qp.position)', 'max_position')
      .getRawOne<{ max_position: number | null }>();

    const position  = (maxPositionResult?.max_position ?? 0) + 1;

    // 5️⃣ Créer la position
     const qp = this.queueRepository.create({
    poste_id: posteId,
    poste,
    position,
  });

    return await this.queueRepository.save(qp);
  }

  /**
   * Removes a commercial from the queue and updates the positions of subsequent users.
   */
  async removeFromQueue(posteId: string): Promise<void> {
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
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Gets the next commercial in the queue (round-robin) and moves them to the end.
   */
  async getNextInQueue(): Promise<WhatsappPoste | null> {
    
    return await this.queueLock.runExclusive(async () => {
      const next = await this.queueRepository.findOne({
        where: {}, 
        order: { position: 'ASC' },
        relations: ['poste'],
      });


      this.logger.warn(
        `⏳ Resherche  d'agent disponible, message mis en att---- (${next?.id})`,
      );

      if (!next || !next.poste) {
        return null;
      }
      this.logger.warn(
        `✅ Poste disponible: ${next.poste.name} (${next.poste.id})`,
      );
      await this.moveToEnd(next.poste_id);
    // console.log("================debut de la rechercher du puiste suivant=================",next.poste);

      return next.poste;
    });
  }

  async getQueuePositions(): Promise<QueuePosition[]> {
    return await this.queueRepository.find({
      order: { position: 'ASC' },
      relations: ['poste'],
    });
  }

  //  suprime et ajouter a la queue

  async moveToEnd(poste_id: string): Promise<void> {
    await this.removeFromQueue(poste_id);
    await this.addPosteToQueue(poste_id);
  }

  async checkAndInitQueue(): Promise<void> {
  const activeCount = await this.posteRepository.count({
    where: { is_active: true },
  });

  if (activeCount > 0) return;

  const postes = await this.posteRepository.find();

  for (const poste of postes) {
    await this.addPosteToQueue(poste.id);
  }
}

  async syncQueueWithActivePostes(): Promise<void> {
  const activePostes = await this.posteRepository.find({
    where: { is_active: true },
  });

  const activeIds = activePostes.map(p => p.id);
  const queue = await this.queueRepository.find();

  // supprimer les postes inactifs
  for (const qp of queue) {
    if (!activeIds.includes(qp.poste_id)) {
      await this.removeFromQueue(qp.poste_id);
    }
  }

  // ajouter les postes actifs absents
  for (const poste of activePostes) {
    const exists = queue.some(q => q.poste_id === poste.id);
    if (!exists) {
      await this.addPosteToQueue(poste.id);
    }
  }
}
}
