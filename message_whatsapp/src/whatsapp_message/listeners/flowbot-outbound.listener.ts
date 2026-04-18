import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FLOWBOT_OUTBOUND_SENT,
  FlowbotOutboundSentEvent,
} from 'src/flowbot/events/flowbot-outbound-sent.event';
import { WhatsappMessage, MessageDirection, WhatsappMessageStatus } from '../entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhatsappMessageGateway } from '../whatsapp_message.gateway';

@Injectable()
export class FlowbotOutboundListener {
  private readonly logger = new Logger(FlowbotOutboundListener.name);

  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly messageRepo: Repository<WhatsappMessage>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    @InjectRepository(WhapiChannel)
    private readonly channelRepo: Repository<WhapiChannel>,
    private readonly gateway: WhatsappMessageGateway,
  ) {}

  @OnEvent(FLOWBOT_OUTBOUND_SENT, { async: true })
  async handle(event: FlowbotOutboundSentEvent): Promise<void> {
    try {
      const chat = await this.chatRepo.findOne({ where: { chat_id: event.chatRef } });
      if (!chat) {
        this.logger.warn(`FlowbotOutboundListener: chat introuvable pour chatRef=${event.chatRef}`);
        return;
      }

      const channel = chat.channel_id
        ? await this.channelRepo.findOne({ where: { channel_id: chat.channel_id } })
        : null;

      const phone = event.chatRef.split('@')[0];

      const msg = this.messageRepo.create({
        message_id: event.providerMessageId,
        external_id: event.providerMessageId,
        provider_message_id: event.providerMessageId,
        provider: event.provider,
        chat_id: chat.chat_id,
        channel_id: chat.channel_id ?? '',
        type: 'text',
        from_me: true,
        direction: MessageDirection.OUT,
        from: phone,
        from_name: 'Bot',
        text: event.text,
        timestamp: event.sentAt,
        status: WhatsappMessageStatus.SENT,
        source: 'bot',
        poste_id: null,
        contact_id: null,
        quoted_message_id: null,
        dedicated_channel_id: channel?.poste_id ? channel.channel_id : null,
        sentiment_score: null,
        sentiment_label: null,
        chat,
        channel: channel ?? undefined,
      });

      const saved = await this.messageRepo.save(msg);
      this.logger.log(
        `FlowbotOutboundListener: message bot persisté id=${saved.id} chat_id=${chat.chat_id}`,
      );

      await this.chatRepo.update({ chat_id: chat.chat_id }, { last_activity_at: new Date() });

      // Notifier le frontend en temps réel (s'il y a un agent assigné)
      await this.gateway.notifyNewMessage(saved, chat);
    } catch (err) {
      this.logger.error(
        `FlowbotOutboundListener: erreur persistence pour chatRef=${event.chatRef} — ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
