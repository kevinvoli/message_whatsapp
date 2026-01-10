import { Module } from '@nestjs/common';
import { WhatsappMessageReactionService } from './whatsapp_message_reaction.service';
import { WhatsappMessageReactionGateway } from './whatsapp_message_reaction.gateway';

@Module({
  providers: [WhatsappMessageReactionGateway, WhatsappMessageReactionService],
})
export class WhatsappMessageReactionModule {}
