import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { QueuePosition } from '../entities/queue-position.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { Mutex } from 'async-mutex';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  private readonly queueLock: Mutex = new Mutex();
  constructor(
    @InjectRepository(QueuePosition)
    private readonly queueRepository: Repository<QueuePosition>,

    @InjectRepository(WhatsappCommercial)
    private readonly userRepository: Repository<WhatsappCommercial>,

    private readonly dataSource: DataSource,
  ) {}

  /**
   * Adds a commercial to the end of the queue.
   * If the user is already in the queue, they are not added again.
   */
  async addToQueue(userId: string): Promise<QueuePosition | null> {
  

     console.log('______==__________il ne doit pas entre ici___________________++',userId);

      const user = await this.userRepository.findOne({
        where: { id: userId },
      });
 console.log('______==__________il ne doit pas entre ici______________=+');
      if (!user) {
        return null; // ⬅️ plus de throw
      }

      const existingPosition = await this.queueRepository.findOne({
        where: { userId },
      });

      if (existingPosition) {
        return existingPosition;
      }

      const maxPositionResult = await this.queueRepository
        .createQueryBuilder('qp')
        .select('MAX(qp.position)', 'max_position')
        .getRawOne<{ max_position: number | null }>();

      const nextPosition = (maxPositionResult?.max_position ?? 0) + 1;

      return this.queueRepository.save(
        this.queueRepository.create({ userId, position: nextPosition }),
      );
    
  }

  /**
   * Removes a commercial from the queue and updates the positions of subsequent users.
   */
  async removeFromQueue(userId: string): Promise<void> {
     console.log('______==__________il ne doit pas entre ici__________________=');
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const positionToRemove = await queryRunner.manager.findOne(
        QueuePosition,
        { where: { userId } },
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
       console.log('______==__________il ne doit pas entre ici___________________+');
      await queryRunner.release();
    }
  }

  /**
   * Gets the next commercial in the queue (round-robin) and moves them to the end.
   */
  async getNextInQueue(): Promise<WhatsappCommercial | null> {
    return await this.queueLock.runExclusive(async () => {
      const nextInQueue = await this.queueRepository.findOne({
        where: {},
        order: { position: 'ASC' },
        relations: ['user'],
      });

      this.logger.warn(
        `⏳ Resherche  d'agent disponible, message mis en att---- (${nextInQueue?.id})`,
      );

      if (!nextInQueue) {
        return null;
      }
      if (!nextInQueue.user) {
        throw new NotFoundException(
          `User with ID ${nextInQueue.userId} not found for queue position.`,
        );
      }
      this.logger.warn(
        `⏳   agent disponible, a l'id: (${nextInQueue?.user.id})`,
      );
      await this.moveToEnd(nextInQueue.userId);
       console.log('______==__________il ne doit pas entre ici___________________',nextInQueue);
      return nextInQueue.user;
    });
  }

  async getQueuePositions(): Promise<QueuePosition[]> {
    return await this.queueRepository.find({
      order: { position: 'ASC' },
      relations: ['user'],
    });
  }

  //  suprime et ajouter a la queue

  async moveToEnd(userId: string): Promise<void> {
     console.log('______==__________il ne doit pas entre ici___________________',userId);
    await this.removeFromQueue(userId);
    await this.addToQueue(userId);
     console.log('______==__________il ne doit pas entre ici_________==__________');
  }

  async tcheckALlRankAndAdd(id: string) {
    console.log('queue fantome', id);

    const rank = await this.queueRepository.find();
    const agent = await this.userRepository.find();

    if (rank) {
      if (!agent) return null;
      // console.log('reng des nocture:', agent);

      for (const agen of agent) {
        console.log('reng des nocture:', agen);

        await this.addToQueue(agen.id);
      }
    }
    const rankss = await this.queueRepository.find();
    console.log('reng des nocture:', rankss);

    if (rank) return null;
    return;
  }

  async removeALlRankOnfline(id: string) {
    console.log('queue fantome', id);

    const rank = await this.queueRepository.find();
    const agent = await this.userRepository.find({
      where: {
        isConnected: false,
      },
    });

    if (rank) {
      if (!agent) return null;
      console.log('reng des nocture:', agent);

      for (const agen of agent) {
        console.log('reng des nocture:', agen);

        await this.removeFromQueue(agen.id);
      }
    }
    const rankss = await this.queueRepository.find();
    console.log('reng des nocture:', rankss);

    if (rank) return null;
    return;
  }
}
