import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignmentService } from '../services/assignment/assignment.service';
import { QueueService } from '../services/queue/queue.service';
import { PendingMessageService } from '../services/pending/pending-message.service';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';
import { WhatsappMessageService } from 'src/whatsapp_message/whatsapp_message.service';
import { WhapiMessage, WhapiMessageType } from 'src/whapi/interface/whapi-webhook.interface';

@Injectable()
export class DispatcherOrchestrator {
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    private readonly assignmentService: AssignmentService,
    private readonly queueService: QueueService,
    private readonly pendingMessageService: PendingMessageService,
    private readonly whatsappMessageService: WhatsappMessageService,
    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly messageGateway: WhatsappMessageGateway,
  ) {}

  /**
   * Main entry point for handling an incoming message.
   * It orchestrates the process of assigning or updating a conversation.
   * @returns {Promise<boolean>} - True if the message was assigned, false if it was pended.
   */
  async handleIncomingMessage(
    message: WhapiMessage,
  ): Promise<boolean> {
    const conversation = await this.chatRepository.findOne({
      where: { chat_id: message.chat_id },
      relations: ['commercial'],
    });

    const isCurrentAgentConnected = conversation?.commercial?.id
      ? this.messageGateway.isAgentConnected(conversation.commercial.id)
      : false;

    const nextAvailableAgent = await this.queueService.getNextInQueue();

    const decision = this.assignmentService.decide({
      conversation,
      isCurrentAgentConnected,
      nextAvailableAgent,
    });

    switch (decision.type) {
      case 'KEEP_CURRENT_AGENT':
        if (conversation) {
            const updatedChat = { ...conversation };
            updatedChat.unread_count = (conversation.unread_count || 0) + 1;
            updatedChat.last_activity_at = new Date();
            if (updatedChat.status === WhatsappChatStatus.FERME) {
                updatedChat.status = WhatsappChatStatus.ACTIF;
            }
            const savedUpdatedChat = await this.chatRepository.save(updatedChat);
            await this.whatsappMessageService.saveIncomingFromWhapi(message, savedUpdatedChat);
            this.messageGateway.emitConversationUpdateToAgent(decision.agentId, savedUpdatedChat);
        }
        return true;

      case 'ASSIGN_NEW_AGENT':
        let savedAssignedChat;
        if (conversation) {
          const reAssignedChat = { ...conversation };
          const oldAgentId = reAssignedChat.commercial_id;
          reAssignedChat.commercial_id = decision.agentId;
          reAssignedChat.status = WhatsappChatStatus.EN_ATTENTE;
          reAssignedChat.unread_count = 1;
          reAssignedChat.last_activity_at = new Date();
          savedAssignedChat = await this.chatRepository.save(reAssignedChat);

          this.messageGateway.emitConversationRemovedToAgent(oldAgentId, savedAssignedChat.id);
          this.messageGateway.emitNewConversationToAgent(decision.agentId, savedAssignedChat);
          await this.whatsappMessageService.saveIncomingFromWhapi(message, savedAssignedChat);

        } else {
          const newChat = this.chatRepository.create({
            chat_id: message.chat_id,
            name: message.from_name ?? 'Client',
            commercial_id: decision.agentId,
            status: WhatsappChatStatus.EN_ATTENTE,
            type: 'private',
            unread_count: 1,
            last_activity_at: new Date(),
          });
          savedAssignedChat = await this.chatRepository.save(newChat);
          await this.whatsappMessageService.saveIncomingFromWhapi(message, savedAssignedChat);
          this.messageGateway.emitNewConversationToAgent(decision.agentId, savedAssignedChat);
        }

        await this.queueService.moveToEnd(decision.agentId);
        return true;

      case 'PENDING':
        await this.pendingMessageService.addPendingMessage(
          message.chat_id,
          message.from_name ?? 'Client',
          message.text?.body ?? '',
          message.type,
          message.image?.id || message.video?.id || message.audio?.id || message.document?.id || '',
        );
        // L'orchestrateur ne gère pas les rooms, donc nous émettons un événement général
        // que la gateway pourra interpréter si nécessaire (par exemple, pour notifier les admins).
        // Pour l'instant, nous nous concentrons sur les événements essentiels.
        return false;
    }
  }

  /**
   * Distributes all pending messages when an agent becomes available.
   */
  async distributePendingMessages(): Promise<void> {
    const pendingMessages = await this.pendingMessageService.getPendingMessages();
    for (const p_message of pendingMessages) {
        const whapiMessage: WhapiMessage = {
            id: `pending_${p_message.id}`,
            chat_id: p_message.clientPhone,
            from_name: p_message.clientName,
            from_me: false,
            type: p_message.type as WhapiMessageType,
            text: { body: p_message.content },
            source: 'pending',
            timestamp: new Date(p_message.receivedAt).getTime(),
            device_id: 0,
            chat_name: p_message.clientName,
            from: p_message.clientPhone,
        };

        const wasAssigned = await this.handleIncomingMessage(whapiMessage);
        if (wasAssigned) {
            await this.pendingMessageService.removePendingMessage(p_message.id);
        }
    }
  }

    /**
     * Handles the logic when a commercial agent connects.
     */
    async handleUserConnected(userId: string): Promise<void> {
        await this.queueService.addToQueue(userId);
        await this.distributePendingMessages();
        const queue = await this.queueService.getQueuePositions();
        this.messageGateway.emitQueueUpdateToAll(queue);
    }

    /**
     * Handles the logic when a commercial agent disconnects.
     */
    async handleUserDisconnected(userId: string): Promise<void> {
        await this.queueService.removeFromQueue(userId);
        const queue = await this.queueService.getQueuePositions();
        this.messageGateway.emitQueueUpdateToAll(queue);
    }
}
