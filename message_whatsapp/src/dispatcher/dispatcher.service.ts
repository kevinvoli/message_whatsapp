import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueueService } from './services/queue.service';
import { PendingMessage } from './entities/pending-message.entity';
import { WhatsappMessageGateway } from '../whatsapp_message/whatsapp_message.gateway';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CreateWhatsappChatDto } from 'src/whatsapp_chat/dto/create-whatsapp_chat.dto';
// import { CreateWhatsappChatDto } from 'src/whatsapp_chat/dto/create-whatsapp_chat.dto';

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
  ) {}

  async assignConversation(
    clientPhone: string,
    clientName: string,
    content: string,
    messageType: string,
    mediaUrl?: string,
  ): Promise<WhatsappChat | null> {
    let conversation = await this.chatRepository.findOne({
      where: { chat_id: clientPhone },
    });

    // If conversation exists and its agent is connected, do nothing.
    if (
      conversation &&
      conversation.commercial &&
      this.messageGateway.isAgentConnected(conversation.commercial.id)
    ) {
      return conversation;
    }

    const nextAgent = await this.queueService.getNextInQueue();

    if (!nextAgent) {
      await this.addPendingMessage(
        clientPhone,
        clientName,
        content,
        messageType,
        mediaUrl || '',
      );
      return null;
    }

    if (conversation) {
      // Re-assign the conversation if the agent is different or disconnected
      if (conversation.commercial_id !== nextAgent.id) {
        conversation.commercial_id = nextAgent.id;
        conversation = await this.chatRepository.save(conversation);
      }
    } else {
      // Create a new conversation
      const createDto: CreateWhatsappChatDto = {
        chat_id: clientPhone,
        name: clientName, // This should be improved later
        commercial_id: nextAgent.id,
        status: 'open',
        type: '',
        chat_pic: '',
        chat_pic_full: '',
        is_pinned: '',
        is_muted: '',
        mute_until: '',
        is_archived: '',
        unread_count: '',
        unread_mention: '',
        read_only: '',
        not_spam: '',
        last_activity_at: '',
        contact_client: '',
        created_at: '',
        updated_at: '',
      };

      const existingChat = await this.chatRepository.findOne({
        where: { chat_id: createDto.chat_id },
      });
      if (existingChat) {
        // Mettez à jour le chat existant
        await this.chatRepository.update(existingChat.id, createDto);
        // Récupérez l'entité mise à jour
        return await this.chatRepository.findOne({
          where: { id: existingChat.id },
        });
      } else {
        // Créez un nouveau chat
        const newChat = this.chatRepository.create(createDto);
        return await this.chatRepository.save(newChat);
      }
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
