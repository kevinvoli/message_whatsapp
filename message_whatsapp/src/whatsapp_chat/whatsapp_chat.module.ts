import { Module } from '@nestjs/common';
import { WhatsappChatService } from './whatsapp_chat.service';
import { WhatsappChatController } from './whatsapp_chat.controller';
import { WhatsappChatGateway } from './whatsapp_chat.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappChat } from './entities/whatsapp_chat.entity';
import { WhatsappChatLabel } from 'src/whatsapp_chat_label/entities/whatsapp_chat_label.entity';
import { WhatsappCommercial } from 'src/whatsapp_commercial/entities/user.entity';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { QueuePosition } from 'src/dispatcher/entities/queue-position.entity';
import { QueueService } from 'src/dispatcher/services/queue.service';
import { WhatsappPosteService } from 'src/whatsapp_poste/whatsapp_poste.service';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { ConversationReadQueryService } from 'src/conversations/infrastructure/conversation-read-query.service';
import { ConversationCapacityModule } from 'src/conversation-capacity/conversation-capacity.module';
import { CommercialActionGateModule } from 'src/commercial-action-gate/commercial-action-gate.module';

/**
 * TICKET-06-B — ConversationReadQueryService enregistré ici.
 * Il centralise toutes les requêtes SELECT sur whatsapp_chat.
 * WhatsappChatService délègue ses méthodes de lecture à ce service.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappChat,
      WhatsappChatLabel,
      WhatsappCommercial,
      QueuePosition,
      WhatsappPoste,
      WhatsappMessage,
      WhapiChannel,
    ]),
    ConversationCapacityModule,
    CommercialActionGateModule,
  ],
  controllers: [WhatsappChatController],
  providers: [
    WhatsappChatGateway,
    WhatsappChatService,
    ConversationReadQueryService,
    WhatsappPosteService,
    WhatsappCommercialService,
    QueueService,
  ],
  exports: [WhatsappChatService, ConversationReadQueryService],
})
export class WhatsappChatModule {}
