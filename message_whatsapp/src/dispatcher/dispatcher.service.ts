import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { WhatsappChat, WhatsappChatStatus } from "src/whatsapp_chat/entities/whatsapp_chat.entity";
import { Repository } from "typeorm";
import { QueueService } from "./services/queue.service";
import { PendingMessageService } from "./services/pending-message.service";
import { WhatsappMessageGateway } from "src/whatsapp_message/whatsapp_message.gateway";
import { WhatsappCommercialService } from "src/whatsapp_commercial/whatsapp_commercial.service";

@Injectable()
export class DispatcherService {
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,

    private readonly queueService: QueueService,

    private readonly pendingMessageService: PendingMessageService,

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
    content: string,
    messageType: string,
    mediaUrl?: string,
  ): Promise<WhatsappChat | null> {

    const conversation = await this.chatRepository.findOne({
      where: { chat_id: clientPhone },
      relations: ['commercial'],
    });

    const agentId = conversation?.commercial?.id;
    const isAgentConnected = agentId
      ? this.messageGateway.isAgentConnected(agentId)
      : false;

    /**
     * ✅ Cas 1 : conversation existante + agent connecté
     */
    if (conversation && isAgentConnected) {
      conversation.unread_count += 1;
      conversation.last_activity_at = new Date();

      if (conversation.status === WhatsappChatStatus.FERME) {
        conversation.status = WhatsappChatStatus.ACTIF;
      }

      return this.chatRepository.save(conversation);
    }

    /**
     * 🔍 Chercher un agent disponible
     */
    const nextAgent = await this.queueService.getNextInQueue();

    /**
     * ❌ Aucun agent → message en attente (via PendingMessageService)
     */
    if (!nextAgent) {
      await this.pendingMessageService.createIncomingMessage({
        conversationId: clientPhone,
        content,
        type: messageType as any,
        mediaUrl,
      });

      return null;
    }

    /**
     * 🔁 Réassignation ou création de conversation
     */
    const chat =
      conversation ??
      this.chatRepository.create({
        chat_id: clientPhone,
        name: clientName,
        type: 'private',
        contact_client: clientPhone,
        createdAt: new Date(),
      });

    chat.commercial_id = nextAgent.id;
    chat.status = WhatsappChatStatus.EN_ATTENTE;
    chat.unread_count = 1;
    chat.last_activity_at = new Date();

    return this.chatRepository.save(chat);
  }

  /**
   * 🔁 Redistribution des messages en attente
   * ⚠️ À appeler quand un agent devient disponible
   */
  async distributePendingMessages(): Promise<void> {
    while (true) {
      const pending =
        await this.pendingMessageService.lockNextPendingMessage();

      if (!pending) break;

      const conversation = await this.assignConversation(
        pending.conversationId,
        'Client',
        pending.content,
        pending.type,
        pending.mediaUrl,
      );

      if (conversation) {
        await this.pendingMessageService.markAsDispatched(pending.id);
      }
    }
  }
}

