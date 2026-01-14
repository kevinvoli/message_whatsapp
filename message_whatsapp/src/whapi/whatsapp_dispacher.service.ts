// whapi.service.ts
import { Injectable, Logger } from '@nestjs/common';

import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhapiMessage } from './interface/whapi-webhook.interface';
import {
  MessageDirection,
  WhatsappMessageStatus,
} from 'src/whatsapp_message/entities/whatsapp_message.entity';

@Injectable()
export class WhapiServiceDispacher {
  private readonly logger = new Logger(WhapiServiceDispacher.name);

  constructor(
    private readonly commercialService: WhatsappCommercialService,
    private readonly messageService: WhatsappMessageService,
  ) {}

  async sendMessage(to: string, message: WhapiMessage) {
    const messageData = {
      message_id: message.id,
      external_id: message.id,
      chat_id: message.chat_id,
      type: message.type,
      text: message.text ? message.text.body : null,
      direction: message.from_me ? MessageDirection.OUT : MessageDirection.IN,
      from_me: message.from_me,
      from: message.from,
      from_name: message.from_name,
      timestamp: new Date(message.timestamp * 1000),
      status: WhatsappMessageStatus.DELIVERED,
      source: message.source,
    };
    await this.messageService.create(messageData);
    // Logic to send message via WhatsApp API
    this.logger.log(`Sending message to ${to}: ${message.from_me}`);
  }

  saveMessage(to: string, message: string) {
    // Logic to save message to database
    this.logger.log(`Saving message to ${to}: ${message}`);
  }
}
