import { Module } from '@nestjs/common';
import { WhatsappMediaService } from './whatsapp_media.service';
import { WhatsappMediaGateway } from './whatsapp_media.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMedia } from './entities/whatsapp_media.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';

@Module({
   imports: [TypeOrmModule.forFeature([
          WhatsappMedia,WhatsappMessage,WhatsappChat
        ])],
  providers: [WhatsappMediaGateway, WhatsappMediaService,WhatsappMediaService],
})
export class WhatsappMediaModule {}
