import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappMessage, MessageDirection } from './entities/whatsapp_message.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { DispatchSettings } from 'src/dispatcher/entities/dispatch-settings.entity';
import { MessageReadRateLimiterService } from './message-read-rate-limiter.service';

@Injectable()
export class MessageReadService {
  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepository: Repository<WhatsappCommercial>,
    @InjectRepository(DispatchSettings)
    private readonly settingsRepository: Repository<DispatchSettings>,
    private readonly rateLimiter: MessageReadRateLimiterService,
  ) {}

  async markConversationAsRead(
    commercialId: string,
    chatId: string,
  ): Promise<{ markedCount: number }> {
    const settings = await this.settingsRepository.findOne({ where: {}, order: { createdAt: 'ASC' } });
    const maxPerMinute = settings?.maxReadMessagesPerMinute ?? 1;

    const messages = await this.messageRepository
      .createQueryBuilder('m')
      .select('m.id')
      .where('m.chat_id = :chatId', { chatId })
      .andWhere('m.direction = :direction', { direction: MessageDirection.IN })
      .andWhere('m.readByCommercialId IS NULL')
      .getMany();

    if (messages.length === 0) {
      return { markedCount: 0 };
    }

    const granted = this.rateLimiter.consumeUpTo(commercialId, messages.length, maxPerMinute);
    if (granted === 0) {
      return { markedCount: 0 };
    }

    const toMark = messages.slice(0, granted);
    const ids = toMark.map((m) => m.id);
    await this.messageRepository
      .createQueryBuilder()
      .update(WhatsappMessage)
      .set({
        readByCommercialId: commercialId,
        readByCommercialAt: () => 'NOW()',
      })
      .whereInIds(ids)
      .execute();

    await this.commercialRepository
      .createQueryBuilder()
      .update(WhatsappCommercial)
      .set({
        messagesReadCount: () => `messages_read_count + ${granted}`,
        lastActivityAt: () => 'NOW()',
      })
      .where('id = :id', { id: commercialId })
      .execute();

    return { markedCount: granted };
  }
}
