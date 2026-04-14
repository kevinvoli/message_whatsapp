import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlowSession, FlowSessionStatus } from '../entities/flow-session.entity';
import { BotConversation } from '../entities/bot-conversation.entity';
import { FlowBot } from '../entities/flow-bot.entity';

@Injectable()
export class FlowSessionService {
  private readonly logger = new Logger(FlowSessionService.name);

  constructor(
    @InjectRepository(FlowSession)
    private readonly repo: Repository<FlowSession>,
  ) {}

  async getActiveSession(conversation: BotConversation): Promise<FlowSession | null> {
    if (!conversation.activeSessionId) return null;
    return this.repo.findOne({
      where: {
        id: conversation.activeSessionId,
        conversationId: conversation.id,
      },
      relations: ['currentNode'],
    });
  }

  async createSession(params: {
    conversation: BotConversation;
    flow: FlowBot;
    triggerType: string;
  }): Promise<FlowSession> {
    const session = this.repo.create({
      conversationId: params.conversation.id,
      flowId: params.flow.id,
      status: FlowSessionStatus.ACTIVE,
      variables: {},
      stepsCount: 0,
      triggerType: params.triggerType,
      startedAt: new Date(),
      lastActivityAt: new Date(),
    });
    const saved = await this.repo.save(session);
    this.logger.log(
      `FlowSession created id=${saved.id} flowId=${saved.flowId} convId=${saved.conversationId}`,
    );
    return saved;
  }

  async save(session: FlowSession): Promise<FlowSession> {
    return this.repo.save(session);
  }

  async findById(id: string): Promise<FlowSession | null> {
    return this.repo.findOne({ where: { id }, relations: ['currentNode', 'conversation'] });
  }

  /** Sessions en attente de délai (nœud WAIT) dont le délai est dépassé */
  async findExpiredWaitingDelay(thresholdSeconds: number): Promise<FlowSession[]> {
    const cutoff = new Date(Date.now() - thresholdSeconds * 1000);
    return this.repo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: FlowSessionStatus.WAITING_DELAY })
      .andWhere('s.lastActivityAt < :cutoff', { cutoff })
      .leftJoinAndSelect('s.conversation', 'conversation')
      .getMany();
  }

  /** Sessions en attente de réponse depuis plus de X secondes */
  async findExpiredWaitingReply(thresholdSeconds: number): Promise<FlowSession[]> {
    const cutoff = new Date(Date.now() - thresholdSeconds * 1000);
    return this.repo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: FlowSessionStatus.WAITING_REPLY })
      .andWhere('s.lastActivityAt < :cutoff', { cutoff })
      .getMany();
  }

  /** Sessions actives depuis plus de 24h → expiration */
  async findExpiredActive(maxDurationHours = 24): Promise<FlowSession[]> {
    const cutoff = new Date(Date.now() - maxDurationHours * 3_600_000);
    return this.repo
      .createQueryBuilder('s')
      .where('s.status IN (:...statuses)', {
        statuses: [FlowSessionStatus.ACTIVE, FlowSessionStatus.WAITING_DELAY],
      })
      .andWhere('s.startedAt < :cutoff', { cutoff })
      .getMany();
  }
}
