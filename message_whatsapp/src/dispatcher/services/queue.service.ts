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
    @InjectRepository(WhatsappCommercial)
    private readonly userRepository: Repository<WhatsappCommercial>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Adds a commercial to the end of the queue.
   * If the user is already in the queue, they are not added again.
   */
  async addToQueue(userId: string): Promise<QueuePosition> {
    // Chercher l'utilisateur par son UUID (string)
    const user = await this.userRepository.findOne({ 
      where: { id: userId } // Pas besoin de .toString() car userId est déjà un string
    });
    
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    // Vérifier si l'utilisateur est déjà dans la file d'attente
    const existingPosition = await this.queueRepository.findOne({ 
      where: { userId: userId } 
    });
    
    if (existingPosition) {
      return existingPosition;
    }

    // Trouver la position maximale actuelle
    const maxPositionResult = await this.queueRepository
      .createQueryBuilder('qp')
      .select('MAX(qp.position)', 'max_position')
      .getRawOne();

    const nextPosition = (maxPositionResult.max_position || 0) + 1;

    // Créer la nouvelle position dans la file
    const newPosition = this.queueRepository.create({
      userId: userId, // string, pas number
      position: nextPosition,
    });

    return await this.queueRepository.save(newPosition); // Pas besoin de return[]
  }

  /**
   * Removes a commercial from the queue and updates the positions of subsequent users.
   */
  async removeFromQueue(userId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Chercher la position à supprimer (userId est un string)
      const positionToRemove = await queryRunner.manager.findOne(QueuePosition, { 
        where: { userId: userId } 
      });

      if (!positionToRemove) {
        await queryRunner.commitTransaction();
        return;
      }

      const removedPosition = positionToRemove.position;
      
      // Supprimer la position
      await queryRunner.manager.remove(positionToRemove);

      // Réorganiser les positions restantes
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

    // Déplacer à la fin
    await this.moveToEnd(nextInQueue.userId);

    return nextInQueue.user;
  }

  /**
   * Gets the current state of the queue.
   */
  async getQueuePositions(): Promise<QueuePosition[]> {
    return await this.queueRepository.find({
      order: { position: 'ASC' },
      relations: ['user'],
    });
  }

  /**
   * Moves a user to the end of the queue. Used for reconnections.
   */
  async moveToEnd(userId: string): Promise<void> {
    await this.removeFromQueue(userId);
    await this.addToQueue(userId);
  }

  /**
   * Removes a user from queue by their ID
   */
  async removeByUserId(userId: string): Promise<void> {
    await this.queueRepository.delete({ userId: userId });
  }

  /**
   * Clears the entire queue
   */
  async clearQueue(): Promise<void> {
    await this.queueRepository.clear();
  }

  /**
   * Check if a user is in the queue
   */
  async isUserInQueue(userId: string): Promise<boolean> {
    const position = await this.queueRepository.findOne({
      where: { userId: userId }
    });
    return !!position;
  }

  /**
   * Get user's position in queue
   */
  async getUserPosition(userId: string): Promise<number | null> {
    const position = await this.queueRepository.findOne({
      where: { userId: userId },
      select: ['position']
    });
    
    return position ? position.position : null;
  }
}