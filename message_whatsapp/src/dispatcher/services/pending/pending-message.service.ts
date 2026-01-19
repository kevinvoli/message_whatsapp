import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PendingMessage } from '../../entities/pending-message.entity';

@Injectable()
export class PendingMessageService {
  constructor(
    @InjectRepository(PendingMessage)
    private readonly pendingMessageRepository: Repository<PendingMessage>,
  ) {}

  /**
   * Stores a message when no agent is available.
   */
  async addPendingMessage(
    clientPhone: string,
    clientName: string,
    content: string,
    type: string,
    mediaUrl: string,
  ): Promise<PendingMessage> {
    const pendingMessage = this.pendingMessageRepository.create({
      clientPhone,
      clientName,
      content,
      type,
      mediaUrl,
    });
    return this.pendingMessageRepository.save(pendingMessage);
  }

  /**
   * Retrieves all pending messages.
   */
  async getPendingMessages(): Promise<PendingMessage[]> {
    return this.pendingMessageRepository.find();
  }

  /**
   * Removes a pending message after it has been successfully distributed.
   */
  async removePendingMessage(id: number): Promise<void> {
    await this.pendingMessageRepository.delete(id);
  }
}
