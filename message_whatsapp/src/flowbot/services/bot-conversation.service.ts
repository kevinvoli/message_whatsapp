import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BotConversation,
  BotConversationStatus,
} from '../entities/bot-conversation.entity';
import { BotInboundMessageEvent } from '../events/bot-inbound-message.event';

@Injectable()
export class BotConversationService {
  private readonly logger = new Logger(BotConversationService.name);

  constructor(
    @InjectRepository(BotConversation)
    private readonly repo: Repository<BotConversation>,
  ) {}

  /**
   * Crée ou met à jour la BotConversation pour cette conversation source.
   * Le chatRef est la clé métier — la ligne persiste entre les sessions.
   */
  async upsert(event: BotInboundMessageEvent): Promise<BotConversation> {
    let conv = await this.repo.findOne({
      where: { chatRef: event.conversationExternalRef },
    });

    if (!conv) {
      conv = this.repo.create({
        chatRef: event.conversationExternalRef,
        status: BotConversationStatus.IDLE,
        isKnownContact: false,
        isReopened: event.isReopened,
      });
      await this.repo.save(conv);
      this.logger.log(
        `BotConversation created chatRef=${conv.chatRef} id=${conv.id}`,
      );
    } else if (event.isReopened && !conv.isReopened) {
      conv.isReopened = true;
      await this.repo.save(conv);
    }

    return conv;
  }

  async findById(id: string): Promise<BotConversation | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByChatRef(chatRef: string): Promise<BotConversation | null> {
    return this.repo.findOne({ where: { chatRef } });
  }

  async save(conv: BotConversation): Promise<BotConversation> {
    return this.repo.save(conv);
  }

  async findAllByStatus(status: BotConversationStatus): Promise<BotConversation[]> {
    return this.repo.find({ where: { status } });
  }
}
