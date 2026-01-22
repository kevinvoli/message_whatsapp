import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealtimeService } from './realtime.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { DispatcherModule } from 'src/dispatcher/dispatcher.module';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';

@Module({
  imports: [
    DispatcherModule,
    TypeOrmModule.forFeature([WhatsappMessage, WhatsappCommercial]),
  ],
  providers: [ RealtimeService,WhatsappMessageGateway,WhatsappMessageService,WhatsappChatService,WhatsappCommercialService],
})
export class RealtimeModule {}
