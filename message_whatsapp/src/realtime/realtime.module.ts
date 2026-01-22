import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealtimeService } from './realtime.service';
import { DispatcherModule } from 'src/dispatcher/dispatcher.module';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappMessageModule } from 'src/whatsapp_message/whatsapp_message.module';
import { WhatsappChatModule } from 'src/whatsapp_chat/whatsapp_chat.module';
import { WhatsappCommercialModule } from 'src/whatsapp_commercial/whatsapp_commercial.module';
import { CommunicationWhapiModule } from 'src/communication_whapi/communication_whapi.module';

@Module({
  imports: [
    forwardRef(() => DispatcherModule),
    TypeOrmModule.forFeature([WhatsappMessage, WhatsappCommercial]),
    WhatsappMessageModule,
    WhatsappChatModule,
    WhatsappCommercialModule,
    CommunicationWhapiModule,
  ],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
