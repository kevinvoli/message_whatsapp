import { Injectable } from '@nestjs/common';
import { WhatsappAgentService } from 'src/whatsapp_agent/whatsapp_agent.service';
import { WhatsappConversationService } from 'src/whatsapp_conversation/whatsapp_conversation.service';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhapiWebhookPayload } from './interface/whapi-webhook.interface';
import { extractMessageContent } from './utile/message-type';


@Injectable()
export class WhapiService {
  constructor(
    private readonly conversationService: WhatsappConversationService,
    private readonly messageService: WhatsappMessageService,
    private readonly agentService: WhatsappAgentService,
  ) {}

  private readonly baseUrl = process.env.WHAPI_URL;

  async sendTextMessage(chatId: string, text: string) {
    await fetch(`${this.baseUrl}/messages/text`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHAPI_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: chatId,
        body: text,
      }),
    });
  }

  async handleIncomingMessage(payload: WhapiWebhookPayload) {
    const message = payload.data;
    const BUSINESS_NUMBER = process.env.WHATSAPP_NUMBER;
    if ( message.from===BUSINESS_NUMBER ) return;

    const chatId = message.from;
    const timestamp = message.timestamp;

    const content = extractMessageContent(message);
   

    // 1️⃣ récupérer ou créer la conversation
    let conversation =
      await this.conversationService.findByChatId(chatId);

    if (!conversation) {
      const agent = await this.agentService.assignAgent();

      conversation = await this.conversationService.create({
        chatId,
        agent,
      });
    }

    // 2️⃣ sauvegarder le message
    await this.messageService.create({
      conversation,
      direction: 'IN',
      type,
      content,
      timestamp,
    });
  }
}
