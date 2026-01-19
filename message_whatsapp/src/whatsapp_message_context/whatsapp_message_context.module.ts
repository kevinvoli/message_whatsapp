import { Module } from '@nestjs/common';
import { WhatsappMessageContextService } from './whatsapp_message_context.service';
import { WhatsappMessageContextGateway } from './whatsapp_message_context.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMessageContent } from 'src/whatsapp_message_content/entities/whatsapp_message_content.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappMessageContent, WhatsappMessage]),
  ],
  providers: [WhatsappMessageContextGateway, WhatsappMessageContextService],
})
export class WhatsappMessageContextModule {}
