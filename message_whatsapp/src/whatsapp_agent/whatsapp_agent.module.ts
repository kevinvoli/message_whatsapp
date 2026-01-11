import { Module } from '@nestjs/common';
import { WhatsappAgentService } from './whatsapp_agent.service';
import { WhatsappAgentGateway } from './whatsapp_agent.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappAgent } from './entities/whatsapp_agent.entity';
import { WhatsappConversation } from 'src/whatsapp_conversation/entities/whatsapp_conversation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    WhatsappAgent, WhatsappConversation,
  ])],
  providers: [WhatsappAgentGateway, WhatsappAgentService],
})
export class WhatsappAgentModule {}
