import { Module } from '@nestjs/common';
import { WhatsappCommercialService } from './whatsapp_commercial.service';
import { WhatsappCommercialController } from './whatsapp_commercial.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappCommercial } from './entities/user.entity';
import { QueuePosition } from 'src/dispatcher/entities/queue-position.entity';
import { QueueService } from 'src/dispatcher/services/queue.service';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappCommercial,QueuePosition,WhatsappPoste,WhatsappMessage,WhatsappChat])],
  controllers: [WhatsappCommercialController],
  providers: [WhatsappCommercialService,QueueService,],
  exports: [WhatsappCommercialService],
})
export class WhatsappCommercialModule {}
