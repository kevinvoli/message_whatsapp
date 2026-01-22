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

  emitMessageStatusUpdate(
    conversationId: string,
    messageId: string,
    status: string,
  ) {
    this.gateway.handleMessageStatusUpdate(conversationId, messageId, status);
  }

  emitTypingEvent(chatId: string, state: 'start' | 'stop') {
    // Le gateway a déjà des méthodes pour 'typing:start' et 'typing:stop'.
    // Nous avons besoin d'une méthode unifiée ou d'appeler la bonne.
    // Pour l'instant, nous lions cela à une nouvelle méthode dans le gateway
    // qui acheminera l'événement vers le bon agent.
    if (state === 'start') {
      this.gateway.handleTypingStartFromWebhook(chatId);
    } else {
      this.gateway.handleTypingStopFromWebhook(chatId);
    }
  }
}
