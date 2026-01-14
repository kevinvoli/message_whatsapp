import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueueService } from './services/queue.service';
import { PendingMessage } from './entities/pending-message.entity';
import { WhatsappConversation } from '../whatsapp_conversation/entities/whatsapp_conversation.entity';
import { WhatsappConversationService } from '../whatsapp_conversation/whatsapp_conversation.service';
import { CreateWhatsappConversationDto } from '../whatsapp_conversation/dto/create-whatsapp_conversation.dto';
import { WhatsappMessageGateway } from '../whatsapp_message/whatsapp_message.gateway';

@Injectable()
export class DispatcherService {
  constructor(
    @InjectRepository(PendingMessage)
    private readonly pendingMessageRepository: Repository<PendingMessage>,
    private readonly queueService: QueueService,
    private readonly conversationService: WhatsappConversationService,
    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly messageGateway: WhatsappMessageGateway,
  ) {}

  async assignConversation(
    clientPhone: string,
    clientName: string,
    content: string,
    messageType: string,
    mediaUrl?: string,
  ): Promise<WhatsappConversation | null> {
    let conversation = await this.conversationService.findByChatId(clientPhone);

    // If conversation exists and its agent is connected, do nothing.
    if (conversation && conversation.assigned_agent_id && this.messageGateway.isAgentConnected(conversation.assigned_agent_id)) {
      return conversation;
    }

    const nextAgent = await this.queueService.getNextInQueue();

    if (!nextAgent) {
      await this.addPendingMessage(clientPhone, clientName, content, messageType, mediaUrl || '');
      return null;
    }

    if (conversation) {
      // Re-assign the conversation if the agent is different or disconnected
      if (conversation.assigned_agent_id !== nextAgent.id) {
        conversation.assigned_agent_id = nextAgent.id;
        conversation = await this.conversationService.update(conversation.id, conversation);
      }
    } else {
      // Create a new conversation
      const createDto: CreateWhatsappConversationDto = {
        chat_id: clientPhone,
        customer_id: clientName, // This should be improved later
        assigned_agent_id: nextAgent.id,
        conversation_id: clientPhone, // This should be improved later
        status: 'open',
      };
      conversation = await this.conversationService.create(createDto);
    }

    return conversation;
  }

  async addPendingMessage(
    clientPhone: string,
    clientName: string,
    content: string,
    type: string,
    mediaUrl: string,
  ): Promise<PendingMessage> {
    const pendingMessage = this.pendingMessageRepository.create({
      clientPhone,
      clientName,
      content,
      type,
      mediaUrl,
    });
    return this.pendingMessageRepository.save(pendingMessage);
  }

  async distributePendingMessages(): Promise<void> {
    const pendingMessages = await this.pendingMessageRepository.find();
    for (const message of pendingMessages) {
      const conversation = await this.assignConversation(
        message.clientPhone,
        message.clientName,
        message.content,
        message.type,
        message.mediaUrl,
      );
      if (conversation) {
        await this.pendingMessageRepository.remove(message);
      }
    }
  }
}
