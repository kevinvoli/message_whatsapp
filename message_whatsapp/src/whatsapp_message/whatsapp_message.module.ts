import { forwardRef, Module } from '@nestjs/common';
import { WhatsappMessageService } from './whatsapp_message.service';
import { WhatsappMessageGateway } from './whatsapp_message.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMessage } from './entities/whatsapp_message.entity';
import { WhatsappMessageContent } from 'src/whatsapp_message_content/entities/whatsapp_message_content.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappChatModule } from 'src/whatsapp_chat/whatsapp_chat.module';
import { CommunicationWhapiModule } from 'src/communication_whapi/communication_whapi.module';
import { DispatcherModule } from 'src/dispatcher/dispatcher.module';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappCommercialModule } from 'src/whatsapp_commercial/whatsapp_commercial.module';
import { QueuePosition } from 'src/dispatcher/entities/queue-position.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappMessage,
      WhatsappChat,
      WhatsappMessageContent,
      WhatsappCommercial,
      QueuePosition,
    ]),
    WhatsappChatModule,
    forwardRef(() => DispatcherModule),
    CommunicationWhapiModule,
    WhatsappCommercialModule,
  ],
  providers: [WhatsappMessageService, WhatsappMessageGateway],
  exports: [WhatsappMessageService, WhatsappMessageGateway],
})
export class WhatsappMessageModule {}
