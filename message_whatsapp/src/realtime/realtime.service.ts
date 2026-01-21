import { Injectable } from '@nestjs/common';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
// import { CreateRealtimeDto } from './dto/create-realtime.dto';
// import { UpdateRealtimeDto } from './dto/update-realtime.dto';

@Injectable()
export class RealtimeService {
  constructor(
    private readonly gateway: WhatsappMessageGateway,
  ) {}

  emitIncomingMessage(conversation, message) {
    if (!conversation.chat_id || !conversation.commercial_id) return;

    this.gateway.emitIncomingMessage(
      conversation.chat_id,
      conversation.commercial_id,
      message,
    );

    this.gateway.emitIncomingConversation(conversation);
  }
}
