import { Module } from '@nestjs/common';
import { WhatsappMessageEventService } from './whatsapp_message_event.service';
import { WhatsappMessageEventGateway } from './whatsapp_message_event.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappMessageEvent } from './entities/whatsapp_message_event.entity';

@Module({
   imports: [TypeOrmModule.forFeature([
          WhatsappMessage, WhatsappMessageEvent
        ])],
  providers: [WhatsappMessageEventGateway, WhatsappMessageEventService],
})
export class WhatsappMessageEventModule {}
