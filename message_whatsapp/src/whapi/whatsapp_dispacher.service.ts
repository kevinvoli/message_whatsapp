// whapi.service.ts
import { Injectable, Logger } from '@nestjs/common';

import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { CreateWhatsappMessageDto } from 'src/whatsapp_message/dto/create-whatsapp_message.dto';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';


@Injectable()
export class WhapiServiceDispacher {
  private readonly logger = new Logger(WhapiServiceDispacher.name);

  constructor(
        private readonly commercialService: WhatsappCommercialService,
         private readonly messageService: WhatsappMessageService,
  ) {}



  async sendMessage(to: string, message: CreateWhatsappMessageDto) {

    await this.messageService.create(message);
    // Logic to send message via WhatsApp API
    this.logger.log(`Sending message to ${to}: ${message.from_me}`);
  }

  saveMessage(to: string, message: string) {
    // Logic to save message to database
    this.logger.log(`Saving message to ${to}: ${message}`);
  }


}
