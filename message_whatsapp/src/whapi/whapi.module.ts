import { Module } from '@nestjs/common';
import { WhapiService } from './whapi.service';
import { WhapiController } from './whapi.controller';
// import { WhatsappAgentService } from 'src/whatsapp_agent/whatsapp_agent.service';
// import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhapiServiceDispacher } from './whatsapp_dispacher.service';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CommunicationWhapiModule } from 'src/communication_whapi/communication_whapi.module';
import { WhatsappCommercialModule } from 'src/whatsapp_commercial/whatsapp_commercial.module';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';
import { WhatsappChatModule } from 'src/whatsapp_chat/whatsapp_chat.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappCommercial,
      WhatsappMessage,
      WhatsappChat,
    ]),
    WhatsappCommercialModule,
    WhatsappMessageModule,
    WhatsappChatModule,
    CommunicationWhapiModule,
  ],
  controllers: [WhapiController],
  providers: [WhapiService, WhapiServiceDispacher],
})
export class WhapiModule {}
