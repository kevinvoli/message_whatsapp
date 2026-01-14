import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { QueuePosition } from '../entities/queue-position.entity';
import { WhatsappCommercial } from '../../users/entities/user.entity';

@Injectable()
export class QueueService {
  constructor(
    @InjectRepository(QueuePosition)
    private readonly queueRepository: Repository<QueuePosition>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Adds a commercial to the end of the queue.
   * If the user is already in the queue, they are not added again.
   */
  async addToQueue(userId: number): Promise<QueuePosition> {
    const existingPosition = await this.queueRepository.findOne({ where: { userId } });
    if (existingPosition) {
      return existingPosition;
    }

    const maxPositionResult = await this.queueRepository
      .createQueryBuilder('qp')
      .select('MAX(qp.position)', 'max_position')
      .getRawOne();

    const nextPosition = (maxPositionResult.max_position || 0) + 1;

    const newPosition = this.queueRepository.create({
      userId,
      position: nextPosition,
    });

    return this.queueRepository.save(newPosition);
  }

  /**
   * Removes a commercial from the queue and updates the positions of subsequent users.
   */
  async removeFromQueue(userId: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const positionToRemove = await queryRunner.manager.findOne(QueuePosition, { where: { userId } });

      if (!positionToRemove) {
        await queryRunner.commitTransaction();
        return;
      }

      const removedPosition = positionToRemove.position;
      await queryRunner.manager.remove(positionToRemove);

      await queryRunner.manager.createQueryBuilder()
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
  async getNextInQueue(): Promise<WhatsappCommercial | null> {
    const nextInQueue = await this.queueRepository.findOne({
      where: {},
      order: { position: 'ASC' },
      relations: ['user'],
    });

    if (!nextInQueue) {
      return null;
    }

    if (!nextInQueue.user) {
      throw new NotFoundException(`User with ID ${nextInQueue.userId} not found for queue position.`);
    }

    await this.moveToEnd(nextInQueue.userId);

    return nextInQueue.user;
  }

  /**
   * Gets the current state of the queue.
   */
  async getQueuePositions(): Promise<QueuePosition[]> {
    return this.queueRepository.find({
      order: { position: 'ASC' },
      relations: ['user'],
    });
  }

  /**
   * Moves a user to the end of the queue. Used for reconnections.
   */
  async moveToEnd(userId: number): Promise<void> {
    await this.removeFromQueue(userId);
    await this.addToQueue(userId);
  }
}
