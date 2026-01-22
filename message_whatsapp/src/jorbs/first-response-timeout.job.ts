import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DispatcherService } from 'src/dispatcher/dispatcher.service';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { IsNull, LessThan, Repository } from 'typeorm';

@Injectable()
export class FirstResponseTimeoutJob {
  // ✅ DÉCLARATION OBLIGATOIRE
  private readonly agentIntervals = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,
    private readonly dispatcher: DispatcherService,
    private readonly gateway: WhatsappMessageGateway,
  ) {}

  startAgentSlaMonitor(agentId: string) {

    if (this.agentIntervals.has(agentId)) return;

    // ⚠️ PAS async ici
    const interval = setInterval(() => {
      // ✅ encapsulation propre de l’async
      void (async () => {
        const now = new Date();

        const chats = await this.chatRepo.find({
          where: {
            commercial_id: agentId,
            status: WhatsappChatStatus.ACTIF,
            last_commercial_message_at: IsNull(),
            first_response_deadline_at: LessThan(now),
          },
        });
        console.log("lencement du tcheque des reponse",now);
        
        for (const chat of chats) {
          await this.dispatcher.reinjectConversation(chat);
          this.gateway.emitConversationReassigned(chat.chat_id);
        }
      })();
    }, 60_000); // chaque minute

    this.agentIntervals.set(agentId, interval);
  }

  stopAgentSlaMonitor(agentId: string) {
    const interval = this.agentIntervals.get(agentId);

    if (interval) {
      clearInterval(interval);
      this.agentIntervals.delete(agentId);
    }
  }
}
