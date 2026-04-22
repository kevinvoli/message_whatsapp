import { Injectable, Logger } from '@nestjs/common';
import { WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { ConversationPublisher } from 'src/realtime/publishers/conversation.publisher';
import { DispatchQueryService } from '../infrastructure/dispatch-query.service';
import { transitionStatus } from 'src/conversations/domain/conversation-state-machine';

/**
 * TICKET-03-C — Cas d'usage : remettre en EN_ATTENTE les conversations ACTIF
 * dont l'agent associé est hors-ligne (is_active = false).
 *
 * Ces conversations ne sont pas réassignées immédiatement — les agents les
 * récupèrent naturellement en se reconnectant via le dispatch normal.
 */
@Injectable()
export class ResetStuckActiveUseCase {
  private readonly logger = new Logger(ResetStuckActiveUseCase.name);

  constructor(
    private readonly queryService: DispatchQueryService,
    private readonly conversationPublisher: ConversationPublisher,
  ) {}

  async execute(): Promise<{ reset: number }> {
    const activeChats = await this.queryService.findActiveChatsWithPoste();
    const stuck = activeChats.filter((c) => !c.poste || !c.poste.is_active);

    if (stuck.length === 0) return { reset: 0 };

    for (const chat of stuck) {
      transitionStatus(chat.chat_id, chat.status, WhatsappChatStatus.EN_ATTENTE, 'ResetStuckActive');
      // RÈGLE PERMANENTE — on garde le poste_id : la conversation reste attachée à ce poste
      // même quand l'agent est hors-ligne. Elle repassera ACTIF dès sa reconnexion.
      await this.queryService.updateChat(chat.id, {
        status: WhatsappChatStatus.EN_ATTENTE,
        first_response_deadline_at: null,
      });
      await this.conversationPublisher.emitConversationUpsertByChatId(chat.chat_id);
    }

    this.logger.log(`resetStuckActive: ${stuck.length} conversation(s) remise(s) en EN_ATTENTE (poste conservé)`);
    return { reset: stuck.length };
  }
}
