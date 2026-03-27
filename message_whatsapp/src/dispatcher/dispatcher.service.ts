import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  WhatsappChat,
  WhatsappChatStatus,
} from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { Mutex } from 'async-mutex';
import { QueueService } from './services/queue.service';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { NotificationService } from 'src/notification/notification.service';

@Injectable()
export class DispatcherService {
  private readonly logger = new Logger(DispatcherService.name);
  private readonly dispatchLock = new Mutex();
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,

    private readonly queueService: QueueService,

    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly messageGateway: WhatsappMessageGateway,

    private readonly whatsappCommercialService: WhatsappCommercialService,

    private readonly notificationService: NotificationService,
  ) {}

  /**
   * 🎯 Décide si un message peut être assigné à un agent
   * ❌ N’émet PAS de socket
   * ❌ Ne sauvegarde PAS le message WhatsApp
   */

  async assignConversation(
    clientPhone: string,
    clientName: string,
    traceId?: string,
    tenantId?: string,
  ): Promise<WhatsappChat | null> {
    return this.dispatchLock.runExclusive(() =>
      this.assignConversationInternal(
        clientPhone,
        clientName,
        traceId,
        tenantId,
      ),
    );
  }

  private async assignConversationInternal(
    clientPhone: string,
    clientName: string,
    traceId?: string,
    tenantId?: string,
  ): Promise<WhatsappChat | null> {
    if (traceId) {
      this.logger.log(`DISPATCH_START trace=${traceId} chat_id=${clientPhone}`);
    }

    const conversation = await this.chatRepository.findOne({
      where: { chat_id: clientPhone },
      relations: ['messages', 'poste', 'channel'],
    });

    if (conversation?.read_only) {
      this.logger.warn(
        `Conversation read_only ignoree (${conversation.chat_id})`,
      );
      conversation.unread_count = (conversation.unread_count ?? 0) + 1;
      conversation.last_activity_at = new Date();
      // conversation.last_client_message_at = new Date();
      await this.chatRepository.save(conversation);
      return conversation;
    }

    // console.log("=========================== conversation", conversation);

    // Déterminer si l'agent actuel est connecté
    const currentPosteId = conversation?.poste?.id;
    const isAgentConnected = currentPosteId
      ? this.messageGateway.isAgentConnected(currentPosteId)
      : false;

    /**
     * Cas 1️⃣ : conversation existante + agent connecté
     * → juste mettre à jour l’activité et le compteur de messages non lus
     */
    if (conversation && isAgentConnected) {
      this.logger.debug(
        `Conversation existante avec agent connecte (${conversation.chat_id})`,
      );

      if (tenantId && !conversation.tenant_id) {
        conversation.tenant_id = tenantId;
      }
      conversation.unread_count += 1;
      conversation.last_activity_at = new Date();
      if (
        !conversation.first_response_deadline_at &&
        !conversation.last_poste_message_at
      ) {
        conversation.first_response_deadline_at = new Date(
          Date.now() + 5 * 60 * 1000,
        );
      }
      if (conversation.status === WhatsappChatStatus.FERME) {
        conversation.status = WhatsappChatStatus.ACTIF;
      }
      if (!conversation.poste) {
        this.logger.warn(
          `📩 Conversation ${conversation.chat_id} sans commercial (réinjection ou offline)`,
        );
      }
      this.logger.log(
        `📩 Conversation (${conversation.chat_id}) assignée à ${conversation?.poste?.name ?? 'NON ASSIGNE'}`,
      );
      const saved = await this.chatRepository.save(conversation);
      await this.messageGateway.emitConversationUpsertByChatId(
        saved.chat_id,
      );
      return saved;
    }

    const nextAgent = await this.queueService.getNextInQueue();
    // Aucun agent disponible → message en attente
    if (!nextAgent) {
      this.logger.warn(`⏳ Aucun agent disponible, message en attente pour `);
      const displayName = clientName || clientPhone.split('@')[0];
      void this.notificationService.create(
        'queue',
        `Conversation en attente — ${displayName}`,
        `Aucun agent disponible. La conversation de ${displayName} est placée en file d'attente.`,
      );
      if (conversation) {
        if (tenantId && !conversation.tenant_id) {
          conversation.tenant_id = tenantId;
        }
        conversation.poste = null;
        conversation.poste_id = null;
        conversation.status = WhatsappChatStatus.EN_ATTENTE;
        conversation.unread_count += 1;
        conversation.last_activity_at = new Date();
        conversation.assigned_at = null;
        conversation.assigned_mode = null;
        conversation.first_response_deadline_at = null;
        conversation.last_client_message_at = new Date();
        return this.chatRepository.save(conversation);
      }

      const waitingChat = this.chatRepository.create({
        chat_id: clientPhone,
        name: clientName,
        tenant_id: tenantId ?? null,
        type: 'private',
        contact_client: clientPhone.split('@')[0],
        poste: null,
        poste_id: null,
        status: WhatsappChatStatus.EN_ATTENTE,
        unread_count: 1,
        last_activity_at: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        assigned_at: null,
        assigned_mode: null,
        first_response_deadline_at: null,
        last_client_message_at: new Date(),
      });

      this.logger.log(
        `🆕 Creation conversation en attente (sans agent) pour ${clientPhone}`,
      );
      return this.chatRepository.save(waitingChat);
    }

    /**
     * Cas 3️⃣ : conversation existante mais poste absent ou réassignation
     */
    // console.log('conversation :', conversation);

    if (conversation) {
      this.logger.log(
        `🔁 Réassignation conversation (${conversation.chat_id}) de l'agent (${'aucun'}) à (${nextAgent.name})`,
      );
      if (tenantId && !conversation.tenant_id) {
        conversation.tenant_id = tenantId;
      }
      conversation.poste = nextAgent;
      conversation.poste_id = nextAgent.id;
      conversation.status = nextAgent.is_active
        ? WhatsappChatStatus.ACTIF
        : WhatsappChatStatus.EN_ATTENTE;
      conversation.unread_count += 1;
      conversation.last_activity_at = new Date();
      conversation.assigned_at = new Date();
      conversation.assigned_mode = nextAgent.is_active ? 'ONLINE' : 'OFFLINE';
      conversation.first_response_deadline_at = new Date(
        Date.now() + 5 * 60 * 1000,
      );

      conversation.last_client_message_at = new Date();
      const saved = await this.chatRepository.save(conversation);
      void this.notificationService.create(
        'info',
        `Conversation réassignée — ${saved.name || saved.chat_id}`,
        `La conversation de ${saved.name || saved.contact_client} a été assignée au poste ${nextAgent.name}.`,
      );
      await this.messageGateway.emitConversationUpsertByChatId(
        saved.chat_id,
      );
      return saved;
    }

    /**
     * Cas 4️⃣ : nouvelle conversation
     */
    this.logger.log(
      `🆕 Création nouvelle conversation pour ${clientPhone} avec agent (${nextAgent.name})`,
    );

    const newChat = this.chatRepository.create({
      chat_id: clientPhone,
      name: clientName,
      tenant_id: tenantId ?? null,
      type: 'private',
      contact_client: clientPhone.split('@')[0],
      poste: nextAgent,
      poste_id: nextAgent.id,
      status: nextAgent.is_active
        ? WhatsappChatStatus.ACTIF
        : WhatsappChatStatus.EN_ATTENTE,
      unread_count: 1,
      last_activity_at: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      assigned_at: new Date(),
      assigned_mode: nextAgent.is_active ? 'ONLINE' : 'OFFLINE',
      first_response_deadline_at: new Date(Date.now() + 5 * 60 * 1000),

      last_client_message_at: new Date(),
    });

    this.logger.debug(`Nouvelle conversation creee (${newChat.chat_id})`);

    const saved = await this.chatRepository.save(newChat);
    void this.notificationService.create(
      'info',
      `Nouvelle conversation — ${clientName || clientPhone.split('@')[0]}`,
      `Nouvelle conversation de ${clientName || clientPhone.split('@')[0]} assignée au poste ${nextAgent.name}.`,
    );
    await this.messageGateway.emitConversationAssigned(saved.chat_id);
    return saved;
  }

  async reinjectConversation(chat: WhatsappChat) {
    if (chat.read_only) {
      this.logger.warn(
        `Reinjection ignoree: conversation read_only (${chat.chat_id})`,
      );
      return;
    }

    // Si le poste actuel est le seul dans la queue, un redispatch lui
    // renverrait la conversation immédiatement — sans aucun bénéfice.
    // On renouvelle simplement la deadline pour éviter que le job ne
    // se déclenche en boucle, et on attend qu'un autre poste se connecte.
    if (chat.poste_id) {
      const alternatives =
        await this.queueService.countQueuedPostesExcluding(chat.poste_id);
      if (alternatives === 0) {
        this.logger.debug(
          `Redispatch ignoré (${chat.chat_id}): le poste (${chat.poste_id}) est le seul dans la queue`,
        );
        // Étendre à 30 min pour éviter de re-trigger le SLA checker (intervalle 5 min)
        // à chaque cycle sans qu'aucune action ne soit possible.
        await this.chatRepository.update(chat.id, {
          first_response_deadline_at: new Date(Date.now() + 30 * 60 * 1000),
        });
        return;
      }
    }

    await this.chatRepository.update(chat.id, {
      poste: null,
      poste_id: null,
      assigned_mode: null,
      assigned_at: null,
      first_response_deadline_at: null,
      status: WhatsappChatStatus.EN_ATTENTE,
    });

    // Relancer le dispatcher SANS faux message
    await this.dispatchExistingConversation(chat);
  }

  async dispatchExistingConversation(chat: WhatsappChat) {
    const oldPoste = chat.poste_id;
    if (chat.read_only) {
      this.logger.warn(
        `Dispatch ignore: conversation read_only (${chat.chat_id})`,
      );
      return;
    }
    if (!oldPoste) {
      return;
    }
    const nextPoste = await this.queueService.getNextInQueue();
    if (!nextPoste) {
      // Aucun agent disponible : notifier l'ancien poste que la conversation
      // passe en attente, sinon elle reste visible comme fantôme sur son interface.
      this.logger.warn(
        `⏳ Aucun agent disponible pour réinjecter (${chat.chat_id}), passage EN_ATTENTE`,
      );
      await this.messageGateway.emitConversationRemoved(chat.chat_id, oldPoste);
      return;
    }

    await this.chatRepository.update(chat.id, {
      poste: nextPoste,
      poste_id: nextPoste.id,
      assigned_mode: nextPoste.is_active ? 'ONLINE' : 'OFFLINE',
      status: nextPoste.is_active
        ? WhatsappChatStatus.ACTIF
        : WhatsappChatStatus.EN_ATTENTE,
      assigned_at: new Date(),
      first_response_deadline_at: new Date(Date.now() + 5 * 60 * 1000),
    });

    const updatedChat = await this.chatRepository.findOne({
      where: { chat_id: chat.chat_id },
      relations: ['poste', 'messages'],
    });

    if (!updatedChat) {
      return;
    }
    // Notification unique lors d'une réassignation SLA effective
    void this.notificationService.create(
      'alert',
      `SLA dépassé — ${updatedChat.name || updatedChat.chat_id}`,
      `La conversation de ${updatedChat.name || updatedChat.contact_client || updatedChat.chat_id.split('@')[0]} n'a pas reçu de réponse dans les délais. Réassignée au poste ${nextPoste.name}.`,
    );

    // 🔥 EVENT CENTRAL
    await this.messageGateway.emitConversationReassigned(
      updatedChat,
      oldPoste,
      nextPoste.id,
    );
  }

  async jobRunnertcheque(poste_id: string) {
    const now = new Date();

    const chats = await this.chatRepository.find({
      where: {
        poste_id: poste_id,
        status: In([WhatsappChatStatus.EN_ATTENTE, WhatsappChatStatus.ACTIF]),
        last_poste_message_at: IsNull(),
        first_response_deadline_at: LessThan(now),
      },
    });
    this.logger.debug(
      `Verification SLA reponses (${poste_id}) - ${chats.length} conversations`,
    );

    for (const chat of chats) {
      await this.reinjectConversation(chat);
    }
  }

  /** Vérifie le SLA sur TOUS les postes — utilisé par le cron centralisé. */
  async jobRunnerAllPostes(): Promise<void> {
    const now = new Date();

    const chats = await this.chatRepository.find({
      where: {
        status: In([WhatsappChatStatus.EN_ATTENTE, WhatsappChatStatus.ACTIF]),
        last_poste_message_at: IsNull(),
        first_response_deadline_at: LessThan(now),
      },
    });
    this.logger.debug(`Vérification SLA globale — ${chats.length} conversation(s) expirée(s)`);

    for (const chat of chats) {
      try {
        await this.reinjectConversation(chat);
      } catch (err) {
        this.logger.warn(`SLA reinject error (chat ${chat.id}): ${String(err)}`);
      }
    }
  }

  async redispatchWaiting(): Promise<{ dispatched: number; still_waiting: number }> {
    const waitingChats = await this.chatRepository.find({
      where: { status: WhatsappChatStatus.EN_ATTENTE, poste_id: IsNull() },
    });

    let dispatched = 0;
    for (const chat of waitingChats) {
      if (chat.read_only) continue;
      const assigned = await this.dispatchLock.runExclusive(async () => {
        const nextAgent = await this.queueService.getNextInQueue();
        if (!nextAgent) return false;

        await this.chatRepository.update(chat.id, {
          poste: nextAgent,
          poste_id: nextAgent.id,
          status: nextAgent.is_active
            ? WhatsappChatStatus.ACTIF
            : WhatsappChatStatus.EN_ATTENTE,
          assigned_at: new Date(),
          assigned_mode: nextAgent.is_active ? 'ONLINE' : 'OFFLINE',
          first_response_deadline_at: new Date(Date.now() + 5 * 60 * 1000),
        });

        await this.messageGateway.emitConversationAssigned(chat.chat_id);
        void this.notificationService.create(
          'info',
          `Conversation assignée (manuel) — ${chat.name || chat.chat_id}`,
          `Assignée au poste ${nextAgent.name}.`,
        );
        return true;
      });

      if (!assigned) break;
      dispatched++;
    }

    this.logger.log(
      `Redispatch manuel: ${dispatched} assignées, ${waitingChats.length - dispatched} toujours en attente`,
    );
    return { dispatched, still_waiting: waitingChats.length - dispatched };
  }

  async getDispatchSnapshot(): Promise<{
    queue_size: number;
    waiting_count: number;
    waiting_items: WhatsappChat[];
  }> {
    const queue = await this.queueService.getQueuePositions();
    const waitingChats = await this.chatRepository.find({
      where: { status: WhatsappChatStatus.EN_ATTENTE },
      relations: ['poste'],
      order: { updatedAt: 'DESC' },
      take: 50,
    });

    return {
      queue_size: queue.length,
      waiting_count: waitingChats.length,
      waiting_items: waitingChats,
    };
  }
}
