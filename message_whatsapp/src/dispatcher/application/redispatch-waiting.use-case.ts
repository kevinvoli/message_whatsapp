import { Injectable, Logger } from '@nestjs/common';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { Mutex } from 'async-mutex';
import { NotificationService } from 'src/notification/notification.service';
import { ChannelService } from 'src/channel/channel.service';
import { ConversationPublisher } from 'src/realtime/publishers/conversation.publisher';
import { QueueService } from '../services/queue.service';
import { DispatchQueryService } from '../infrastructure/dispatch-query.service';
import { SlaPolicyService } from '../domain/sla-policy.service';
import { transitionStatus } from 'src/conversations/domain/conversation-state-machine';

/**
 * TICKET-03-C — Cas d'usage : redistribuer toutes les conversations EN_ATTENTE.
 * Déclenché manuellement depuis le controller admin.
 */
@Injectable()
export class RedispatchWaitingUseCase {
  private readonly logger = new Logger(RedispatchWaitingUseCase.name);
  private readonly chatDispatchLocks = new Map<string, Mutex>();

  constructor(
    private readonly queryService: DispatchQueryService,
    private readonly queueService: QueueService,
    private readonly channelService: ChannelService,
    private readonly conversationPublisher: ConversationPublisher,
    private readonly notificationService: NotificationService,
    private readonly slaPolicy: SlaPolicyService,
  ) {}

  async execute(): Promise<{ dispatched: number; still_waiting: number }> {
    const waitingChats = await this.queryService.findWaitingChatsWithPoste();

    let dispatched = 0;
    let stillWaiting = 0;

    for (const chat of waitingChats) {
      if (chat.read_only) { stillWaiting++; continue; }

      // RÈGLE PERMANENTE — conserver le poste d'origine, jamais redispatché
      if (chat.poste_id) { stillWaiting++; continue; }

      const lock = this.getOrCreateLock(chat.chat_id);
      const assigned = await lock.runExclusive(async () => {
        const nextAgent = await this.queueService.getNextInQueue();
        if (!nextAgent) return false;

        const oldPosteId = chat.poste_id;
        const targetStatus = nextAgent.is_active
          ? WhatsappChatStatus.ACTIF
          : WhatsappChatStatus.EN_ATTENTE;
        transitionStatus(chat.chat_id, chat.status, targetStatus, 'RedispatchWaiting');

        await this.queryService.updateChat(chat.id, {
          poste: nextAgent,
          poste_id: nextAgent.id,
          status: targetStatus,
          assigned_at: new Date(),
          assigned_mode: nextAgent.is_active ? 'ONLINE' : 'OFFLINE',
          first_response_deadline_at: this.slaPolicy.redispatchDeadline(),
        });

        if (oldPosteId && oldPosteId !== nextAgent.id) {
          await this.conversationPublisher.emitConversationRemoved(chat.chat_id, oldPosteId);
        }
        await this.conversationPublisher.emitConversationAssigned(chat.chat_id);
        void this.notificationService.create(
          'info',
          `Conversation assignée (manuel) — ${chat.name || chat.chat_id}`,
          `Assignée au poste ${nextAgent.name}.`,
        );
        return true;
      });

      this.releaseLock(chat.chat_id, lock);

      if (assigned) { dispatched++; }
      else { stillWaiting++; }
    }

    this.logger.log(`Redispatch manuel: ${dispatched} assignée(s), ${stillWaiting} toujours en attente`);
    return { dispatched, still_waiting: stillWaiting };
  }

  private getOrCreateLock(chatId: string): Mutex {
    let mutex = this.chatDispatchLocks.get(chatId);
    if (!mutex) {
      mutex = new Mutex();
      this.chatDispatchLocks.set(chatId, mutex);
    }
    return mutex;
  }

  private releaseLock(chatId: string, mutex: Mutex): void {
    if (!mutex.isLocked()) {
      this.chatDispatchLocks.delete(chatId);
    }
  }
}
