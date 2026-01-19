import { Module } from '@nestjs/common';
import { WhatsappMessageReactionService } from './whatsapp_message_reaction.service';
import { WhatsappMessageReactionGateway } from './whatsapp_message_reaction.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { WhatsappMessageReaction } from './entities/whatsapp_message_reaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappMessage, WhatsappMessageReaction]),
  ],
  providers: [WhatsappMessageReactionGateway, WhatsappMessageReactionService],
})
export class WhatsappMessageReactionModule {}
