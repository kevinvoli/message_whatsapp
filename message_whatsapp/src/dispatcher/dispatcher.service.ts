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
  ): Promise<WhatsappChat | null> {
    return this.dispatchLock.runExclusive(() =>
      this.assignConversationInternal(clientPhone, clientName, traceId),
    );
  }

  private async assignConversationInternal(
    clientPhone: string,
    clientName: string,
    traceId?: string,
  ): Promise<WhatsappChat | null> {
    if (traceId) {
      this.logger.log(`DISPATCH_START trace=${traceId} chat_id=${clientPhone}`);
    }

    const conversation = await this.chatRepository.findOne({
      where: { chat_id: clientPhone },
      relations: ['messages', 'poste'],
    });

    if (conversation?.read_only) {
      this.logger.warn(
        `Conversation read_only ignoree (${conversation.chat_id})`,
      );
      return null;
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
      
      conversation.unread_count += 1;
      conversation.last_activity_at = new Date();
      if (!conversation.first_response_deadline_at && !conversation.last_poste_message_at) {
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
      return this.chatRepository.save(conversation);
    }

    const nextAgent = await this.queueService.getNextInQueue();
    // Aucun agent disponible → message en attente
    if (!nextAgent) {
      this.logger.warn(`⏳ Aucun agent disponible, message en attente pour `);

      return null;
    }

    
    /**
     * Cas 3️⃣ : conversation existante mais poste absent ou réassignation
     */
    // console.log('conversation :', conversation);

    if (conversation) {
      this.logger.log(
        `🔁 Réassignation conversation (${conversation.chat_id}) de l'agent (${  'aucun'}) à (${nextAgent.name})`,
      );
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
        Date.now() + 5 * 60* 1000,
      );
     
      conversation.last_client_message_at = new Date();
      return this.chatRepository.save(conversation);
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
      type: 'private',
      contact_client:  clientPhone.split('@')[0],
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
      first_response_deadline_at:  new Date(
        Date.now() + 5 * 60* 1000,
      ),
     
      last_client_message_at: new Date(),
    });

    this.logger.debug(
      `Nouvelle conversation creee (${newChat.chat_id})`,
    );

    return this.chatRepository.save(newChat);
  }


  async reinjectConversation(chat: WhatsappChat) {
    if (chat.read_only) {
      this.logger.warn(
        `Reinjection ignoree: conversation read_only (${chat.chat_id})`,
      );
      return;
    }
    await this.chatRepository.update(chat.id, {
      poste: null,
      poste_id: null,
      assigned_mode: null,
      assigned_at: null,
      first_response_deadline_at: null,
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
    if (!nextPoste) return;

    await this.chatRepository.update(chat.id, {
      poste: nextPoste,
      poste_id: nextPoste.id,
      assigned_mode: nextPoste.is_active ? 'ONLINE' : 'OFFLINE',
      status: nextPoste.is_active
        ? WhatsappChatStatus.ACTIF
        : WhatsappChatStatus.EN_ATTENTE,
      assigned_at: new Date(),
      first_response_deadline_at:  new Date(
        Date.now() + 5 * 60* 1000,
      )
    });

    const updatedChat = await this.chatRepository.findOne({
      where: { chat_id: chat.chat_id },
      relations: ['poste', 'messages'],
    });

    if (!updatedChat) {
      return;
    }
    // 🔥 EVENT CENTRAL
    this.messageGateway.emitConversationReassigned(
      updatedChat,
      oldPoste,
      nextPoste.id,
    );
  }

  async jobRunnertcheque(poste_id: string) {
    // console.log('mes verification sont ici', commercialId);

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
