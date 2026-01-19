import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignmentService } from '../services/assignment/assignment.service';
import { QueueService } from '../services/queue/queue.service';
import { PendingMessageService } from '../services/pending/pending-message.service';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';

@Injectable()
export class DispatcherOrchestrator {
  constructor(
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    private readonly assignmentService: AssignmentService,
    private readonly queueService: QueueService,
    private readonly pendingMessageService: PendingMessageService,
    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly messageGateway: WhatsappMessageGateway,
  ) {}

  /**
   * Main entry point for handling an incoming message.
   * It orchestrates the process of assigning or updating a conversation.
   * @returns {Promise<boolean>} - True if the message was assigned, false if it was pended.
   */
  async handleIncomingMessage(
    clientPhone: string,
    clientName: string,
    content: string,
    messageType: string,
    mediaUrl?: string,
  ): Promise<boolean> {
    const conversation = await this.chatRepository.findOne({
      where: { chat_id: clientPhone },
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
        const updatedChat = { ...conversation };
        updatedChat.unread_count = (conversation.unread_count || 0) + 1;
        updatedChat.last_activity_at = new Date();
        if (updatedChat.status === WhatsappChatStatus.FERME) {
            updatedChat.status = WhatsappChatStatus.ACTIF;
        }
        const savedUpdatedChat = await this.chatRepository.save(updatedChat);
        this.messageGateway.server
          .to(`commercial:${decision.agentId}`)
          .emit('conversation:updated', savedUpdatedChat);
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

          this.messageGateway.server
            .to(`commercial:${oldAgentId}`)
            .emit('conversation:removed', savedAssignedChat.id); // Or a more specific event
          this.messageGateway.server
            .to(`commercial:${decision.agentId}`)
            .emit('conversation:new', savedAssignedChat);

        } else {
          const newChat = this.chatRepository.create({
            chat_id: clientPhone,
            name: clientName,
            commercial_id: decision.agentId,
            status: WhatsappChatStatus.EN_ATTENTE,
            type: 'private',
            unread_count: 1,
            last_activity_at: new Date(),
          });
          savedAssignedChat = await this.chatRepository.save(newChat);
          this.messageGateway.server
            .to(`commercial:${decision.agentId}`)
            .emit('conversation:new', savedAssignedChat);
        }

        await this.queueService.moveToEnd(decision.agentId);
        return true;

      case 'PENDING':
        await this.pendingMessageService.addPendingMessage(
          clientPhone,
          clientName,
          content,
          messageType,
          mediaUrl || '',
        );
        // Emitting to a general 'admins' room
        this.messageGateway.server
          .to('admins')
          .emit('pending:messages:count', await this.pendingMessageService.getPendingMessages().then(p => p.length));
        return false;
    }
  }

  /**
   * Distributes all pending messages when an agent becomes available.
   */
  async distributePendingMessages(): Promise<void> {
    const pendingMessages = await this.pendingMessageService.getPendingMessages();
    for (const message of pendingMessages) {
        const wasAssigned = await this.handleIncomingMessage(
            message.clientPhone,
            message.clientName,
            message.content,
            message.type,
            message.mediaUrl,
        );
        if (wasAssigned) {
            await this.pendingMessageService.removePendingMessage(message.id);
        }
    }
  }

    /**
     * Handles the logic when a commercial agent connects.
     */
    async handleUserConnected(userId: string): Promise<void> {
        await this.queueService.addToQueue(userId);
        await this.distributePendingMessages();
        this.messageGateway.server.emit('queue:updated', await this.queueService.getQueuePositions());
    }

    /**
     * Handles the logic when a commercial agent disconnects.
     */
    async handleUserDisconnected(userId: string): Promise<void> {
        await this.queueService.removeFromQueue(userId);
        this.messageGateway.server.emit('queue:updated', await this.queueService.getQueuePositions());
    }
}
