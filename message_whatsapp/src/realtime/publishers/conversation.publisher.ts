import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WhatsappChatService } from 'src/whatsapp_chat/whatsapp_chat.service';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { RealtimeServerService } from '../realtime-server.service';
import { mapConversation } from '../mappers/socket-conversation.mapper';

@Injectable()
export class ConversationPublisher {
  private readonly logger = new Logger(ConversationPublisher.name);

  constructor(
    private readonly realtimeServer: RealtimeServerService,
    private readonly chatService: WhatsappChatService,
    private readonly messageService: WhatsappMessageService,
  ) {}

  async emitConversationAssigned(chatId: string): Promise<void> {
    const chat = await this.chatService.findBychat_id(chatId);
    if (!chat?.poste_id) return;
    const lastMessage =
      await this.messageService.findLastMessageBychat_id(chatId);
    this.realtimeServer.getServer().to(`poste:${chat.poste_id}`).emit('chat:event', {
      type: 'CONVERSATION_ASSIGNED',
      payload: mapConversation(chat, lastMessage, chat.unread_count ?? 0),
    });
    this.logger.log(
      `CONVERSATION_ASSIGNED emitted for chat ${chatId} → poste:${chat.poste_id}`,
    );
  }

  emitConversationRemoved(chatId: string, posteId: string): void {
    this.realtimeServer.getServer().to(`poste:${posteId}`).emit('chat:event', {
      type: 'CONVERSATION_REMOVED',
      payload: { chat_id: chatId },
    });
    this.logger.log(
      `CONVERSATION_REMOVED emitted for chat ${chatId} → poste:${posteId}`,
    );
  }

  async emitConversationReassigned(
    chat: WhatsappChat,
    oldPosteId: string,
    newPosteId: string,
  ): Promise<void> {
    this.logger.log(
      `Conversation ${chat.chat_id} reassigned ${oldPosteId} → ${newPosteId}`,
    );

    this.realtimeServer.getServer().to(`poste:${oldPosteId}`).emit('chat:event', {
      type: 'CONVERSATION_REMOVED',
      payload: { chat_id: chat.chat_id },
    });

    const freshChat = await this.chatService.findBychat_id(chat.chat_id);
    if (freshChat) {
      const lastMessage =
        await this.messageService.findLastMessageBychat_id(chat.chat_id);
      this.realtimeServer.getServer().to(`poste:${newPosteId}`).emit('chat:event', {
        type: 'CONVERSATION_ASSIGNED',
        payload: mapConversation(freshChat, lastMessage, freshChat.unread_count ?? 0),
      });
    }

    this.logger.log(
      `CONVERSATION_REMOVED → poste:${oldPosteId} | CONVERSATION_ASSIGNED → poste:${newPosteId}`,
    );
  }

  /**
   * Batch emit : charge toutes les chats + derniers messages en 2 requêtes
   * puis émet les événements sans requête DB dans la boucle.
   * Remplace N × emitConversationReassigned() pour les cycles SLA.
   */
  async emitBatchReassignments(
    reassignments: Array<{
      chatId: string;
      oldPosteId: string;
      newPosteId: string;
    }>,
  ): Promise<void> {
    if (reassignments.length === 0) return;

    const chatIds = reassignments.map((r) => r.chatId);
    const chatMap = await this.chatService.findBulkByChatIds(chatIds);
    const msgMap = await this.messageService.findLastMessagesBulk(chatIds);
    const server = this.realtimeServer.getServer();

    for (const { chatId, oldPosteId, newPosteId } of reassignments) {
      server.to(`poste:${oldPosteId}`).emit('chat:event', {
        type: 'CONVERSATION_REMOVED',
        payload: { chat_id: chatId },
      });

      const chat = chatMap.get(chatId);
      if (chat) {
        server.to(`poste:${newPosteId}`).emit('chat:event', {
          type: 'CONVERSATION_ASSIGNED',
          payload: mapConversation(
            chat,
            msgMap.get(chatId) ?? null,
            chat.unread_count ?? 0,
          ),
        });
      }
    }

    this.logger.log(
      `Batch SLA emit: ${reassignments.length} réassignation(s) émises en lot`,
    );
  }

  async emitConversationUpsertByChatId(chatId: string): Promise<void> {
    const chat = await this.chatService.findBychat_id(chatId);
    if (!chat?.poste_id) {
      this.logger.warn(
        `Conversation upsert skipped: no assigned poste for chat ${chatId}`,
      );
      return;
    }
    const lastMessage =
      await this.messageService.findLastMessageBychat_id(chatId);
    this.realtimeServer.getServer().to(`poste:${chat.poste_id}`).emit('chat:event', {
      type: 'CONVERSATION_UPSERT',
      payload: mapConversation(chat, lastMessage, chat.unread_count ?? 0),
    });
  }

  emitConversationReadonly(chat: WhatsappChat): void {
    if (!chat.poste_id) return;
    this.realtimeServer.getServer().to(`poste:${chat.poste_id}`).emit('chat:event', {
      type: 'CONVERSATION_READONLY',
      payload: { chat_id: chat.chat_id, read_only: chat.read_only },
    });
  }

  /**
   * Appelé après fermeture automatique par le cron.
   * Envoie CONVERSATION_UPSERT avec status=fermé → le frontend retire la conversation.
   */
  async emitConversationClosed(chat: WhatsappChat): Promise<void> {
    if (!chat.poste_id) return;
    const lastMessage = await this.messageService.findLastMessageBychat_id(
      chat.chat_id,
    );
    this.realtimeServer.getServer().to(`poste:${chat.poste_id}`).emit('chat:event', {
      type: 'CONVERSATION_UPSERT',
      payload: mapConversation(chat, lastMessage, chat.unread_count ?? 0),
    });
  }

  /**
   * Pousse un event REPORT_SUBMITTED au front dès que le rapport est soumis.
   * Le frontend met à jour le badge "rapport envoyé" sans rechargement.
   */
  @OnEvent('conversation.report.submitted', { async: true })
  async handleReportSubmitted(payload: {
    chatId: string;
    posteId: string | null;
  }): Promise<void> {
    if (!payload.posteId) return;
    this.realtimeServer.getServer().to(`poste:${payload.posteId}`).emit('chat:event', {
      type: 'REPORT_SUBMITTED',
      payload: { chat_id: payload.chatId, report_submission_status: 'sent' },
    });
    this.logger.log(`REPORT_SUBMITTED émis pour chat=${payload.chatId} → poste:${payload.posteId}`);
  }

  isAgentConnected(posteId: string, connectedPosteIds: string[]): boolean {
    return connectedPosteIds.includes(posteId);
  }
}
