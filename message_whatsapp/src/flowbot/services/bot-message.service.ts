import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotMessage, BotMessageContentType } from '../entities/bot-message.entity';
import { BotSendResult } from '../interfaces/provider-adapter.interface';

@Injectable()
export class BotMessageService {
  constructor(
    @InjectRepository(BotMessage)
    private readonly repo: Repository<BotMessage>,
  ) {}

  async saveOutbound(params: {
    sessionId: string;
    flowNodeId?: string;
    contentType?: BotMessageContentType;
    content?: string;
    mediaUrl?: string;
    sendResult: BotSendResult;
  }): Promise<BotMessage> {
    const msg = this.repo.create({
      sessionId: params.sessionId,
      flowNodeId: params.flowNodeId ?? null,
      contentType: params.contentType ?? BotMessageContentType.TEXT,
      content: params.content ?? null,
      mediaUrl: params.mediaUrl ?? null,
      externalMsgRef: params.sendResult.externalMessageRef,
      sentAt: params.sendResult.sentAt,
    });
    return this.repo.save(msg);
  }

  async findBySession(sessionId: string): Promise<BotMessage[]> {
    return this.repo.find({
      where: { sessionId },
      order: { sentAt: 'ASC' },
    });
  }
}
