import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueueService } from './services/queue.service';
import { PendingMessage } from './entities/pending-message.entity';
import { WhatsappMessageGateway } from '../whatsapp_message/whatsapp_message.gateway';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CreateWhatsappChatDto } from 'src/whatsapp_chat/dto/create-whatsapp_chat.dto';
import { WhatsappCommercialService } from '../whatsapp_commercial/whatsapp_commercial.service';

@Injectable()
export class DispatcherService {
 
  constructor(
    @InjectRepository(PendingMessage)
    private readonly pendingMessageRepository: Repository<PendingMessage>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
    private readonly queueService: QueueService,
    @Inject(forwardRef(() => WhatsappMessageGateway))
    private readonly messageGateway: WhatsappMessageGateway,

    private readonly WhatsappCommercialService: WhatsappCommercialService,
  ) {}

  async assignConversation(
    clientPhone: string,
    clientName: string,
    content: string,
    messageType: string,
    mediaUrl?: string,
  ): Promise<WhatsappChat | null> {
    const conversation = await this.chatRepository.findOne({
      where: { chatId: clientPhone },
      relations: ['commercial', 'messages'],
    });

    const isConnected = conversation?.commercial?.id
      ? this.messageGateway.isAgentConnected(conversation.commercial.id)
      : false;

    // If conversation exists and its agent is connected, update it.
    if (conversation && isConnected) {
      conversation.unreadCount += 1; // Correctly increment the number
      conversation.lastActivityAt = new Date();
      if (conversation.status === WhatsappChatStatus.FERME) {
        conversation.status = WhatsappChatStatus.ACTIF;
      }
      return this.chatRepository.save(conversation);
    }

    // Find the next available agent.
    const nextAgent = await this.queueService.getNextInQueue();
    if (!nextAgent) {
      // If no agent is available, queue the message.
      await this.addPendingMessage(clientPhone, clientName, content, messageType, mediaUrl || '');
      return null;
    }

    if (conversation) {
      // Re-assign the existing conversation to the new agent.
      conversation.commercialId = nextAgent.id;
      conversation.status = WhatsappChatStatus.EN_ATTENTE;
      conversation.unreadCount = 1; // Assign a number
      conversation.lastActivityAt = new Date();
      return this.chatRepository.save(conversation);
    } else {
      // Create a new conversation for the new agent.
      const createDto: Partial<WhatsappChat> = {
        chatId: clientPhone,
        name: clientName,
        commercialId: nextAgent.id,
        status: WhatsappChatStatus.EN_ATTENTE,
        type: 'private',
        unreadCount: 1, // Assign a number
        lastActivityAt: new Date(),
        contactClient: clientPhone,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const newChat = this.chatRepository.create(createDto);
      return this.chatRepository.save(newChat);
    }
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
