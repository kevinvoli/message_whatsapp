import { Module } from '@nestjs/common';
import { WhapiService } from './whapi.service';
import { WhapiController } from './whapi.controller';
// import { WhatsappAgentService } from 'src/whatsapp_agent/whatsapp_agent.service';
// import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { WhatsappConversation } from 'src/whatsapp_conversation/entities/whatsapp_conversation.entity';
// import { WhatsappAgent } from 'src/whatsapp_agent/entities/whatsapp_agent.entity';

@Module({
   imports:[
      TypeOrmModule.forFeature(),
  ],
  controllers: [WhapiController],
  providers: [WhapiService],
})
export class WhapiModule {}
