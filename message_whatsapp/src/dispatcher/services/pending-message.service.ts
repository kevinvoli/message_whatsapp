import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MessageSource, PendingMessage, PendingMessageStatus, PendingMessageType } from '../entities/pending-message.entity';


@Injectable()
export class PendingMessageService {
  private readonly logger = new Logger(PendingMessageService.name);

  constructor(
    @InjectRepository(PendingMessage)
    private readonly pendingRepo: Repository<PendingMessage>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * ➕ Enregistrer un message entrant (WHAPI)
   */
  async createIncomingMessage(input: {
    conversationId: string;
    content: string;
    type: PendingMessageType;
    mediaUrl?: string;
    source?: MessageSource;
  }): Promise<PendingMessage> {
    const message = this.pendingRepo.create({
      conversationId: input.conversationId,
      content: input.content,
      type: input.type,
      mediaUrl: input.mediaUrl,
      source: input.source ?? MessageSource.CLIENT,
      status: PendingMessageStatus.WAITING,
    });

    return this.pendingRepo.save(message);
  }

  /**
   * 📥 Récupérer le prochain message à dispatcher (FIFO)
   * ⚠️ Utilisé UNIQUEMENT par le dispatcher
   */
  async getNextPendingMessage(): Promise<PendingMessage | null> {
    return this.pendingRepo.findOne({
      where: { status: PendingMessageStatus.WAITING },
      order: { receivedAt: 'ASC' },
    });
  }

  /**
   * 🔒 Récupération + verrouillage (ANTI double dispatch)
   * 👉 À utiliser en PROD
   */
  async lockNextPendingMessage(): Promise<PendingMessage | null> {
    return this.dataSource.transaction(async manager => {
      const message = await manager.findOne(PendingMessage, {
        where: { status: PendingMessageStatus.WAITING },
        order: { receivedAt: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });

      if (!message) return null;

      message.status = PendingMessageStatus.DISPATCHED;
      await manager.save(message);

      return message;
    });
  }

  /**
   * ✅ Marquer un message comme dispatché
   */
  async markAsDispatched(id: string): Promise<void> {
    await this.pendingRepo.update(id, {
      status: PendingMessageStatus.DISPATCHED,
    });
  }

  /**
   * ⏰ Expirer les messages trop anciens
   */
  async expireOldMessages(minutes = 30): Promise<number> {
    const date = new Date(Date.now() - minutes * 60 * 1000);

    const result = await this.pendingRepo
      .createQueryBuilder()
      .update(PendingMessage)
      .set({ status: PendingMessageStatus.EXPIRED })
      .where('status = :status', { status: PendingMessageStatus.WAITING })
      .andWhere('received_at < :date', { date })
      .execute();

    this.logger.warn(`Expired ${result.affected} pending messages`);
    return result.affected ?? 0;
  }

  /**
   * 🔎 Debug / Admin
   */
  async countWaiting(): Promise<number> {
    return this.pendingRepo.count({
      where: { status: PendingMessageStatus.WAITING },
    });
  }
}
