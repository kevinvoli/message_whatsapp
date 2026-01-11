import { Module } from '@nestjs/common';
import { WhatsappLastMessageService } from './whatsapp_last_message.service';
import { WhatsappLastMessageGateway } from './whatsapp_last_message.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappLastMessage } from './entities/whatsapp_last_message.entity';

@Module({
   imports: [TypeOrmModule.forFeature([
          WhatsappLastMessage
        ])],
  providers: [WhatsappLastMessageGateway, WhatsappLastMessageService],
})
export class WhatsappLastMessageModule {}
