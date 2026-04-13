import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { In, Repository } from 'typeorm';
import { Mutex } from 'async-mutex';
import { QueueService } from './services/queue.service';
import { ConversationPublisher } from 'src/realtime/publishers/conversation.publisher';
import { DispatchQueryService } from './infrastructure/dispatch-query.service';
import { AssignConversationUseCase } from './application/assign-conversation.use-case';
import { ReinjectConversationUseCase } from './application/reinject-conversation.use-case';
import { RedispatchWaitingUseCase } from './application/redispatch-waiting.use-case';
import { ResetStuckActiveUseCase } from './application/reset-stuck-active.use-case';

/**
 * Façade — conserve l'API publique existante et délègue aux use cases.
 * Gère également les mutex par conversation pour éviter les courses.
 */
@Injectable()
export class DispatcherService {
  private readonly logger = new Logger(DispatcherService.name);
  private readonly chatDispatchLocks = new Map<string, Mutex>();
  /** Mutex léger pour éviter l'overlap du cron SLA */
  private isSlaRunning = false;

  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,

    private readonly queueService: QueueService,

    private readonly conversationPublisher: ConversationPublisher,

    private readonly queryService: DispatchQueryService,

    private readonly assignUseCase: AssignConversationUseCase,
    private readonly reinjectUseCase: ReinjectConversationUseCase,
    private readonly redispatchUseCase: RedispatchWaitingUseCase,
    private readonly resetStuckUseCase: ResetStuckActiveUseCase,
  ) {}

  // ─── Mutex helpers ───────────────────────────────────────────────────────────

  private getChatDispatchLock(chatId: string): Mutex {
    let mutex = this.chatDispatchLocks.get(chatId);
    if (!mutex) {
      mutex = new Mutex();
      this.chatDispatchLocks.set(chatId, mutex);
    }
    return mutex;
  }

  // ─── API publique (façade) ───────────────────────────────────────────────────

  async assignConversation(
    clientPhone: string,
    clientName: string,
    traceId?: string,
    tenantId?: string,
    channelId?: string,
  ): Promise<WhatsappChat | null> {
    const lock = this.getChatDispatchLock(clientPhone);
    try {
      return await lock.runExclusive(() =>
        this.assignUseCase.execute(clientPhone, clientName, traceId, tenantId, channelId),
      );
    } finally {
      if (!lock.isLocked()) this.chatDispatchLocks.delete(clientPhone);
    }
  }

  async reinjectConversation(
    chat: WhatsappChat,
    skipEmit = false,
  ): Promise<{ oldPosteId: string; newPosteId: string } | null> {
    return this.reinjectUseCase.execute(chat, skipEmit);
  }

  async dispatchOrphanConversation(chat: WhatsappChat): Promise<void> {
    if (chat.read_only) {
      this.logger.warn(`Dispatch orphelin ignoré: conversation read_only (${chat.chat_id})`);
      return;
    }
    const nextPoste = await this.queueService.getNextInQueue();
    if (!nextPoste) {
      this.logger.warn(`⏳ Aucun agent disponible pour orphelin (${chat.chat_id}), reste EN_ATTENTE`);
      return;
    }
    await this.chatRepository.update(chat.id, {
      poste: nextPoste,
      poste_id: nextPoste.id,
      assigned_mode: nextPoste.is_active ? 'ONLINE' : 'OFFLINE',
      status: nextPoste.is_active ? WhatsappChatStatus.ACTIF : WhatsappChatStatus.EN_ATTENTE,
      assigned_at: new Date(),
      first_response_deadline_at: new Date(Date.now() + 5 * 60 * 1000),
    });
    await this.conversationPublisher.emitConversationAssigned(chat.chat_id);
    this.logger.log(`Orphelin dispatché (${chat.chat_id}) → poste ${nextPoste.id}`);
  }

  async dispatchExistingConversation(chat: WhatsappChat): Promise<void> {
    const oldPoste = chat.poste_id;
    if (chat.read_only) {
      this.logger.warn(`Dispatch ignoré: conversation read_only (${chat.chat_id})`);
      return;
    }
    if (!oldPoste) return;

    const nextPoste = await this.queueService.getNextInQueue();
    if (!nextPoste) {
      this.logger.warn(`⏳ Aucun agent disponible pour réinjecter (${chat.chat_id}), passage EN_ATTENTE`);
      await this.conversationPublisher.emitConversationRemoved(chat.chat_id, oldPoste);
      return;
    }
    await this.chatRepository.update(chat.id, {
      poste: nextPoste,
      poste_id: nextPoste.id,
      assigned_mode: nextPoste.is_active ? 'ONLINE' : 'OFFLINE',
      status: nextPoste.is_active ? WhatsappChatStatus.ACTIF : WhatsappChatStatus.EN_ATTENTE,
      assigned_at: new Date(),
      first_response_deadline_at: new Date(Date.now() + 15 * 60 * 1000),
    });
    const updatedChat = await this.chatRepository.findOne({
      where: { chat_id: chat.chat_id },
      relations: ['poste'],
    });
    if (!updatedChat) return;
    await this.conversationPublisher.emitConversationReassigned(updatedChat, oldPoste, nextPoste.id);
  }

  async jobRunnertcheque(poste_id: string): Promise<void> {
    const chats = await this.queryService.findActiveChatsByPoste(poste_id);
    this.logger.debug(`Vérification SLA réponses (${poste_id}) - ${chats.length} conversations`);
    for (const chat of chats) {
      await this.reinjectUseCase.execute(chat);
    }
  }

  async jobRunnerAllPostes(thresholdMinutes = 121): Promise<string> {
    if (this.isSlaRunning) {
      this.logger.warn('SLA checker déjà en cours — cycle ignoré');
      return 'Ignoré — cycle précédent encore en cours';
    }
    this.isSlaRunning = true;
    try {
      const threshold = new Date(Date.now() - thresholdMinutes * 60_000);
      const chats = await this.queryService.findChatsByStatus(
        [WhatsappChatStatus.EN_ATTENTE, WhatsappChatStatus.ACTIF],
        { olderThan: threshold, limit: 50 },
      );
      this.logger.debug(`Vérification SLA globale — ${chats.length} conversation(s) ciblée(s)`);

      const reassignments: Array<{ chatId: string; oldPosteId: string; newPosteId: string }> = [];
      let reinjected = 0;

      for (const chat of chats) {
        try {
          const result = await this.reinjectUseCase.execute(chat, true);
          if (result) {
            reassignments.push({ chatId: chat.chat_id, ...result });
            reinjected++;
          }
        } catch (err) {
          this.logger.warn(`SLA reinject error (chat ${chat.id}): ${String(err)}`);
        }
      }

      if (reassignments.length > 0) {
        await this.conversationPublisher.emitBatchReassignments(reassignments);
      }

      return `${reinjected} conversation(s) réinjectée(s) sur ${chats.length} ciblée(s)`;
    } finally {
      this.isSlaRunning = false;
    }
  }

  async redispatchWaiting(): Promise<{ dispatched: number; still_waiting: number }> {
    return this.redispatchUseCase.execute();
  }

  async resetStuckActiveToWaiting(): Promise<{ reset: number }> {
    return this.resetStuckUseCase.execute();
  }

  async getDispatchSnapshot(): Promise<{
    queue_size: number;
    waiting_count: number;
    stuck_active_count: number;
    waiting_items: WhatsappChat[];
  }> {
    const queue = await this.queueService.getQueuePositions();
    const waitingChats = await this.queryService.findWaitingChatsWithPoste();
    const activeChats = await this.queryService.findActiveChatsWithPoste();
    const stuckActiveCount = activeChats.filter((c) => !c.poste || !c.poste.is_active).length;

    // Limiter la liste des waiting à 50, triée par date de mise à jour
    const waitingItems = waitingChats
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 50);

    return {
      queue_size: queue.length,
      waiting_count: waitingChats.length,
      stuck_active_count: stuckActiveCount,
      waiting_items: waitingItems,
    };
  }
}
