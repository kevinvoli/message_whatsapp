import { Module } from '@nestjs/common';
import { CommunicationWhapiService } from './communication_whapi.service';
import { CommunicationWhapiController } from './communication_whapi.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

@Module({
  imports: [
      TypeOrmModule.forFeature([
       WhapiChannel,WhatsappChat
      ]),
    
    ],
  controllers: [CommunicationWhapiController],
  providers: [CommunicationWhapiService],
})
export class CommunicationWhapiModule {}
