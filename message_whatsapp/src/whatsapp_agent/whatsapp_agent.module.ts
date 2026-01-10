import { Module } from '@nestjs/common';
import { WhatsappAgentService } from './whatsapp_agent.service';
import { WhatsappAgentGateway } from './whatsapp_agent.gateway';

@Module({
  providers: [WhatsappAgentGateway, WhatsappAgentService],
})
export class WhatsappAgentModule {}
