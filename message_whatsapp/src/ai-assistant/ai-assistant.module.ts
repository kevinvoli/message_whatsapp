import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { AiAssistantService } from './ai-assistant.service';
import { AiAssistantController } from './ai-assistant.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappMessage, WhatsappChat])],
  providers: [AiAssistantService],
  controllers: [AiAssistantController],
  exports: [AiAssistantService],
})
export class AiAssistantModule {}
