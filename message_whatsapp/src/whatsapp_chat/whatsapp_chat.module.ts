import { Module } from '@nestjs/common';
import { WhatsappChatService } from './whatsapp_chat.service';
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

@Module({
  imports: [TypeOrmModule.forFeature([
    WhatsappChat,WhatsappChatLabel,   WhatsappCommercial, QueuePosition,
    WhatsappPoste
      ])],
  providers: [WhatsappChatGateway, WhatsappChatService, WhatsappPosteService ,WhatsappCommercialService,QueueService],
})
export class WhatsappChatModule {}
