import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { Contact } from 'src/contact/entities/contact.entity';
import { CallLog } from 'src/call-log/entities/call_log.entity';
import { FollowUp } from 'src/follow-up/entities/follow_up.entity';
import { SystemConfigModule } from 'src/system-config/system-config.module';
import { AiGovernanceModule } from 'src/ai-governance/ai-governance.module';
import { AiAssistantService } from './ai-assistant.service';
import { AiAssistantController } from './ai-assistant.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappMessage, WhatsappChat, Contact, CallLog, FollowUp]),
    SystemConfigModule,
    AiGovernanceModule,
  ],
  providers: [AiAssistantService],
  controllers: [AiAssistantController],
  exports: [AiAssistantService],
})
export class AiAssistantModule {}
